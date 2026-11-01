import path from 'node:path';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {ROOT} from '../src/data.mjs';
import {ModelBudget,REQUEST_LIMIT} from '../src/longcat-client.mjs';
const out=path.resolve(ROOT,'../output/pilot-v0.5'),file=path.join(out,'reports/longcat-validation.json'),budgetPath=path.join(ROOT,'var/longcat-budget.sqlite');
const budget=new ModelBudget(budgetPath),initial=budget.summary();budget.close();
const report={revision:'0.5.0',provider:'longcat',model:'LongCat-2.0',request_limit:REQUEST_LIMIT,budget_cny:5,prior_cumulative_requests:initial.requests,actual_requests_this_run:0,scenarios:[],human_review:'pending',no_automatic_retry:true,created:new Date().toISOString()};
report.contract_schema='server_generated_review_excerpts_v3';
let originalStart=initial.requests;
const save=()=>writeFileSync(file,JSON.stringify(report,null,2));
if(existsSync(file)){const previous=JSON.parse(readFileSync(file,'utf8'));if(previous.actual_requests_this_run>0){
 const fresh=process.argv.includes('--fresh-quote-selection-contract');
 if(!fresh&&(!process.argv.includes('--resume-reviewed-transport-failure')||previous.status!=='stopped_on_failure'))throw new Error('Existing real report retained; explicit continuation or new contract validation required');
 writeFileSync(path.join(out,'reports/longcat-attempt-'+Date.now()+'.json'),JSON.stringify(previous,null,2));
 originalStart=previous.original_revision_start_requests??previous.prior_cumulative_requests;
 if(fresh){report.scenarios=[];report.continuation_reason='User raised cumulative limit to100; validate all ten scenarios with server-generated review excerpts, semantic entailment stays pending; previous unsuccessful protocol reports retained';}
 else{report.scenarios=previous.scenarios.filter(s=>s.contract_passed).map(s=>({...s,reused_from_same_revision:true}));report.continuation_reason='Reviewed sanitized DS-H log: UND_ERR_CONNECT_TIMEOUT; continue unfinished scenarios only, failed call remains charged';}
}}
if(!process.env.LONGCAT_API_KEY){report.status='blocked_missing_key';save();console.log(JSON.stringify({status:report.status,requests:0}));process.exitCode=2;}
else{
 process.env.TUTOR_ENABLE_REAL_MODEL='1';process.env.TUTOR_PROVIDER='longcat';process.env.TUTOR_MODEL_ID='LongCat-2.0';
 const {createApp}=await import('../src/server.mjs');let app,cookie;
 const request=async(url,body)=>{const r=await fetch(app.origin+url,{method:'POST',headers:{cookie:cookie||'','content-type':'application/json'},body:JSON.stringify(body)});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const x=await r.json();if(!r.ok)throw new Error(x.error);return x;};
 try{
  if(initial.requests+(10-report.scenarios.length)*2>REQUEST_LIMIT)throw new Error('Not enough admission capacity for remaining scenarios; no calls started');
  app=await createApp({port:0,varDir:path.join(ROOT,'var/longcat-v05-validation'),defaultEngine:'local'});await request('/api/demo-login',{role:'teacher'});
  for(const course of ['python_pilot','ai_literacy_pilot']){
   const concept=course==='python_pilot'?'lists':'train_infer';
   if(report.scenarios.filter(s=>s.course_id===course).length===5)continue;
   const add=(name,result,contract)=>{const pass=Boolean(contract&&!result.model_output_error&&result.runtime?.provider==='longcat');report.scenarios.push({course_id:course,name,result,contract_passed:pass,teaching_quality:'pending_human_review'});save();console.log(JSON.stringify({course,name,contract_passed:pass}));};
   const ask=await request('/api/teacher/preview/ask',{course_id:course,query:course==='python_pilot'?'浅拷贝会复制嵌套列表吗？':'训练与推理有什么区别？',engine:'harness'});add('evidence_grounded_question',ask,ask.citations.length>0&&ask.model_evidence_quotes?.length>0);
   const absent=await request('/api/teacher/preview/ask',{course_id:course,query:(course==='python_pilot'?'Python':'AI 通识')+' 本校明天考试在哪个教室？',engine:'harness'});add('insufficient_evidence_with_course_name',absent,absent.citations.length===0);
   const first=(await request('/api/teacher/preview/practice',{course_id:course,concept_id:concept,engine:'local'})).items[0],item=app.data.items.get(first.id);
   const bad=await request('/api/teacher/preview/submit',{assignment_id:first.assignment_id,event_id:crypto.randomUUID(),answer:item.reference.answer,explanation:course==='python_pilot'?'浅拷贝会递归复制每一层':'修改提示词必然更新模型权重',expected_version:first.state_version,engine:'harness'});add('contradictory_reason',bad,bad.next_action==='probe_contradiction'&&bad.independent_evidence===false);
   const second=(await request('/api/teacher/preview/practice',{course_id:course,concept_id:concept,engine:'local'})).items[0],item2=app.data.items.get(second.id);await request('/api/teacher/preview/hint',{assignment_id:second.assignment_id});
   const hint=await request('/api/teacher/preview/submit',{assignment_id:second.assignment_id,event_id:crypto.randomUUID(),answer:item2.reference.answer,explanation:item2.reference.explanation,expected_version:second.state_version,engine:'harness'});add('hint_dependency_with_full_reference_reason',hint,hint.hints_used===1&&hint.independent_evidence===false&&hint.explanation_status==='provisional_support');
   const follow=await request('/api/teacher/preview/practice',{course_id:course,concept_id:concept,engine:'harness'});add('followup_practice',follow,follow.items.length===1);
  }
  report.status=report.scenarios.length===10&&report.scenarios.every(s=>s.contract_passed)?'real_calls_completed_pending_human_review':'completed_with_contract_failures';
 }catch(e){report.status='stopped_on_failure';report.reason=e.message;}
 finally{if(app)await app.close();const ledger=new ModelBudget(budgetPath);report.budget=ledger.summary();ledger.close();report.original_revision_start_requests=originalStart;report.cumulative_revision_requests=report.budget.requests-originalStart;report.actual_requests_this_run=report.budget.requests-initial.requests;report.conservative_cost_this_run=report.budget.charged_cny-initial.charged_cny;save();console.log(JSON.stringify({status:report.status,scenarios:report.scenarios.length,requests:report.actual_requests_this_run,cumulative:report.budget.requests}));if(report.status!=='real_calls_completed_pending_human_review')process.exitCode=1;}
}
