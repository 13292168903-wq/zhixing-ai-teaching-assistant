import {importCourse} from './data.mjs';
import {failure,hash,uid} from './store.mjs';

export const COURSE_TEMPLATES=[
 {id:'concept',title:'理论与概念课',description:'课程资料导读、概念解释、量规反馈',mode:'open',capabilities:[]},
 {id:'objective',title:'客观练习课',description:'明确答案核验、理由诊断、针对性补练',mode:'exact',capabilities:[]},
 {id:'numeric',title:'数值计算课',description:'数值容差核验；需先安装 numeric_check 插件',mode:'plugin',capabilities:['numeric_check']}
];
const CORE=['retrieve_evidence','generate_task','verify_submission'];
const text=(s,max=2000)=>typeof s==='string'&&s.trim().length>0&&s.length<=max;
function copyData(data,except){return {...data,courses:new Map([...data.courses].filter(([id])=>id!==except)),items:new Map([...data.items].filter(([,item])=>item.course_id!==except))};}

export function buildCourse(row){
 if(!row||typeof row!=='object'||Array.isArray(row))failure('课程行必须为对象');
 const template=COURSE_TEMPLATES.find(t=>t.id===row.template_id);if(!template)failure('未知课程模板');
 if(!text(row.title,160)||!text(row.department,160)||!text(row.teacher,160))failure('请填写课程名称、院系和负责教师');
 const topics=row.topics??[];if(!Array.isArray(topics)||topics.length>30)failure('知识点应为不超过 30 项的数组');
 const classes=row.classes??[];if(!Array.isArray(classes)||classes.length>50||classes.some(c=>!text(c,100))||new Set(classes.map(c=>c.trim())).size!==classes.length)failure('教学班名称应为不重复的非空字符串，最多 50 个');
 const pack={manifest:{schema_version:'0.3.0',course_id:row.course_id,title:row.title.trim(),version:row.version||'0.1.0',
  concepts:[],required_capabilities:[...CORE,...template.capabilities]},cards:{concepts:{}},evidence:[],items:[]};
 for(const t of topics){
  if(!t||!/^[a-z][a-z0-9_]{0,47}$/.test(t.id||'')||!text(t.title,160)||!text(t.objective)||!text(t.summary,10000)||
    !text(t.source?.url)||!/^https?:\/\//.test(t.source.url)||!text(t.source.text,20000)||!text(t.source.license,300)||
    !text(t.question?.prompt,12000)||!text(t.question.answer,12000))failure('知识点需包含标识、目标、摘要、来源与许可、练习及参考答案');
  const support=t.support??t.question.required_points;
  if(!Array.isArray(support)||!support.length||support.some(s=>!text(s,500))||!Array.isArray(t.question.required_points)||!t.question.required_points.length||t.question.required_points.some(s=>!text(s,500)))failure('请提供解释支持短语和评分要点');
  const aliases=t.aliases??[t.title],contradictions=t.contradictions??[];
  if(!Array.isArray(aliases)||!aliases.length||aliases.some(s=>!text(s,100))||!Array.isArray(contradictions)||contradictions.some(s=>!text(s,500)))failure('知识点别名或矛盾短语格式无效');
  const evidenceId=`${row.course_id}-${t.id}-source`;
  pack.manifest.concepts.push({id:t.id,title:t.title,learning_objective:t.objective,evidence_ids:[evidenceId],prerequisites:[]});
  pack.cards.concepts[t.id]={aliases,summary:t.summary,support,contradictions,probe:t.probe||'请结合资料说明依据，并用新例子复查。'};
  pack.evidence.push({id:evidenceId,concept_id:t.id,locator:t.source.url,text:t.source.text,license:t.source.license,source_id:evidenceId});
  const item={id:`L-${row.course_id}-${t.id}-001`,course_version:pack.manifest.version,concept_id:t.id,assessment_mode:template.mode,
   task_type:template.mode==='open'?'concept_explanation':'template_practice',prompt:t.question.prompt,hints:[t.question.hint||'先回顾课程资料中的定义和适用条件。'],
   reference:{answer:t.question.answer,required_points:t.question.required_points,explanation:t.question.explanation||t.summary}};
  if(template.mode==='plugin')item.assessment={capability:'numeric_check',config:t.question.numeric};
  pack.items.push(item);
 }
 return {pack,metadata:{template_id:template.id,department:row.department.trim(),teacher:row.teacher.trim(),classes:classes.map(c=>c.trim())}};
}

export class OnboardingService{
 constructor(data,store,registry){
  this.data=data;this.store=store;this.registry=registry;
  store.db.exec(`CREATE TABLE IF NOT EXISTS course_catalog(course_id TEXT PRIMARY KEY,pack TEXT,metadata TEXT,status TEXT,created TEXT,updated TEXT);
   CREATE TABLE IF NOT EXISTS onboarding_batches(id TEXT PRIMARY KEY,actor TEXT,digest TEXT,result TEXT,created TEXT);
   CREATE TABLE IF NOT EXISTS installed_extensions(id TEXT PRIMARY KEY,descriptor TEXT,created TEXT);`);
 }
 list(){return this.store.db.prepare('SELECT * FROM course_catalog ORDER BY created DESC').all().map(r=>({course_id:r.course_id,title:JSON.parse(r.pack).manifest.title,version:JSON.parse(r.pack).manifest.version,
  status:r.status,...JSON.parse(r.metadata),item_count:JSON.parse(r.pack).items.length}));}
 load(){for(const r of this.store.db.prepare('SELECT * FROM course_catalog ORDER BY created').all()){
  importCourse(this.data,JSON.parse(r.pack),{allowEmpty:true});this.data.courses.get(r.course_id).onboarding_status=r.status;
 }}
 prepare(rows){
  if(!Array.isArray(rows)||!rows.length||rows.length>50)failure('每批需包含 1-50 门课程');
  const sandbox=copyData(this.data),prepared=[],results=[];
  rows.forEach((row,index)=>{try{
   const built=buildCourse(row);importCourse(sandbox,built.pack,{allowEmpty:true});prepared.push(built);
   results.push({row:index+1,course_id:row.course_id,title:row.title,valid:true,items:built.pack.items.length,classes:built.metadata.classes.length,
    note:built.pack.items.length?'内容为草稿，需审核发布':'空课程空间，需补充资料和练习'});
  }catch(e){results.push({row:index+1,course_id:row?.course_id||'',valid:false,error:e.status?e.message:'课程结构不合法'});}});
  return {prepared,report:{valid:results.every(r=>r.valid),total:rows.length,rows:results,digest:hash(rows)}};
 }
 preview(rows){return this.prepare(rows).report;}
 importPack(pack,actor){
  const sandbox=copyData(this.data);importCourse(sandbox,pack);
  if(!pack.evidence.length||pack.evidence.some(e=>!text(e.license,500)))failure('课包需保留资料来源与许可说明');
  const id=pack.manifest.course_id,created=new Date().toISOString();
  const metadata={template_id:'custom',department:'待分配院系',teacher:actor.name||actor.id,classes:[]};
  this.store.db.exec('BEGIN IMMEDIATE');try{
   this.store.db.prepare('INSERT INTO course_catalog VALUES(?,?,?,?,?,?)').run(id,JSON.stringify(pack),JSON.stringify(metadata),'draft',created,created);
   this.store.audit(actor.id,'course_pack_onboarded',{course_id:id});this.store.db.exec('COMMIT');
  }catch(e){this.store.db.exec('ROLLBACK');throw e;}
  this.data.courses=sandbox.courses;this.data.items=sandbox.items;this.data.courses.get(id).onboarding_status='draft';return {course_id:id,status:'draft'};
 }
 commit(rows,digest,actor){
  const {prepared,report}=this.prepare(rows);
  if(!digest||report.digest!==digest)failure('导入内容已变化，请重新预检',409);
  if(!report.valid)throw Object.assign(new Error('预检未通过，整批未写入'),{status:400,details:report});
  const id=uid(),created=new Date().toISOString(),result={batch_id:id,created:prepared.map(p=>p.pack.manifest.course_id),total:prepared.length,status:'draft'};
  this.store.db.exec('BEGIN IMMEDIATE');
  try{for(const {pack,metadata}of prepared)this.store.db.prepare('INSERT INTO course_catalog VALUES(?,?,?,?,?,?)').run(pack.manifest.course_id,JSON.stringify(pack),JSON.stringify(metadata),'draft',created,created);
   this.store.db.prepare('INSERT INTO onboarding_batches VALUES(?,?,?,?,?)').run(id,actor.id,digest,JSON.stringify(result),created);
   this.store.audit(actor.id,'courses_onboarded',result);this.store.db.exec('COMMIT');
  }catch(e){this.store.db.exec('ROLLBACK');throw e;}
  for(const {pack}of prepared){importCourse(this.data,pack,{allowEmpty:true});this.data.courses.get(pack.manifest.course_id).onboarding_status='draft';}
  return result;
 }
 replace(id,pack,actor,newMetadata){
  const row=this.store.db.prepare('SELECT * FROM course_catalog WHERE course_id=?').get(id);
  if(!row)failure('接入课程不存在',404);if(row.status!=='draft')failure('已发布课程不可直接覆盖，请另建版本',409);
  if(pack?.manifest?.course_id!==id)failure('课程包标识与课程空间不一致');
  const sandbox=copyData(this.data,id);importCourse(sandbox,pack);
  if(pack.evidence.length===0||pack.evidence.some(e=>!text(e.license,500)))failure('资料需保留来源与许可说明');
  this.store.db.exec('BEGIN IMMEDIATE');try{
   this.store.db.prepare('UPDATE course_catalog SET pack=?,metadata=?,updated=? WHERE course_id=?').run(JSON.stringify(pack),JSON.stringify({...JSON.parse(row.metadata),...newMetadata}),new Date().toISOString(),id);
   for(const old of JSON.parse(row.pack).items)this.store.db.prepare('DELETE FROM reviews WHERE item_id=?').run(old.id);
   this.store.audit(actor.id,'course_content_replaced',{course_id:id});this.store.db.exec('COMMIT');
  }catch(e){this.store.db.exec('ROLLBACK');throw e;}
  this.data.courses=sandbox.courses;this.data.items=sandbox.items;this.data.courses.get(id).onboarding_status='draft';
  return {course_id:id,status:'draft',item_count:pack.items.length};
 }
 fromTemplate(id,row,actor){const {pack,metadata}=buildCourse(row);return this.replace(id,pack,actor,metadata);}
 bind(id,capabilities,actor){
  const row=this.store.db.prepare('SELECT * FROM course_catalog WHERE course_id=?').get(id);if(!row)failure('请在接入中心创建课程后绑定插件',404);
  if(row.status!=='draft')failure('请在课程发布前配置插件',409);
  if(!Array.isArray(capabilities)||!capabilities.length||capabilities.some(id=>!this.registry.plugins.has(id)))failure('绑定的插件尚未安装');
  const pack=JSON.parse(row.pack);pack.manifest.required_capabilities=[...new Set([...pack.manifest.required_capabilities,...capabilities])];
  this.store.db.prepare('UPDATE course_catalog SET pack=?,updated=? WHERE course_id=?').run(JSON.stringify(pack),new Date().toISOString(),id);
  this.data.courses.get(id).required_capabilities=pack.manifest.required_capabilities;this.store.audit(actor.id,'course_plugins_bound',{course_id:id,capabilities});
  return {course_id:id,capabilities:pack.manifest.required_capabilities};
 }
 publish(id,notes,actor){
  const row=this.store.db.prepare('SELECT * FROM course_catalog WHERE course_id=?').get(id);if(!row)failure('课程不存在',404);
  if(row.status!=='draft')failure('课程已发布',409);if(!text(notes))failure('请填写课程发布审核说明');
  const pack=JSON.parse(row.pack);if(!pack.items.length||!pack.evidence.length)failure('请先补齐课程资料和练习',409);
  for(const c of pack.manifest.concepts)if(!pack.evidence.some(e=>e.concept_id===c.id)||!pack.items.some(i=>i.concept_id===c.id))failure('每个知识点需有资料证据和练习',409);
  for(const item of pack.items)if(this.store.db.prepare('SELECT status FROM reviews WHERE item_id=?').get(item.id)?.status!=='approved')failure('所有练习需由教师审核通过后发布',409);
  if(pack.manifest.required_capabilities.some(c=>!this.registry.plugins.has(c)))failure('课程插件依赖缺失',409);
  if(pack.manifest.material_retrieval){const materials=this.store.db.prepare('SELECT status FROM materials WHERE course_id=? AND id NOT IN (SELECT old_id FROM material_supersessions)').all(id);if(!materials.length||materials.some(m=>m.status!=='approved'))failure('检索资料需全部人工复核通过后发布',409);}
  const metadata={...JSON.parse(row.metadata),reviewer:actor.id,release_notes:notes,published_at:new Date().toISOString()};
  this.store.db.exec('BEGIN IMMEDIATE');try{
   this.store.db.prepare("UPDATE course_catalog SET status='published',metadata=?,updated=? WHERE course_id=?").run(JSON.stringify(metadata),metadata.published_at,id);
   this.store.audit(actor.id,'course_published',{course_id:id,version:pack.manifest.version,notes});this.store.db.exec('COMMIT');
  }catch(e){this.store.db.exec('ROLLBACK');throw e;}
  this.data.courses.get(id).onboarding_status='published';return {course_id:id,status:'published'};
 }
}
