import path from 'node:path';
import {existsSync,mkdirSync,writeFileSync,copyFileSync,readFileSync,readdirSync} from 'node:fs';
import {ROOT} from '../src/data.mjs';
import {PILOT_OUTPUT} from '../src/pilot-evaluation.mjs';
import {ModelBudget} from '../src/longcat-client.mjs';
const reportFile=path.join(PILOT_OUTPUT,'reports/longcat-validation.json');mkdirSync(path.dirname(reportFile),{recursive:true});
if(existsSync(reportFile)){const previous=JSON.parse(readFileSync(reportFile,'utf8'));if(previous.actual_requests_this_run>0)copyFileSync(reportFile,path.join(path.dirname(reportFile),'longcat-history-'+previous.created.replace(/[:.]/g,'-')+'.json'));}
const carried=new Map();for(const file of readdirSync(path.dirname(reportFile)).filter(f=>f.startsWith('longcat-history-')&&f.endsWith('.json')).sort()){
 const previous=JSON.parse(readFileSync(path.join(path.dirname(reportFile),file),'utf8'));for(const scenario of previous.scenarios||[])if(scenario.contract_passed&&scenario.result?.runtime?.provider==='longcat'&&scenario.result.runtime.real_model_calls>0)carried.set(scenario.course_id+'/'+scenario.name,{...scenario,reused_from_prior_run:true,source_run:previous.created});
}
const report={provider:'longcat',model:'LongCat-2.0',protocol:'Responses',endpoint:'https://api.longcat.chat/openai/v1/responses',request_limit:30,budget_cny:5,
 actual_requests_this_run:0,scenarios:[...carried.values()],human_review:'pending',not_a_learning_effect_experiment:true,created:new Date().toISOString()};
const save=()=>writeFileSync(reportFile,JSON.stringify(report,null,2));
if(!process.env.LONGCAT_API_KEY){report.status='blocked_missing_longcat_key';report.reason='LONGCAT_API_KEY is not configured in this process; no real requests made.';save();console.log(JSON.stringify({status:report.status,actual_requests:0,report:reportFile}));process.exitCode=2;}
else{
 process.env.TUTOR_ENABLE_REAL_MODEL='1';process.env.TUTOR_PROVIDER='longcat';process.env.TUTOR_MODEL_ID='LongCat-2.0';
 const budgetFile=process.env.TUTOR_LONGCAT_BUDGET||path.join(ROOT,'var/longcat-budget.sqlite');const before=new ModelBudget(budgetFile),initial=before.summary();before.close();
 const {createApp}=await import('../src/server.mjs');let app,cookie;
 const request=async(url,body)=>{const r=await fetch(app.origin+url,{method:body===undefined?'GET':'POST',headers:{cookie:cookie||'','content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const result=await r.json();if(!r.ok)throw new Error(result.error||'Operation failed');return result;};
 try{
  app=await createApp({port:0,varDir:path.join(ROOT,'var/longcat-validation'),defaultEngine:'local'});
  await request('/api/demo-login',{role:'teacher'});await request('/api/teacher/pilot/setup',{});
  for(const course of ['python_pilot','ai_literacy_pilot']){
   const concept=course==='python_pilot'?'lists':'train_infer',normal=course==='python_pilot'?'浅拷贝是否复制嵌套列表？':'训练和推理的区别是什么？';
   const done=name=>report.scenarios.some(s=>s.course_id===course&&s.name===name&&s.contract_passed);
   const add=(name,result,contract)=>{const accepted=!result.model_output_error&&result.runtime?.provider==='longcat';report.scenarios=report.scenarios.filter(s=>s.course_id!==course||s.name!==name);report.scenarios.push({name,course_id:course,result,contract_passed:accepted&&contract,human_review:'pending'});save();console.log(JSON.stringify({scenario:name,course,contract_passed:accepted&&contract}));};
   if(!done('evidence_grounded_question')){const supported=await request('/api/teacher/preview/ask',{course_id:course,query:normal,engine:'harness'});add('evidence_grounded_question',supported,supported.citations.length>0);}
   if(!done('insufficient_evidence')){const unsupported=await request('/api/teacher/preview/ask',{course_id:course,query:'请给出本校明天考试的教室和监考人姓名',engine:'harness'});add('insufficient_evidence',unsupported,unsupported.citations.length===0);}
   if(!done('contradictory_reason')){
   const first=(await request('/api/teacher/preview/practice',{course_id:course,concept_id:concept,engine:'local'})).items[0],ref=app.data.items.get(first.id);
   const badReason=course==='python_pilot'?'切片总是与原列表是同一对象':'修改提示词必然更新模型权重';
   const contradiction=await request('/api/teacher/preview/submit',{assignment_id:first.assignment_id,event_id:crypto.randomUUID(),answer:ref.reference.answer,explanation:badReason,expected_version:first.state_version,engine:'harness'});add('contradictory_reason',contradiction,contradiction.next_action==='probe_contradiction');}
   if(!done('hint_dependency')){
   const second=(await request('/api/teacher/preview/practice',{course_id:course,concept_id:concept,engine:'local'})).items[0],ref2=app.data.items.get(second.id);await request('/api/teacher/preview/hint',{assignment_id:second.assignment_id});
   const hinted=await request('/api/teacher/preview/submit',{assignment_id:second.assignment_id,event_id:crypto.randomUUID(),answer:ref2.reference.answer,explanation:course==='python_pilot'?'原地修改同一列表':'推理使用固定参数，训练更新参数',expected_version:second.state_version,engine:'harness'});add('hint_dependency',hinted,hinted.hints_used===1&&hinted.independent_evidence===false);}
   if(!done('followup_practice')){const transfer=await request('/api/teacher/preview/practice',{course_id:course,concept_id:concept,engine:'harness'});add('followup_practice',transfer,transfer.items.length===1);}
  }
  report.status=report.scenarios.length===10&&report.scenarios.every(s=>s.contract_passed)?'real_calls_completed_pending_human_review':'completed_with_contract_failures';
 }catch(e){report.status='stopped_on_failure';report.reason=e.message;report.no_automatic_retry=true;}
 finally{
  if(app)await app.close();const ledger=new ModelBudget(budgetFile);report.budget=ledger.summary();report.actual_requests_this_run=report.budget.requests-initial.requests;report.estimated_cost_this_run_cny=report.budget.charged_cny-initial.charged_cny;ledger.close();save();
  console.log(JSON.stringify({status:report.status,scenarios:report.scenarios.length,actual_requests:report.actual_requests_this_run,report:reportFile}));
  if(report.status!=='real_calls_completed_pending_human_review')process.exitCode=1;
 }
}
