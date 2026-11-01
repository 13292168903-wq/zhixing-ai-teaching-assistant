import {createApp} from '../src/server.mjs';
import {ROOT} from '../src/data.mjs';
import {ModelBudget} from '../src/longcat-client.mjs';
import {consumeChat,explanationPrefix} from '../public/chat-stream.mjs';
import {mkdtempSync,writeFileSync} from 'node:fs';
import path from 'node:path';
export async function validateChatSpeed(){
 const ledger=new ModelBudget(path.join(ROOT,'var/longcat-budget.sqlite')),before=ledger.summary();
 const app=await createApp({port:0,varDir:mkdtempSync(path.join(ROOT,'var/live-speed-'))}),report={date:'2026-10-22',scope:'isolated_synthetic_learner',cases:[],baseline:{greeting_ms:10293,requests_per_question:2,source:'chat-fix-live.json; historical measurements, not simultaneous paired trials'}};
 try{
  const login=await fetch(app.origin+'/api/demo-login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({role:'student'})}),cookie=login.headers.get('set-cookie').split(';')[0];
  for(const [name,query,answer_mode] of [['greeting','你好','tutor'],['cold_question','Python print 和 C++ cout 输出与换行有什么区别？给两个简短例子。','tutor'],['warm_followup','刚才这两种语言，怎样输出整数变量 n？','tutor'],['strict_missing','本校明天 Python 考试在哪个教室？','evidence']]){
   const started=Date.now();let firstEvent,firstDelta,firstVisible,raw='',deltas=0;
   const response=await fetch(app.origin+'/api/ask/stream',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({course_id:'python',query,answer_mode,conversation_id:'speed-live-20261022',engine:'harness'})});
   const result=await consumeChat(response,e=>{firstEvent??=Date.now()-started;if(e.type==='delta'){firstDelta??=Date.now()-started;raw+=e.text;deltas++;if(explanationPrefix(raw))firstVisible??=Date.now()-started;}});
   const checks={accepted:!result.model_output_error,expected_calls:result.runtime.real_model_calls===(name==='greeting'?0:1)};
   if(name==='greeting')checks.local=result.runtime.engine==='local_conversation';
   else checks.real=result.runtime.model_mode==='real';
   if(['cold_question','warm_followup'].includes(name)){checks.both_languages=/print/.test(result.model_answer||'')&&/cout/.test(result.model_answer||'');checks.stream=deltas>0&&firstVisible!==undefined;}
   if(name==='warm_followup'){checks.worker_reused=result.runtime.worker_reused;checks.history=result.chat_context.history.some(h=>h.question.includes('C++'));}
   if(name==='strict_missing')checks.abstains=result.model_answer_status==='insufficient'&&result.citations.length===0;
   report.cases.push({name,query,checks,passed:Object.values(checks).every(Boolean),total_ms:Date.now()-started,first_event_ms:firstEvent,first_delta_ms:firstDelta,first_visible_ms:firstVisible,deltas,result});
   console.log(JSON.stringify({name,...report.cases.at(-1),result:undefined}));if(!Object.values(checks).every(Boolean))break;
  }
  report.learning_states=app.store.db.prepare('SELECT COUNT(*) n FROM states').get().n;report.submissions=app.store.db.prepare('SELECT COUNT(*) n FROM submissions').get().n;
 }finally{await app.close();const after=ledger.summary();ledger.close();report.requests=after.requests-before.requests;report.estimated_cny=Number((after.charged_cny-before.charged_cny).toFixed(6));report.passed=report.cases.length===4&&report.cases.every(x=>x.passed);writeFileSync(path.resolve(ROOT,'../output/pilot-v0.7/reports/chat-speed-live.json'),JSON.stringify(report,null,2));}
 if(!report.passed)throw Error('Speed acceptance incomplete; inspect report');return report;
}
