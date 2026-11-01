import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
export const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
export const uid=()=>randomBytes(16).toString('hex');
export function failure(message,status=400){throw Object.assign(new Error(message),{status});}
export class Store {
 constructor(filename){
  if(filename!==':memory:')mkdirSync(path.dirname(filename),{recursive:true});
  this.db=new DatabaseSync(filename);this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;');
  this.db.exec(`
   CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT,role TEXT,name TEXT,expires INTEGER);
   CREATE TABLE IF NOT EXISTS states(user_id TEXT,course_id TEXT,concept_id TEXT,version INTEGER,data TEXT,PRIMARY KEY(user_id,course_id,concept_id));
   CREATE TABLE IF NOT EXISTS assignments(id TEXT PRIMARY KEY,user_id TEXT,course_id TEXT,item_id TEXT,hints INTEGER DEFAULT 0,full_solution INTEGER DEFAULT 0,created TEXT);
   CREATE TABLE IF NOT EXISTS submissions(id TEXT PRIMARY KEY,user_id TEXT,course_id TEXT,item_id TEXT,payload_hash TEXT,result TEXT,created TEXT);
   CREATE TABLE IF NOT EXISTS chat(id TEXT PRIMARY KEY,user_id TEXT,course_id TEXT,question TEXT,result TEXT,created TEXT);
   CREATE TABLE IF NOT EXISTS reviews(item_id TEXT PRIMARY KEY,status TEXT,reviewer TEXT,notes TEXT,updated TEXT);
   CREATE TABLE IF NOT EXISTS releases(version TEXT PRIMARY KEY,config TEXT,status TEXT,parent TEXT,reviewer TEXT,created TEXT);
   CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT);
   CREATE TABLE IF NOT EXISTS eval_runs(id TEXT PRIMARY KEY,partition TEXT,version TEXT,result TEXT,created TEXT);
   CREATE TABLE IF NOT EXISTS candidates(id TEXT PRIMARY KEY,parent TEXT,config TEXT,reason TEXT,validation TEXT,status TEXT,created TEXT);
   CREATE TABLE IF NOT EXISTS experiences(id TEXT PRIMARY KEY,data TEXT,status TEXT,version TEXT);
   CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,actor TEXT,action TEXT,data TEXT,created TEXT);
   CREATE TABLE IF NOT EXISTS adaptive_tasks(id TEXT PRIMARY KEY,source_id TEXT,fingerprint TEXT UNIQUE,record TEXT,created TEXT);
  `);
  if(!this.db.prepare('PRAGMA table_info(assignments)').all().some(x=>x.name==='policy_version'))this.db.exec("ALTER TABLE assignments ADD COLUMN policy_version TEXT DEFAULT 'v1-baseline'");
  if(!this.db.prepare('SELECT 1 FROM releases LIMIT 1').get()){
   this.db.prepare('INSERT INTO releases VALUES(?,?,?,?,?,?)').run('v1-baseline',JSON.stringify({check_explanation:true,require_transfer:false,diagnose_hint_dependence:true}), 'published',null,'bootstrap',new Date().toISOString());
   this.set('published_version','v1-baseline');
  }
 }
 get(key){return this.db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value;}
 set(key,value){this.db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,value);}
 audit(actor,action,data={}){this.db.prepare('INSERT INTO audit VALUES(?,?,?,?,?)').run(uid(),actor,action,JSON.stringify(data),new Date().toISOString());}
 login(role){if(!['student','teacher','admin'].includes(role))failure('无效演示角色');const token=uid();
  const user={id:role==='student'?'demo-student-1':'demo-'+role,role,name:({student:'演示同学',teacher:'课程教师',admin:'平台管理员'})[role]};
  this.db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run(hash(token),user.id,role,user.name,Date.now()+8*3600000);return {token,user};
 }
 session(token){const row=this.db.prepare('SELECT * FROM sessions WHERE token=? AND expires>?').get(hash(token||''),Date.now());return row?{id:row.user_id,role:row.role,name:row.name}:null;}
 state(user,course,concept){const row=this.db.prepare('SELECT * FROM states WHERE user_id=? AND course_id=? AND concept_id=?').get(user,course,concept);return row?{...JSON.parse(row.data),version:row.version}:{concept_id:concept,version:0,status:'unconfirmed',independent_correct:0,evidence:[],mistakes:[]};}
 states(user,course){return this.db.prepare('SELECT concept_id,data,version FROM states WHERE user_id=? AND course_id=?').all(user,course).map(x=>({...JSON.parse(x.data),version:x.version}));}
 release(version=this.get('published_version')){const row=this.db.prepare('SELECT * FROM releases WHERE version=?').get(version);if(!row)failure('版本不存在',404);return {...row,config:JSON.parse(row.config)};}
 commitSubmission({id,user,course,item,payload,result,expectedVersion}){
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const existing=this.db.prepare('SELECT * FROM submissions WHERE id=?').get(id);
   if(existing){if(existing.user_id!==user||existing.payload_hash!==hash(payload))failure('事件编号已被不同提交使用',409);this.db.exec('COMMIT');return JSON.parse(existing.result);}
   const old=this.state(user,course,item.concept_id);
   if(expectedVersion!==undefined&&expectedVersion!==old.version)failure('学习状态已变化，请刷新后重试',409);
   const independent=result.independent_evidence&&!old.evidence.some(e=>e.item_id===item.id);
   const state={...old,version:old.version+1,status:result.state_status,
    independent_correct:old.independent_correct+(independent?1:0),
    evidence:[...old.evidence,{event_id:id,item_id:item.id,family_id:item.family_id||item.id,correct:result.correct,hints:result.hints_used,explanation:result.explanation_status,version:result.policy_version}].slice(-50),
    mistakes:result.misconception?[...new Set([...old.mistakes,result.misconception])]:old.mistakes};
   const merged={...result,state};
   this.db.prepare('INSERT INTO states VALUES(?,?,?,?,?) ON CONFLICT(user_id,course_id,concept_id) DO UPDATE SET version=excluded.version,data=excluded.data').run(user,course,item.concept_id,state.version,JSON.stringify(state));
   this.db.prepare('INSERT INTO submissions VALUES(?,?,?,?,?,?,?)').run(id,user,course,item.id,hash(payload),JSON.stringify(merged),new Date().toISOString());
   this.db.exec('COMMIT');return merged;
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 close(){this.db.close();}
}
