import {existsSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {ROOT} from '../src/data.mjs';
import {ModelBudget,OUTPUT_TOKENS} from '../src/longcat-client.mjs';
const file=path.resolve(ROOT,'../output/pilot-v0.6/reports/longcat-validation.json'),ledgerPath=path.join(ROOT,'var/longcat-budget.sqlite');
if(existsSync(file))throw new Error('Preserve existing run; archive it explicitly before a diagnosed rerun.');
if(!process.env.LONGCAT_API_KEY)throw new Error('LONGCAT_API_KEY required; no calls made.');
const summary=()=>{const b=new ModelBudget(ledgerPath);try{return b.summary();}finally{b.close();}},initial=summary();
const report={revision:'0.6.0',protocol:'claim_json_v06',provider:'longcat',model:'LongCat-2.0',request_limit:null,budget_cny:null,max_output_tokens_per_request:OUTPUT_TOKENS,initial_ledger:initial,created:new Date().toISOString(),scenarios:[],human_review:'pending',no_automatic_retry:true,scope:'15 finite development acceptance scenarios; no sealed references or real students'};
const save=()=>writeFileSync(file,JSON.stringify(report,null,2));let app,cookie;
process.env.TUTOR_ENABLE_REAL_MODEL='1';process.env.TUTOR_PROVIDER='longcat';process.env.TUTOR_MODEL_ID='LongCat-2.0';
const {createApp}=await import('../src/server.mjs');
const post=async(route,body)=>{const response=await fetch(app.origin+route,{method:'POST',headers:{cookie:cookie||'','content-type':'application/json'},body:JSON.stringify(body)});if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];const r=await response.json();if(!response.ok)throw new Error(r.error);return r;};
const add=(course,name,result,pass)=>{const contract_passed=Boolean(pass&&!result.model_output_error&&result.runtime?.provider==='longcat');report.scenarios.push({course_id:course,name,result,contract_passed,semantic_quality:'pending_human_review'});save();console.log(JSON.stringify({course,name,contract_passed,calls:result.runtime?.real_model_calls}));};
try{
 app=await createApp({port:0,defaultEngine:'local'});await post('/api/demo-login',{role:'teacher'});
 const configs=[['python_pilot','lists','浅拷贝会复制嵌套列表吗？','浅拷贝会递归复制每一层'],['ai_literacy_pilot','train_infer','训练与推理有什么区别？','修改提示词必然更新模型权重'],['statistics_pilot','sample_variance','样本方差与总体方差的分母有什么区别？','样本方差总是除以n']];
 for(const [course,concept,query,wrongReason]of configs){
  const ask=await post('/api/teacher/preview/ask',{course_id:course,query,engine:'harness'});add(course,'grounded_claims',ask,ask.model_claims?.length>0&&ask.model_citation_ids?.length>0);
  const absent=await post('/api/teacher/preview/ask',{course_id:course,query:course+' 本校明天考试在哪个教室？',engine:'harness'});add(course,'insufficient_evidence',absent,absent.citations.length===0&&absent.model_answer_status==='insufficient');
  const partial=await post('/api/teacher/preview/ask',{course_id:course,query:query+'；另外本校明天考试在哪个教室？',engine:'harness'});add(course,'partial_answer',partial,partial.evidence_scope?.partial_answer_only&&partial.model_answer_status==='partial'&&partial.unresolved_questions?.length>0);
  const a=(await post('/api/teacher/preview/practice',{course_id:course,concept_id:concept,engine:'local'})).items[0],ref=app.data.items.get(a.id).reference;
  const bad=await post('/api/teacher/preview/submit',{assignment_id:a.assignment_id,event_id:crypto.randomUUID(),answer:ref.answer,explanation:wrongReason,expected_version:a.state_version,engine:'harness'});add(course,'correct_answer_wrong_reason',bad,bad.next_action==='probe_contradiction'&&bad.independent_evidence===false);
  const b=(await post('/api/teacher/preview/practice',{course_id:course,concept_id:concept,engine:'local'})).items[0],reference=app.data.items.get(b.id).reference;await post('/api/teacher/preview/hint',{assignment_id:b.assignment_id});
  const hinted=await post('/api/teacher/preview/submit',{assignment_id:b.assignment_id,event_id:crypto.randomUUID(),answer:reference.answer,explanation:reference.explanation,expected_version:b.state_version,engine:'harness'});add(course,'hint_dependency',hinted,hinted.hints_used===1&&hinted.independent_evidence===false&&hinted.explanation_status==='provisional_support');
 }
 report.status=report.scenarios.every(s=>s.contract_passed)?'real_calls_completed_pending_human_review':'completed_with_contract_failures';
}catch(e){report.status='stopped_on_failure';report.reason=e.message;}
finally{if(app)await app.close();report.budget=summary();report.actual_requests_this_run=report.budget.requests-initial.requests;report.conservative_cost_this_run=report.budget.charged_cny-initial.charged_cny;save();console.log(JSON.stringify({status:report.status,scenarios:report.scenarios.length,passed:report.scenarios.filter(s=>s.contract_passed).length,requests:report.actual_requests_this_run,cumulative:report.budget.requests,estimated_cost_cny:report.conservative_cost_this_run}));if(report.status!=='real_calls_completed_pending_human_review')process.exitCode=1;}
