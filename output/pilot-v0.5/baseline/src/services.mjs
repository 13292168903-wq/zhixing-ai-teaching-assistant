import {uid,hash,failure} from './store.mjs';
import {assertCourse,publicItem} from './data.mjs';
import {grade} from './pedagogy.mjs';
export class TeachingService {
 constructor(data,store){this.data=data;this.store=store;}
 access(actor,id){const course=assertCourse(this.data,id);if(actor?.role==='student'&&course.onboarding_status==='draft')failure('课程尚未审核发布',403);return course;}
 assign({actor,course_id,concept_id,count=1}){
  const course=this.access(actor,course_id);
  if(!concept_id){const weak=this.store.states(actor.id,course_id).filter(s=>s.status==='needs_review').sort((a,b)=>b.version-a.version)[0];if(weak)concept_id=weak.concept_id;}
  if(concept_id&&!course.concepts.some(c=>c.id===concept_id))failure('知识点不属于当前课程');
  if(!Number.isInteger(count)||count<1||count>5)failure('组卷题数应为 1-5');
  const used=new Set(this.store.db.prepare('SELECT item_id FROM assignments WHERE user_id=? AND course_id=?').all(actor.id,course_id).map(x=>x.item_id));
  const options=[...this.data.items.values()].filter(x=>x.course_id===course_id&&(!concept_id||x.concept_id===concept_id)&&x.task_type!=='external_function_task'&&this.store.db.prepare('SELECT status FROM reviews WHERE item_id=?').get(x.id)?.status!=='rejected');
  options.sort((a,b)=>Number(used.has(a.id))-Number(used.has(b.id))||a.id.localeCompare(b.id));
  return {items:options.slice(0,count).map(item=>{
   const id=uid(),policy=this.store.get('published_version');this.store.db.prepare('INSERT INTO assignments(id,user_id,course_id,item_id,created,policy_version) VALUES(?,?,?,?,?,?)').run(id,actor.id,course_id,item.id,new Date().toISOString(),policy);
   return {...publicItem(item),policy_version:policy,review_status:this.store.db.prepare('SELECT status FROM reviews WHERE item_id=?').get(item.id)?.status||'pending',assignment_id:id,state_version:this.store.state(actor.id,course_id,item.concept_id).version};
  }),selection_method:'course_pack_bank_no_llm_generation',policy_version:this.store.get('published_version')};
 }
 assignment(actor,id){const row=this.store.db.prepare('SELECT * FROM assignments WHERE id=? AND user_id=?').get(id,actor.id);if(!row)failure('练习不存在或不属于当前学习者',404);return row;}
 hint(actor,id,full=false){
  const row=this.assignment(actor,id);const item=this.data.items.get(row.item_id);
  if(full){const attempted=this.store.db.prepare('SELECT 1 FROM submissions WHERE user_id=? AND item_id=?').get(actor.id,item.id);if(!attempted)failure('请先提交自己的作答，再查看完整解析',409);}
  this.store.db.prepare('UPDATE assignments SET hints=hints+1,full_solution=MAX(full_solution,?) WHERE id=?').run(full?1:0,id);
  return {hint:full?item.reference.explanation:(item.hints[Math.min(row.hints,item.hints.length-1)]||'先解释当前知识点，再尝试新题。'),
    ...(full?{answer:item.reference.answer}:{}),hint_level:full?'full_solution':'concept',count:row.hints+1};
 }
 submit({actor,assignment_id,event_id,answer,explanation='',expected_version}){
  if(typeof answer!=='string'||answer.length>12000||typeof explanation!=='string'||explanation.length>6000)failure('作答格式或长度不符合要求');
  if(typeof event_id!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(event_id))failure('请提供有效提交事件编号');
  const row=this.assignment(actor,assignment_id);const item=this.data.items.get(row.item_id);
  const payload={assignment_id,answer,explanation};const previous=this.store.db.prepare('SELECT * FROM submissions WHERE id=?').get(event_id);
  if(previous){if(previous.user_id!==actor.id||previous.payload_hash!==hash(payload))failure('事件编号与已提交内容不一致',409);return JSON.parse(previous.result);}
  const course=this.access(actor,item.course_id);let assessment=null;
  if(item.assessment_mode==='plugin'){
   const id=item.assessment?.capability,handler=this.data.assessmentRegistry?.get(id);
   if(!handler||!course.required_capabilities.includes(id))failure('课程评阅插件不可用',409);
   assessment=handler.assess(answer,item.assessment.config);
  }
  const release=this.store.release(row.policy_version);const result=grade(this.data,item,{answer,explanation},release.config,{count:row.hints,full:Boolean(row.full_solution)},assessment);
  result.policy_version=release.version;result.item_id=item.id;result.course_id=item.course_id;
  result.submitted_answer=answer;result.submitted_explanation=explanation;
  return this.store.commitSubmission({id:event_id,user:actor.id,course:item.course_id,item,payload,result,expectedVersion:expected_version});
 }
}
