import {uid,hash,failure} from './store.mjs';
import {assertCourse,publicItem} from './data.mjs';
import {grade} from './pedagogy.mjs';
export class TeachingService {
 constructor(data,store){this.data=data;this.store=store;store.db.exec('CREATE TABLE IF NOT EXISTS assignment_snapshots(id TEXT PRIMARY KEY,data TEXT)');}
 snapshot(row){const saved=this.store.db.prepare('SELECT data FROM assignment_snapshots WHERE id=?').get(row.id);return saved?JSON.parse(saved.data):{item:this.data.items.get(row.item_id)};}
 pinExisting(){for(const row of this.store.db.prepare('SELECT id,item_id FROM assignments WHERE id NOT IN (SELECT id FROM assignment_snapshots)').all()){const item=this.data.items.get(row.item_id);if(item)this.store.db.prepare('INSERT INTO assignment_snapshots VALUES(?,?)').run(row.id,JSON.stringify({item,card:this.data.courses.get(item.course_id).cards.concepts[item.concept_id]}));}}
 access(actor,id){const course=assertCourse(this.data,id);if(actor?.role==='student'&&course.onboarding_status==='draft')failure('课程尚未审核发布',403);return course;}
 assign({actor,course_id,concept_id,item_id,count=1,transfer=false}){
  const course=this.access(actor,course_id);
  if(item_id&&!concept_id)concept_id=this.data.items.get(item_id)?.concept_id;
  if(!concept_id){const weak=this.store.states(actor.id,course_id).filter(s=>s.status==='needs_review').sort((a,b)=>b.version-a.version)[0];if(weak)concept_id=weak.concept_id;}
  if(concept_id&&!course.concepts.some(c=>c.id===concept_id))failure('知识点不属于当前课程');
  if(item_id&&this.data.items.get(item_id)?.course_id!==course_id)failure('指定题目不属于当前课程');
  if(!Number.isInteger(count)||count<1||count>5)failure('组卷题数应为 1-5');
  const used=new Set(this.store.db.prepare('SELECT item_id FROM assignments WHERE user_id=? AND course_id=?').all(actor.id,course_id).map(x=>x.item_id));
  let options=[...this.data.items.values()].filter(x=>x.course_id===course_id&&(!concept_id||x.concept_id===concept_id)&&(!item_id||x.id===item_id)&&x.task_type!=='external_function_task'&&this.store.db.prepare('SELECT status FROM reviews WHERE item_id=?').get(x.id)?.status!=='rejected'&&(!this.strict||this.itemAvailable(x)));
  let selection_reason='优先选择当前课程薄弱知识点的未做题。';
  if(transfer){const last=this.store.db.prepare('SELECT * FROM assignments WHERE user_id=? AND course_id=? ORDER BY rowid DESC').all(actor.id,course_id).map(r=>this.snapshot(r).item).find(i=>i.concept_id===concept_id);options=options.filter(i=>!used.has(i.id)&&i.family_id&&i.structure_tag&&last?.structure_tag&&i.structure_tag!==last.structure_tag&&i.family_id!==last.family_id);selection_reason=options.length?'同一知识点，选择未做过的新结构和新家族。':'暂无经审核的同概念新结构题，请教师补充；未跳到无关知识点。';}
  options.sort((a,b)=>Number(used.has(a.id))-Number(used.has(b.id))||a.id.localeCompare(b.id));
  return {items:options.slice(0,count).map(item=>{
   const id=uid(),policy=this.store.get('published_version');this.store.db.prepare('INSERT INTO assignments(id,user_id,course_id,item_id,created,policy_version) VALUES(?,?,?,?,?,?)').run(id,actor.id,course_id,item.id,new Date().toISOString(),policy);
   this.store.db.prepare('INSERT INTO assignment_snapshots VALUES(?,?)').run(id,JSON.stringify({item,card:course.cards.concepts[item.concept_id]}));
   return {...publicItem(item),policy_version:policy,review_status:this.store.db.prepare('SELECT status FROM reviews WHERE item_id=?').get(item.id)?.status||'pending',assignment_id:id,state_version:this.store.state(actor.id,course_id,item.concept_id).version};
  }),selection_method:transfer?'same_concept_new_structure':'course_pack_bank_no_llm_generation',selection_reason,bank_insufficient:options.length<count,policy_version:this.store.get('published_version')};
 }
 assignment(actor,id){const row=this.store.db.prepare('SELECT * FROM assignments WHERE id=? AND user_id=?').get(id,actor.id);if(!row)failure('练习不存在或不属于当前学习者',404);return row;}
 hint(actor,id,full=false){
  const row=this.assignment(actor,id);const item=this.snapshot(row).item;
  if(full){const attempted=this.store.db.prepare('SELECT 1 FROM submissions WHERE user_id=? AND item_id=?').get(actor.id,item.id);if(!attempted)failure('请先提交自己的作答，再查看完整解析',409);}
  this.store.db.prepare('UPDATE assignments SET hints=hints+1,full_solution=MAX(full_solution,?) WHERE id=?').run(full?1:0,id);
  return {hint:full?item.reference.explanation:(item.hints[Math.min(row.hints,item.hints.length-1)]||'先解释当前知识点，再尝试新题。'),
    ...(full?{answer:item.reference.answer}:{}),hint_level:full?'full_solution':'concept',count:row.hints+1};
 }
 async submitAsync(args){
  const row=this.assignment(args.actor,args.assignment_id),item=this.snapshot(row).item;
  if(item.assessment?.capability!=='code_run'||this.store.db.prepare('SELECT 1 FROM submissions WHERE id=?').get(args.event_id))return this.submit(args);
  if(typeof args.answer!=='string'||args.answer.length>12000||typeof (args.explanation||'')!=='string'||(args.explanation||'').length>6000||!/^[a-zA-Z0-9_-]{8,100}$/.test(args.event_id||''))failure('作答格式或事件编号无效');
  const course=this.access(args.actor,item.course_id),handler=this.data.assessmentRegistry?.get('code_run');if(!handler||!course.required_capabilities.includes('code_run'))failure('代码核验能力不可用',409);
  if(args.expected_version!==undefined&&this.store.state(args.actor.id,item.course_id,item.concept_id).version!==args.expected_version)failure('学习状态已变化，请刷新后重试',409);
  const assessment=await handler.assessAsync(args.answer,item.assessment.config);return this.submit(args,assessment);
 }
 submit({actor,assignment_id,event_id,answer,explanation='',expected_version},verifiedAssessment=null){
  if(typeof answer!=='string'||answer.length>12000||typeof explanation!=='string'||explanation.length>6000)failure('作答格式或长度不符合要求');
  if(typeof event_id!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(event_id))failure('请提供有效提交事件编号');
  const row=this.assignment(actor,assignment_id);const snapshot=this.snapshot(row),item=snapshot.item;
  const payload={assignment_id,answer,explanation};const previous=this.store.db.prepare('SELECT * FROM submissions WHERE id=?').get(event_id);
  if(previous){if(previous.user_id!==actor.id||previous.payload_hash!==hash(payload))failure('事件编号与已提交内容不一致',409);return JSON.parse(previous.result);}
  const course=this.access(actor,item.course_id);let assessment=null;
  if(item.assessment_mode==='plugin'){
   const id=item.assessment?.capability,handler=this.data.assessmentRegistry?.get(id);
   if(!handler||!course.required_capabilities.includes(id))failure('课程评阅插件不可用',409);
   assessment=verifiedAssessment||handler.assess(answer,item.assessment.config);
  }
  const gradingData=snapshot.card?{...this.data,courses:new Map(this.data.courses).set(item.course_id,{...course,cards:{...course.cards,concepts:{...course.cards.concepts,[item.concept_id]:snapshot.card}}})}:this.data;
  const release=this.store.release(row.policy_version);const result=grade(gradingData,item,{answer,explanation},release.config,{count:row.hints,full:Boolean(row.full_solution)},assessment);
  result.policy_version=release.version;result.item_id=item.id;result.course_id=item.course_id;result.assignment_id=assignment_id;
  result.submitted_answer=answer;result.submitted_explanation=explanation;
  return this.store.commitSubmission({id:event_id,user:actor.id,course:item.course_id,item,payload,result,expectedVersion:expected_version});
 }
}
