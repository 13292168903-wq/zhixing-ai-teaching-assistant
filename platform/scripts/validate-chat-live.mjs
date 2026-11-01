import {createApp} from '../src/server.mjs';
import {ROOT} from '../src/data.mjs';
import {ModelBudget} from '../src/longcat-client.mjs';
import {mkdtempSync,writeFileSync} from 'node:fs';
import path from 'node:path';
export async function validateLiveChat(){
 const ledgerPath=path.join(ROOT,'var/longcat-budget.sqlite');process.env.TUTOR_LONGCAT_BUDGET=ledgerPath;
 const budget=new ModelBudget(ledgerPath),before=budget.summary();budget.close();
 const app=await createApp({port:0,varDir:mkdtempSync(path.join(ROOT,'var/live-chat-repair-')),defaultEngine:'harness'}),report={scope:'isolated_synthetic_learner; finite_4_scenarios; real_model; no_main_learning_or_review_writes',cases:[],before};
 try{
  const login=await fetch(app.origin+'/api/demo-login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({role:'student'})}),cookie=login.headers.get('set-cookie').split(';')[0];
  for(const [name,query,answer_mode] of [
   ['greeting','你好','tutor'],
   ['cross_language','输出怎么说？和c++的什么区别？请比较Python和C++并各给一个输出例子。','tutor'],
   ['contextual_followup','那换行和输出变量分别怎么写？刚才说的两种语言都举例。','tutor'],
   ['strict_missing_evidence','本校明天Python考试在哪个教室？','evidence']]){
   const started=Date.now(),response=await fetch(app.origin+'/api/ask',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({course_id:'python',query,answer_mode,conversation_id:'live-chat-repair',engine:'harness'})}),result=await response.json();
   const checks={http_ok:response.ok,real_model:result.runtime?.model_mode==='real'&&result.runtime.real_model_calls>0,output_accepted:!result.model_output_error&&!!result.model_answer};
   if(name==='greeting')checks.greeting_not_refusal=result.model_answer_status==='conversation'&&!result.model_answer.includes('资料不足');
   if(['cross_language','contextual_followup'].includes(name)){checks.both_languages=/print/.test(result.model_answer||'')&&/cout/.test(result.model_answer||'');checks.model_supplement_labeled=!!result.model_supplement&&result.supplement_provenance==='model_general_knowledge_not_course_verified';}
   if(name==='contextual_followup')checks.same_conversation_context=(result.chat_context?.history||[]).some(x=>x.question.includes('C++'));
   if(name==='strict_missing_evidence')checks.abstention_preserved=result.model_answer_status==='insufficient'&&result.citations?.length===0;
   report.cases.push({name,query,answer_mode,checks,passed:Object.values(checks).every(Boolean),duration_ms:Date.now()-started,result});
   console.log(JSON.stringify({scenario:name,checks,passed:report.cases.at(-1).passed}));
   if(!response.ok)break;
  }
  report.learning_states=app.store.db.prepare('SELECT COUNT(*) n FROM states').get().n;
  report.submissions=app.store.db.prepare('SELECT COUNT(*) n FROM submissions').get().n;
 }finally{
  await app.close();const after=new ModelBudget(ledgerPath);report.after=after.summary();after.close();report.new_requests=report.after.requests-before.requests;report.new_estimated_cny=Number((report.after.charged_cny-before.charged_cny).toFixed(6));
  report.quality_scope='Protocol, context isolation and literal checks; open teaching correctness remains reviewable, not a learning-effect claim';
  writeFileSync(path.resolve(ROOT,'../output/pilot-v0.7/reports/chat-fix-live.json'),JSON.stringify(report,null,2));
 }
 if(report.cases.length!==4||report.cases.some(x=>!x.passed))throw Error('Live chat repair acceptance incomplete; inspect chat-fix-live.json');
 return report;
}
