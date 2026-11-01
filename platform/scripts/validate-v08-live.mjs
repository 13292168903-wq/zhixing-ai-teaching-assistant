import path from 'node:path';
import {writeFileSync} from 'node:fs';
import {createPilotFixture,FIXTURE_PASSWORD} from './pilot08-fixture.mjs';
import {ROOT} from '../src/data.mjs';
import {ModelBudget} from '../src/longcat-client.mjs';
import {consumeChat,explanationPrefix} from '../public/chat-stream.mjs';
export async function validateV08Live(){
 const {app,users}=await createPilotFixture({real:true}),budget=new ModelBudget(app.harness.budgetPath),before=budget.summary(),report={scope:'isolated_synthetic_fixture_not_teacher_approval_or_learning_effect',cases:[]};
 const login=await fetch(app.origin+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:users.student.username,password:FIXTURE_PASSWORD})}),cookie=login.headers.get('set-cookie').split(';')[0];
 const call=async(url,b)=>{const r=await fetch(app.origin+url,{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify(b)});const data=await r.json();if(!r.ok)throw Error(data.error);return data;};
 try{for(const [item_id,explanation]of [
 ['P08-lists-alias_write','另一个名字拿到的依然是那块存储，改变一个入口，另一个入口看到的内容也跟着变。'],
 ['P08-range-exclusive_bound','右端数字只是停止的位置，并不会被遍历到。'],
 ['P08-defaults-shared_calls','那个空容器在函数建好时就有了，不传第二个实参的几次调用一直往里面加东西。'],
 ['P08-returns-print_none','屏幕先出现七，接收调用结果的变量没有得到七，它的值是 None。']]){
  const item=app.data.items.get(item_id),task=(await call('/api/practice',{course_id:'python_pilot',item_id,engine:'local'})).items[0],start=Date.now(),result=await call('/api/submit',{assignment_id:task.assignment_id,event_id:crypto.randomUUID(),answer:item.reference.answer,explanation});
  const checks={objective_correct:result.correct===true,advisory_only:result.explanation_auxiliary?.status==='advisory_only_pending_teacher',not_independent:result.independent_evidence===false,actual_model:result.explanation_auxiliary?.runtime?.model_mode==='real'};
  report.cases.push({name:item_id,checks,passed:Object.values(checks).every(Boolean),duration_ms:Date.now()-start,result});console.log(JSON.stringify({name:item_id,checks}));if(!Object.values(checks).every(Boolean))throw Error('explanation protocol acceptance failed');
 }
 for(const[query,mode]of [['你好','tutor'],['Python与C++输出怎样换行？各给一行示例。','tutor'],['那两种语言怎么输出变量n？','tutor'],['本校明天Python考试在哪个教室？','evidence']]){
 const start=Date.now();let deltas=0,raw='',firstVisible;const response=await fetch(app.origin+'/api/ask/stream',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({course_id:'python_pilot',query,answer_mode:mode,conversation_id:'v08-live-conversation',engine:'harness'})});
 const result=await consumeChat(response,e=>{if(e.type==='delta'){deltas++;raw+=e.text;if(explanationPrefix(raw))firstVisible??=Date.now()-start;}});const greeting=query==='你好',checks={accepted:!result.model_output_error,calls:result.runtime.real_model_calls===(greeting?0:1)};if(mode==='evidence')checks.abstains=result.model_answer_status==='insufficient';report.cases.push({name:query,checks,passed:Object.values(checks).every(Boolean),duration_ms:Date.now()-start,deltas,first_visible_ms:firstVisible,result});console.log(JSON.stringify({name:query,checks}));if(!Object.values(checks).every(Boolean))throw Error('chat protocol acceptance failed');}
 }finally{const after=budget.summary();budget.close();report.requests=after.requests-before.requests;report.estimated_cny=after.charged_cny-before.charged_cny;report.main_database_modified=false;report.passed=report.cases.length===8&&report.cases.every(c=>c.passed);await app.close();writeFileSync(path.resolve(ROOT,'../output/pilot-v0.8/reports/longcat-attempt-'+Date.now()+'.json'),JSON.stringify(report,null,2));writeFileSync(path.resolve(ROOT,'../output/pilot-v0.8/reports/longcat-live.json'),JSON.stringify(report,null,2));}
 if(!report.passed)throw Error('Live v0.8 validation incomplete');return report;
}

