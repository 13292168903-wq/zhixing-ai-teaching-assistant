import path from 'node:path';
import {readJSONL} from './data.mjs';
import {assessExplanation} from './pedagogy.mjs';
import {uid,hash,failure} from './store.mjs';
import {constructAdaptivePairs} from './adaptive.mjs';

/** Rule decisions consume task inputs and simulated tool facts, never oracle fields. */
export function contractDecision(facts,config={}){
 const f=facts;const result={action:'continue_supported_task',state_write:false,independent_mastery:false};
 if('authorized'in f)return {...result,action:f.authorized?'scope_learner':'deny_scope'};
 if('record_course_id'in f)return {...result,action:f.record_course_id===f.course_id?'scope_course':'deny_scope'};
 if('matches'in f)return {...result,action:f.matches.length?'retrieve_evidence':'ask_clarification'};
 if('notices'in f)return {...result,action:f.notices.filter(x=>x.status==='active').length>1?'ask_clarification':'resolve_version'};
 if('request_origin'in f)return {...result,action:f.request_origin==='authorized_teacher'?'respect_teaching_mode':'treat_content_as_data'};
 if('explanation_consistent'in f)return {...result,action:f.explanation_consistent?'check_explanation':'probe_contradiction'};
 if('method_correct'in f)return {...result,action:f.answer_correct?'continue_supported_task':'localize_error'};
 if('unresolved_questions'in f)return {...result,action:f.unresolved_questions>1?'ask_clarification':'clarify_reference'};
 if('exhaustive_for_stated_finite_scope'in f)return {...result,action:'test_generalization'};
 if('conflicting_errors'in f)return {...result,action:f.conflicting_errors?'aggregate_evidence':'continue_supported_task'};
 if('hint_level'in f)return {...result,action:'track_hint_level'};
 if('same_template'in f)return {...result,action:config.require_transfer||!f.same_template?'request_transfer':'continue_supported_task'};
 if('repeated_ineffective_hints'in f)return {...result,action:'choose_next_action'};
 if('teacher_allows_solution'in f)return {...result,action:'respect_teaching_mode'};
 if('full_solution_seen'in f)return {...result,action:'limit_mastery_scope'};
 if('already_applied'in f)return {...result,action:'idempotent_update',state_write:!f.already_applied};
 if('proposed_base_version'in f)return {...result,action:'validate_state_version',state_write:f.current_version===f.proposed_base_version};
 if('experience_status'in f)return {...result,action:'select_verified_experience',experience_used:f.experience_status==='verified_enabled'&&f.conditions_match};
 if('fallback_text'in f)return {...result,action:'validate_score',state_write:f.score!==null&&f.evidence_valid};
 if('status'in f)return {...result,action:'handle_tool_result',state_write:f.status==='success'&&f.score!==null};
 return {...result,action:'ask_clarification'};
}
function explanationDecision(data,course,concept,text,config){
 const initial=assessExplanation(data.courses.get(course).cards.concepts[concept],text,config);
 const unqualified=config.flag_unqualified_absolutes&&/(必然|必定|绝对|一定|总是|所有|总不会)/.test(text)&&!/(不能|不一定|不保证|不等于|不代表)/.test(text);
 return initial.status==='contradiction'||unqualified?'probe_contradiction':'acknowledge_progress';
}
function judge(data,c,config){
 // Only input messages / tool fixtures enter the decision. Reference used BELOW for scoring.
 let prediction;
 if(c.course_id==='platform')prediction=contractDecision(Object.values(c.tool_fixtures)[0],config);
 else {
  const text=c.messages.map(m=>m.content).join('\n');
  const explanation=c.course_id==='python'?text.split('我的解释是：').at(-1):text.split('我目前的理解是：').at(-1);
  prediction={action:explanationDecision(data,c.course_id,c.concept_id,explanation,config),state_write:false,independent_mastery:false};
 }
 const ref=c.reference;
 // Closed checks cover action contracts only. Open pedagogical quality remains unscored.
 let pass=ref.allowed_actions.includes(prediction.action);
 if(c.course_id==='platform'){
  const key=Object.keys(c.tool_fixtures)[0],f=Object.values(c.tool_fixtures)[0];
  const allowed={scope_course:['scope_course','deny_scope'],scope_learner:['scope_learner','deny_scope'],retrieve_evidence:['retrieve_evidence','ask_clarification'],
   resolve_version:['resolve_version','ask_clarification'],treat_content_as_data:['treat_content_as_data','respect_teaching_mode'],
   check_explanation:['check_explanation','probe_contradiction'],localize_error:['localize_error','continue_supported_task'],
   clarify_reference:['clarify_reference','ask_clarification'],test_generalization:['test_generalization'],aggregate_evidence:['aggregate_evidence','continue_supported_task'],
   track_hint_level:['track_hint_level'],request_transfer:['request_transfer'],choose_next_action:['choose_next_action'],respect_teaching_mode:['respect_teaching_mode'],
   limit_mastery_scope:['limit_mastery_scope'],handle_tool_result:['handle_tool_result'],validate_score:['validate_score'],
   validate_state_version:['validate_state_version'],idempotent_update:['idempotent_update'],select_verified_experience:['select_verified_experience']}[key];
  pass=Boolean(allowed?.includes(prediction.action));
  if(key==='scope_course')pass&&=(prediction.action==='deny_scope')===(f.course_id!==f.record_course_id);
  if(key==='scope_learner')pass&&=(prediction.action==='deny_scope')===!f.authorized;
  if(key==='validate_state_version')pass&&=prediction.state_write===(f.current_version===f.proposed_base_version);
  if(key==='idempotent_update')pass&&=prediction.state_write===!f.already_applied;
  if(key==='handle_tool_result')pass&&=prediction.state_write===(f.status==='success'&&f.score!==null);
  if(key==='validate_score')pass&&=prediction.state_write===(f.score!==null&&f.evidence_valid);
  if(key==='select_verified_experience')pass&&=prediction.experience_used===(f.experience_status==='verified_enabled'&&f.conditions_match);
 }
 return {id:c.id,course_id:c.course_id,concept_id:c.concept_id,prediction,pass,critical:false};
}
export class Evaluator {
 constructor(data,store){this.data=data;this.store=store;}
 cases(partition){
  if(!['dev','validation','test'].includes(partition))failure('评测分区不正确');
  const folder=partition==='test'?path.join(this.data.base,'evaluator_private/holdout'):path.join(this.data.base,'eval',partition);
  const inputs=readJSONL(path.join(folder,'inputs.jsonl')),refs=new Map(readJSONL(path.join(folder,'references.jsonl')).map(x=>[x.id,x.reference])),fixtures=new Map(readJSONL(path.join(folder,'tool_fixtures.jsonl')).map(x=>[x.id,x.tool_fixtures]));
  return inputs.map(c=>({...c,reference:refs.get(c.id),tool_fixtures:fixtures.get(c.id)}));
 }
 run({partition='dev',version,config,frozen=false,casesOverride=null}){
  if(partition==='test'&&!frozen)failure('最终测试需要显式确认版本已冻结',409);
  if(partition==='test'&&this.store.get('final_test_run')){
   const previous=JSON.parse(this.store.db.prepare('SELECT result FROM eval_runs WHERE id=?').get(this.store.get('final_test_run')).result);
   if(previous.version!==version)failure('本数据版本的最终测试已开启；新一轮优化需要新的独立测试集',409);
   return {...previous,cached:true};
  }
  if(casesOverride&&partition!=='dev')failure('动态任务只能进入开发区');
  const policy=config||this.store.release(version).config;
  const cases=casesOverride||this.cases(partition),results=cases.map(c=>judge(this.data,c,policy));
  const output={id:uid(),partition,version,mode:'offline_rule_contract_checks',total:results.length,passed:results.filter(x=>x.pass).length,
   failed:results.filter(x=>!x.pass).length,results:partition==='test'?undefined:results,open_pedagogy_score:null,
   real_model_calls:0,quality_note:'仅运行固定规则和预设工具条件；不代表 LLM 教学质量或真实学习效果。',created:new Date().toISOString()};
  this.store.db.prepare('INSERT INTO eval_runs VALUES(?,?,?,?,?)').run(output.id,partition,version,JSON.stringify(output),output.created);
  if(partition==='test')this.store.set('final_test_run',output.id);
  return output;
 }
 propose(actor){
  if(this.store.get('final_test_run'))failure('最终测试已开启，本数据版本的优化阶段已关闭',409);
  if(this.store.db.prepare('SELECT COUNT(*) AS n FROM candidates').get().n>=6)failure('候选预算已达到六项，需结束本轮并重新规划验证数据',409);
  const parent=this.store.release();const baseline=this.run({partition:'dev',version:parent.version});
  const config={...parent.config,flag_unqualified_absolutes:true,require_transfer:true,applicable_courses:[...new Set(this.cases('dev').filter(c=>c.course_id!=='platform').map(c=>c.course_id))]};
  const id='candidate-'+uid().slice(0,8);const reason={failure_run_id:baseline.id,observed_failures:baseline.failed,
   hypothesis:'对未加限定的绝对化解释增加概念矛盾筛查，并要求同模板练习后复查迁移。',
   scope:'规则候选；不是自动生成的事实或训练后的模型。需独立验证并人工确认误报风险。'};
  this.store.db.prepare('INSERT INTO candidates VALUES(?,?,?,?,?,?,?)').run(id,parent.version,JSON.stringify(config),JSON.stringify(reason),null,'pending',new Date().toISOString());
  this.store.audit(actor.id,'candidate_proposed',{id,parent:parent.version});return {id,parent:parent.version,config,reason,status:'pending'};
 }
 validate(id,actor){
  if(this.store.get('final_test_run'))failure('最终测试已开启，不能继续选择配置',409);
  const c=this.store.db.prepare('SELECT * FROM candidates WHERE id=?').get(id);if(!c)failure('候选不存在',404);
  if(this.store.get('published_version')!==c.parent)failure('父版本已变化，请基于当前版本重新提出候选',409);
  const queryCount=this.store.db.prepare("SELECT COUNT(*) AS n FROM eval_runs WHERE partition='validation'").get().n;
  if(queryCount>=12)failure('本轮验证查询预算已用尽，需要补充新的独立验证任务',409);
  const old=this.run({partition:'validation',version:c.parent});const updated=this.run({partition:'validation',version:c.id,config:JSON.parse(c.config)});
  const oldDev=this.run({partition:'dev',version:c.parent});const newDev=this.run({partition:'dev',version:c.id,config:JSON.parse(c.config)});
  const validation={baseline:old,candidate:updated,development:{baseline:oldDev.passed,candidate:newDev.passed},
   passed:updated.passed>old.passed&&newDev.passed>=oldDev.passed,criterion:'独立验证总通过数严格增加，开发回归不下降；开放质量仍需教师审核。',
   new_regressions:old.results.filter(r=>r.pass&&!updated.results.find(n=>n.id===r.id)?.pass).map(r=>r.id)};
  validation.passed&&=validation.new_regressions.length===0;
  this.store.db.prepare('UPDATE candidates SET validation=?,status=? WHERE id=?').run(JSON.stringify(validation),validation.passed?'validated':'rejected',id);
  this.store.audit(actor.id,'candidate_validated',{id,passed:validation.passed});return validation;
 }
 publish(id,actor){
  if(this.store.get('final_test_run'))failure('最终测试后不再发布本轮候选配置',409);
  const c=this.store.db.prepare('SELECT * FROM candidates WHERE id=?').get(id);if(!c||c.status!=='validated')failure('仅独立验证通过的候选可以发布',409);
  if(c.parent!==this.store.get('published_version'))failure('父版本已变化，不能发布过期候选',409);
  const config=JSON.parse(c.config),experience={id:'exp-'+id,version:id,failure_evidence_ids:[JSON.parse(c.reason).failure_run_id],hypothesis:JSON.parse(c.reason).hypothesis,
    proposed_action:'flag_unqualified_absolutes + require_transfer',applicable_courses:config.applicable_courses,conditions:{task:'解释诊断与迁移复查'},
    validation_run_ids:[JSON.parse(c.validation).candidate.id],counterexamples:[],approved_by:actor.id,approval_kind:'local_demo_teacher_action',status:'verified_enabled'};
  this.store.db.exec('BEGIN IMMEDIATE');try{
   this.store.db.prepare('INSERT INTO releases VALUES(?,?,?,?,?,?)').run(id,c.config,'published',c.parent,actor.id,new Date().toISOString());
   this.store.db.prepare('INSERT INTO experiences VALUES(?,?,?,?)').run(experience.id,JSON.stringify(experience),'verified_enabled',id);
   this.store.set('published_version',id);this.store.db.prepare('UPDATE candidates SET status=? WHERE id=?').run('published',id);this.store.db.exec('COMMIT');
  }catch(e){this.store.db.exec('ROLLBACK');throw e;}
  this.store.audit(actor.id,'release_published',{version:id});return this.store.release();
 }
 rollback(actor){
  const current=this.store.release();if(!current.parent)failure('当前版本没有可回退的父版本',409);
  this.store.db.exec('BEGIN IMMEDIATE');try{
   this.store.set('published_version',current.parent);this.store.db.prepare("UPDATE experiences SET status='withdrawn' WHERE version=?").run(current.version);this.store.db.exec('COMMIT');
  }catch(e){this.store.db.exec('ROLLBACK');throw e;}
  this.store.audit(actor.id,'release_rollback',{from:current.version,to:current.parent});return this.store.release();
 }
 adaptive(actor,count=6){
  if(this.store.get('final_test_run'))failure('最终测试已开启，不能继续定向扩展本轮开发任务',409);
  const dev=this.cases('dev');const version=this.store.get('published_version');const report=this.run({partition:'dev',version});
  const failed=new Set(report.results.filter(x=>!x.pass).map(x=>x.id));
  const selected=dev.filter(x=>failed.has(x.id));
  const constructed=constructAdaptivePairs(selected,Math.min(count,12));
  const candidates=constructed.accepted.length?constructed.accepted:selected.slice(0,Math.min(count,12)).map((c,i)=>({...c,id:c.id+'-adaptive-'+i,
    messages:c.messages.map(m=>({...m,content:m.content+'\n请先说明依据，再给出下一步建议。'})),
    provenance:{origin:'dev_only_instruction_variant',parent_id:c.id,source_family:'same_as_parent',new_independent_family:false}}));
  const variants=[];
  for(const c of candidates){const fingerprint=hash({messages:c.messages,tool_fixtures:c.tool_fixtures,source:c.provenance.parent_id});
   if(this.store.db.prepare('SELECT 1 FROM adaptive_tasks WHERE fingerprint=?').get(fingerprint))continue;
   c.id='adaptive-'+fingerprint.slice(0,16);this.store.db.prepare('INSERT INTO adaptive_tasks VALUES(?,?,?,?,?)').run(c.id,c.provenance.parent_id,fingerprint,JSON.stringify(c),new Date().toISOString());variants.push(c);
  }
  const extra=this.run({partition:'dev',version,config:this.store.release().config,casesOverride:variants});
  this.store.audit(actor.id,'adaptive_dev_variants',{count:variants.length,run_id:extra.id,new_independent_families:0});
  return {variants,report:extra,new_independent_families:0,new_generator_shapes:[...new Set(variants.map(v=>v.provenance.generator_shape).filter(Boolean))].length,
   rejected:constructed.rejected,stop_reason:variants.length?'batch_complete':'no_new_unique_variants',notice:'有限受信程序模板按开发区失败定向构建，并核验参考输出；保留父家族归属。不是独立泛化测试或完整开放搜索。'};
 }
}
