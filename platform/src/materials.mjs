import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {ROOT,assertCourse} from './data.mjs';
import {hash,uid,failure} from './store.mjs';
import {conceptCandidates} from './language.mjs';

export const pythonBinary=()=>process.env.TUTOR_PYTHON|| (existsSync(path.join(ROOT,'.venv/Scripts/python.exe'))?path.join(ROOT,'.venv/Scripts/python.exe'):existsSync(path.join(ROOT,'.venv/bin/python'))?path.join(ROOT,'.venv/bin/python'):'python');
export async function parseMaterial(extension,buffer,{timeout=30000}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(pythonBinary(),[path.join(ROOT,'scripts/parse_material.py')],{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONIOENCODING:'utf-8'}});let output='',settled=false;
  const done=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value);};
  const timer=setTimeout(()=>{child.kill();done(Object.assign(new Error('资料解析超时'),{status:422}));},timeout);
  child.on('error',()=>done(Object.assign(new Error('Python 解析运行环境不可用'),{status:503})));
  child.stdout.setEncoding('utf8');child.stdout.on('data',b=>{output+=b;if(Buffer.byteLength(output)>8*1024*1024){child.kill();done(Object.assign(new Error('解析输出过大'),{status:422}));}});
  child.stderr.resume();child.stdin.on('error',()=>{});
  child.on('close',()=>{if(settled)return;try{const result=JSON.parse(output);if(!result.ok)done(Object.assign(new Error('资料解析失败：'+result.error),{status:422}));else done(null,result);}catch{done(Object.assign(new Error('解析器返回无效结果'),{status:422}));}});
  child.stdin.end(JSON.stringify({extension,content_base64:buffer.toString('base64')}));
 });
}
export function chunkSegments(segments){
 const chunks=[];let pending='',location=null;
 const emit=()=>{if(pending.trim())chunks.push({text:pending.trim(),locator:location});pending='';};
 for(const segment of segments){
  const text=segment.text.replace(/\s+/g,' ').trim();if(!text)continue;
  if(location&&JSON.stringify(location)!==JSON.stringify(segment.locator))emit();location=segment.locator;
  for(let offset=0;offset<text.length;){const free=800-pending.length;const take=Math.min(free,text.length-offset);pending+=text.slice(offset,offset+take);offset+=take;
   if(pending.length>=800){chunks.push({text:pending.trim(),locator:location});pending=pending.slice(-120);}else pending+=' ';
  }
 }emit();return chunks;
}
export class MaterialService{
 constructor(data,store,varDir){this.data=data;this.store=store;this.dir=path.join(varDir,'materials');mkdirSync(this.dir,{recursive:true});
  store.db.exec(`CREATE TABLE IF NOT EXISTS materials(id TEXT PRIMARY KEY,course_id TEXT,digest TEXT,filename TEXT,version TEXT,source_url TEXT,license TEXT,status TEXT,warnings TEXT,created TEXT,UNIQUE(course_id,digest));
   CREATE TABLE IF NOT EXISTS material_chunks(id TEXT PRIMARY KEY,material_id TEXT,course_id TEXT,text TEXT,locator TEXT);
   CREATE TABLE IF NOT EXISTS material_reviews(id TEXT PRIMARY KEY,material_id TEXT,actor TEXT,status TEXT,notes TEXT,created TEXT);
   CREATE TABLE IF NOT EXISTS concept_drafts(id TEXT PRIMARY KEY,course_id TEXT,material_id TEXT,data TEXT,status TEXT);`);
  const columns=new Set(store.db.prepare('PRAGMA table_info(materials)').all().map(c=>c.name));
  if(!columns.has('source_digest'))store.db.exec('ALTER TABLE materials ADD COLUMN source_digest TEXT');
  if(!columns.has('parser_version'))store.db.exec("ALTER TABLE materials ADD COLUMN parser_version TEXT DEFAULT 'legacy'");
  store.db.exec('CREATE TABLE IF NOT EXISTS material_supersessions(old_id TEXT PRIMARY KEY,new_id TEXT)');
 }
 list(course){assertCourse(this.data,course);return this.store.db.prepare('SELECT * FROM materials WHERE course_id=? AND id NOT IN (SELECT old_id FROM material_supersessions) ORDER BY created').all(course).map(x=>({...x,warnings:JSON.parse(x.warnings)}));}
 get(id){const row=this.store.db.prepare('SELECT * FROM materials WHERE id=?').get(id);if(!row)failure('资料不存在',404);return {...row,warnings:JSON.parse(row.warnings),chunks:this.store.db.prepare('SELECT id,text,locator FROM material_chunks WHERE material_id=? ORDER BY rowid').all(id).map(x=>({...x,locator:JSON.parse(x.locator)})),concept_candidates:this.store.db.prepare('SELECT data,status FROM concept_drafts WHERE material_id=?').all(id).map(x=>({...JSON.parse(x.data),status:x.status}))};}
 async upload(input,actor){
  const {course_id,filename,content_base64,source_url,license=''}=input||{};const course=assertCourse(this.data,course_id);
  if(typeof filename!=='string'||filename.length>180||/[\\/\x00]/.test(filename)||!['.pdf','.docx','.md','.txt','.html','.htm'].includes(path.extname(filename).toLowerCase()))failure('请选择 PDF、DOCX、Markdown、TXT 或 HTML 文件');
  if(typeof content_base64!=='string'||content_base64.length>7*1024*1024||!/^[A-Za-z0-9+/]*={0,2}$/.test(content_base64))failure('文件编码或大小不合法');
  if(typeof source_url!=='string'||!/^https?:\/\//.test(source_url)||source_url.length>2000||typeof license!=='string'||license.length>1000)failure('请填写来源 URL');
  const buffer=Buffer.from(content_base64,'base64');if(buffer.length>5*1024*1024||!buffer.length)failure('文件需为 1 字节至 5 MiB');const sourceDigest=createHash('sha256').update(buffer).digest('hex'),parserVersion='text-pipeline-0.4.1',digest=hash(sourceDigest+parserVersion);
  const existing=this.store.db.prepare('SELECT id FROM materials WHERE course_id=? AND digest=?').get(course_id,digest);if(existing)return {...this.get(existing.id),duplicate:true};
  const parsed=await parseMaterial(path.extname(filename).toLowerCase(),buffer),id='mat-'+uid(),chunks=chunkSegments(parsed.segments),now=new Date().toISOString();
  // A second import may finish parsing while this request is running.
  const raced=this.store.db.prepare('SELECT id FROM materials WHERE course_id=? AND digest=?').get(course_id,digest);if(raced)return {...this.get(raced.id),duplicate:true};
  writeFileSync(path.join(this.dir,id+'.source'),buffer);
  this.store.db.exec('BEGIN IMMEDIATE');try{
   this.store.db.prepare('INSERT INTO materials(id,course_id,digest,filename,version,source_url,license,status,warnings,created,source_digest,parser_version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,course_id,digest,filename,(input.version||sourceDigest.slice(0,12))+'/'+parserVersion,source_url,license,'draft',JSON.stringify(parsed.warnings),now,sourceDigest,parserVersion);
   const older=this.store.db.prepare('SELECT id FROM materials WHERE course_id=? AND id<>? AND (source_digest=? OR (source_digest IS NULL AND digest=?))').all(course_id,id,sourceDigest,hash(buffer));
   for(const old of older)this.store.db.prepare('INSERT OR REPLACE INTO material_supersessions VALUES(?,?)').run(old.id,id);
   chunks.forEach((c,i)=>this.store.db.prepare('INSERT INTO material_chunks VALUES(?,?,?,?,?)').run(`${id}-${i+1}`,id,course_id,c.text,JSON.stringify(c.locator)));
   for(const draft of conceptCandidates(course,chunks.map((c,i)=>({...c,id:`${id}-${i+1}`}))))this.store.db.prepare('INSERT INTO concept_drafts VALUES(?,?,?,?,?)').run(uid(),course_id,id,JSON.stringify(draft),'pending');
   this.store.audit(actor.id,'material_uploaded',{id,course_id,chunks:chunks.length});this.store.db.exec('COMMIT');
  }catch(e){this.store.db.exec('ROLLBACK');throw e;}
  return this.get(id);
 }
 review(id,input,actor){
  const material=this.get(id);if(!['approved','rejected','pending'].includes(input.status)||typeof input.notes!=='string'||!input.notes.trim()||input.notes.length>4000)failure('请填写复核状态与依据');
  const updates=input.concepts||[];if(!Array.isArray(updates))failure('知识点修改格式无效');
  for(const c of updates)if(!this.data.courses.get(material.course_id).concepts.some(x=>x.id===c.concept_id)||typeof c.summary!=='string'||c.summary.length>10000||typeof c.objective!=='string'||!Array.isArray(c.evidence_chunk_ids)||c.evidence_chunk_ids.some(id=>!material.chunks.some(x=>x.id===id)))failure('知识点修改或资料关联无效');
  this.store.db.exec('BEGIN IMMEDIATE');try{
   this.store.db.prepare('INSERT INTO material_reviews VALUES(?,?,?,?,?,?)').run(uid(),id,actor.id,input.status,input.notes,new Date().toISOString());
   this.store.db.prepare('UPDATE materials SET status=? WHERE id=?').run(input.status,id);
   for(const c of updates){this.store.db.prepare('DELETE FROM concept_drafts WHERE material_id=? AND json_extract(data,\'$.concept_id\')=?').run(id,c.concept_id);this.store.db.prepare('INSERT INTO concept_drafts VALUES(?,?,?,?,?)').run(uid(),material.course_id,id,JSON.stringify({...c,origin:'human_revision'}),input.status);}
   this.store.audit(actor.id,'material_reviewed',{id,status:input.status});this.store.db.exec('COMMIT');
  }catch(e){this.store.db.exec('ROLLBACK');throw e;}return this.get(id);
 }
}
