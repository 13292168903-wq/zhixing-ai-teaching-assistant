import {hash,uid,failure} from './store.mjs';
import {importCourse,assertCourse} from './data.mjs';
export function itemDigest(item,card){return hash({id:item.id,course_id:item.course_id,concept_id:item.concept_id,prompt:item.prompt,hints:item.hints,mode:item.assessment_mode,assessment:item.assessment,reference:item.reference,probe:item.diagnostic_probe,...(item.family_id?{family_id:item.family_id}:{}),...(item.structure_tag?{structure_tag:item.structure_tag}:{}),...(item.difficulty?{difficulty:item.difficulty}:{}),card});}
export class Workbench{
 constructor(data,store,onboarding){this.data=data;this.store=store;this.onboarding=onboarding;
  store.db.exec(`CREATE TABLE IF NOT EXISTS content_history(id TEXT PRIMARY KEY,course_id TEXT,entity_id TEXT,kind TEXT,before_data TEXT,after_data TEXT,actor TEXT,notes TEXT,created TEXT);
   CREATE TABLE IF NOT EXISTS review_attestations(item_id TEXT PRIMARY KEY,content_digest TEXT,status TEXT,actor TEXT,notes TEXT,created TEXT);
   CREATE TABLE IF NOT EXISTS answer_reviews(id TEXT PRIMARY KEY,course_id TEXT,question TEXT,result TEXT,content_digest TEXT UNIQUE,status TEXT,actor TEXT,notes TEXT,created TEXT);
   CREATE TABLE IF NOT EXISTS answer_review_events(id TEXT PRIMARY KEY,answer_id TEXT,status TEXT,actor TEXT,notes TEXT,claims TEXT,created TEXT);`);
  store.set('workbench_schema_version','0.6.0');
 }
 item(id){const item=this.data.items.get(id);if(!item)failure('题目不存在',404);const course=assertCourse(this.data,item.course_id),card=course.cards.concepts[item.concept_id];return {item,card,digest:itemDigest(item,card),review:this.store.db.prepare('SELECT * FROM reviews WHERE item_id=?').get(id)||{status:'pending'},attestation:this.store.db.prepare('SELECT * FROM review_attestations WHERE item_id=?').get(id)||null,editable:course.onboarding_status==='draft',history:this.store.db.prepare('SELECT id,kind,actor,notes,created FROM content_history WHERE entity_id=? ORDER BY created DESC').all(id)};}
 notes(input){if(typeof input.notes!=='string'||!input.notes.trim()||input.notes.length>4000)failure('请填写修订或审核依据');}
 current(id,input){this.notes(input);const current=this.item(id);if(current.digest!==input.expected_digest)failure('题目或概念版本已变化，请重新加载后核对',409);return current;}
 save(id,input,actor){const current=this.current(id,input),course=current.item.course_id; if(!current.editable)failure('已发布课程需另建版本，不能直接覆盖',409);
  if(!input.item||typeof input.item!=='object')failure('缺少修订题目');
  const allowed=['prompt','hints','reference','diagnostic_probe','concept_id','assessment_mode','assessment','family_id','difficulty','structure_tag'];const revised={...structuredClone(current.item),...Object.fromEntries(allowed.filter(k=>k in input.item).map(k=>[k,structuredClone(input.item[k])]))};
  if(typeof revised.prompt!=='string'||!revised.prompt.trim()||revised.prompt.length>12000||!Array.isArray(revised.hints)||revised.hints.some(h=>typeof h!=='string'||h.length>3000)||typeof (revised.diagnostic_probe||'')!=='string')failure('题干、提示或追问格式无效');
  if(revised.assessment_mode==='plugin'){const handler=this.data.assessmentRegistry?.get(revised.assessment?.capability);if(revised.assessment?.capability==='code_run'){if(!handler)failure('代码核验能力未安装');handler.validate(revised.assessment.config);}else if(!handler||!handler.assess(revised.reference?.answer,revised.assessment?.config).correct)failure('参考答案与评阅插件配置不一致；请同时核对参考数值与评阅参数');}
  const row=this.store.db.prepare('SELECT * FROM course_catalog WHERE course_id=?').get(course),pack=JSON.parse(row.pack);pack.items=pack.items.map(x=>x.id===id?revised:x);
  const sandbox={...this.data,courses:new Map([...this.data.courses].filter(([c])=>c!==course)),items:new Map([...this.data.items].filter(([,i])=>i.course_id!==course))};importCourse(sandbox,pack);
  const changed=JSON.stringify(current.item)!==JSON.stringify(revised);if(!changed)return {...current,unchanged:true};
  const history=uid(),now=new Date().toISOString();this.store.db.exec('BEGIN IMMEDIATE');try{
   this.store.db.prepare('UPDATE course_catalog SET pack=?,updated=? WHERE course_id=?').run(JSON.stringify(pack),now,course);
   this.store.db.prepare('INSERT INTO content_history VALUES(?,?,?,?,?,?,?,?,?)').run(history,course,id,'item',JSON.stringify(current.item),JSON.stringify(revised),actor.id,input.notes,now);
   this.store.db.prepare('DELETE FROM reviews WHERE item_id=?').run(id);this.store.db.prepare('DELETE FROM review_attestations WHERE item_id=?').run(id);this.store.audit(actor.id,'item_revised',{id,previous_digest:current.digest,history});this.store.db.exec('COMMIT');
  }catch(e){this.store.db.exec('ROLLBACK');throw e;}
  this.data.items=sandbox.items;this.data.courses=sandbox.courses;this.data.courses.get(course).onboarding_status='draft';return {...this.item(id),history_id:history,changed_fields:allowed.filter(k=>JSON.stringify(current.item[k])!==JSON.stringify(revised[k]))};
 }
 review(id,input,actor,{legacy=false}={}){const current=legacy?this.item(id):this.current(id,input);this.notes(input);if(!['approved','rejected'].includes(input.status))failure('审核状态无效');const now=new Date().toISOString();
  this.store.db.exec('BEGIN IMMEDIATE');try{
   this.store.db.prepare('INSERT INTO reviews VALUES(?,?,?,?,?) ON CONFLICT(item_id) DO UPDATE SET status=excluded.status,reviewer=excluded.reviewer,notes=excluded.notes,updated=excluded.updated').run(id,input.status,actor.id,input.notes,now);
   this.store.db.prepare('INSERT INTO review_attestations VALUES(?,?,?,?,?,?) ON CONFLICT(item_id) DO UPDATE SET content_digest=excluded.content_digest,status=excluded.status,actor=excluded.actor,notes=excluded.notes,created=excluded.created').run(id,current.digest,input.status,actor.id,input.notes,now);
   this.store.audit(actor.id,'version_bound_item_review',{id,digest:current.digest,status:input.status,scope:'local_teacher_action_not_external_identity_verification'});this.store.db.exec('COMMIT');
  }catch(e){this.store.db.exec('ROLLBACK');throw e;}return this.item(id);
 }
 validateRelease(pack){for(const item of pack.items){const a=this.store.db.prepare('SELECT * FROM review_attestations WHERE item_id=?').get(item.id);if(a&&(a.status!=='approved'||a.content_digest!==this.item(item.id).digest))failure('题目审核与当前内容版本不一致：'+item.id,409);}}
 restore(id,input,actor){this.current(id,input);const row=this.store.db.prepare("SELECT * FROM content_history WHERE id=? AND entity_id=? AND kind='item'").get(input.history_id,id);if(!row)failure('历史版本不属于当前题目',404);return this.save(id,{...input,item:JSON.parse(row.before_data)},actor);}
 concept(course,id,input,actor){this.notes(input);const c=assertCourse(this.data,course),card=c.cards.concepts[id];if(!card)failure('知识点不存在',404);if(c.onboarding_status!=='draft')failure('已发布课程不能直接修改',409);if(hash(card)!==input.expected_digest)failure('知识点版本已变化',409);
  const row=this.store.db.prepare('SELECT pack FROM course_catalog WHERE course_id=?').get(course),pack=JSON.parse(row.pack);pack.cards.concepts[id]=input.card;
  const sandbox={...this.data,courses:new Map([...this.data.courses].filter(([c])=>c!==course)),items:new Map([...this.data.items].filter(([,i])=>i.course_id!==course))};importCourse(sandbox,pack);
  const affected=pack.items.filter(i=>i.concept_id===id).map(i=>i.id),now=new Date().toISOString();this.store.db.exec('BEGIN IMMEDIATE');try{
   this.store.db.prepare('UPDATE course_catalog SET pack=?,updated=? WHERE course_id=?').run(JSON.stringify(pack),now,course);this.store.db.prepare('INSERT INTO content_history VALUES(?,?,?,?,?,?,?,?,?)').run(uid(),course,course+'/'+id,'concept',JSON.stringify(card),JSON.stringify(input.card),actor.id,input.notes,now);
   for(const item of affected){this.store.db.prepare('DELETE FROM reviews WHERE item_id=?').run(item);this.store.db.prepare('DELETE FROM review_attestations WHERE item_id=?').run(item);}this.store.audit(actor.id,'concept_revised',{course,id,affected});this.store.db.exec('COMMIT');
  }catch(e){this.store.db.exec('ROLLBACK');throw e;}this.data.items=sandbox.items;this.data.courses=sandbox.courses;this.data.courses.get(course).onboarding_status='draft';return {course_id:course,concept_id:id,affected_items:affected,digest:hash(input.card)};
 }
 capture(course,question,result){if(result.response_kind==='conversation')return null;if(!result.model_answer&&!result.model_feedback)return null;const digest=hash({course,question,answer:result.model_answer,feedback:result.model_feedback,claims:result.model_claims,citations:result.citations,run:result.runtime?.run_id});const old=this.store.db.prepare('SELECT id FROM answer_reviews WHERE content_digest=?').get(digest);if(old)return old.id;const id=uid();this.store.db.prepare('INSERT INTO answer_reviews VALUES(?,?,?,?,?,?,?,?,?)').run(id,course,question,JSON.stringify(result),digest,'pending',null,null,new Date().toISOString());return id;}
 answers(){return this.store.db.prepare('SELECT * FROM answer_reviews ORDER BY created DESC').all().map(r=>({...r,result:JSON.parse(r.result)}));}
 reviewAnswer(id,input,actor){this.notes(input);const row=this.store.db.prepare('SELECT * FROM answer_reviews WHERE id=?').get(id);if(!row)failure('回答不存在',404);if(row.content_digest!==input.expected_digest)failure('回答版本已变化',409);if(!['approved','needs_revision','rejected'].includes(input.status))failure('回答审核状态无效');
  const result=JSON.parse(row.result),claims=input.claims||[];if(!Array.isArray(claims)||new Set(claims.map(c=>c.index)).size!==claims.length||claims.some(c=>!Number.isInteger(c.index)||c.index<0||c.index>=(result.model_claims||[]).length||!['supported','unsupported','uncertain'].includes(c.verdict)||typeof c.notes!=='string'))failure('断言审核格式无效');
  if(input.status==='approved'&&(claims.some(c=>c.verdict!=='supported')||(result.model_claims||[]).some((_,i)=>!claims.some(c=>c.index===i&&c.verdict==='supported'))))failure('通过回答前需逐项确认断言得到支持',409);
  this.store.db.exec('BEGIN IMMEDIATE');try{this.store.db.prepare('UPDATE answer_reviews SET status=?,actor=?,notes=? WHERE id=?').run(input.status,actor.id,input.notes,id);this.store.db.prepare('INSERT INTO answer_review_events VALUES(?,?,?,?,?,?,?)').run(uid(),id,input.status,actor.id,input.notes,JSON.stringify(claims),new Date().toISOString());this.store.audit(actor.id,'answer_reviewed',{id,status:input.status});this.store.db.exec('COMMIT');}catch(e){this.store.db.exec('ROLLBACK');throw e;}return {id,status:input.status,content_digest:row.content_digest};
 }
 overview(){return {version:'0.6.0',courses:this.onboarding.list(),answers:this.answers(),revisions:this.store.db.prepare('SELECT id,course_id,entity_id,kind,actor,notes,created FROM content_history ORDER BY created DESC').all(),review_scope:'local_teacher_actions; no simulated approval'};}
}
