import path from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createApp} from '../src/server.mjs';
import {ROOT} from '../src/data.mjs';
process.env.TUTOR_ENABLE_REAL_MODEL='0';
const dir=path.join(ROOT,'var/harness-smoke-'+Date.now());
const app=await createApp({port:0,varDir:dir,dbPath:':memory:'});
let cookie;
async function request(url,body){
 const response=await fetch(app.origin+url,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'content-type':'application/json'}),...(cookie?{cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
 const value=await response.json();if(!response.ok)throw new Error(JSON.stringify(value));return value;
}
try{
 await request('/api/demo-login',{role:'student'});
 const ask=await request('/api/ask',{course_id:'python',query:'切片和浅拷贝有什么区别？',engine:'harness'});
 const practice=await request('/api/practice',{course_id:'python',concept_id:'lists',count:1,engine:'harness'});
 const item=practice.items[0];const grade=await request('/api/submit',{assignment_id:item.assignment_id,event_id:'smoke-event-001',answer:'[2, 9]',explanation:'a 和 b 指向同一列表对象，原地修改可从 a 看到。',expected_version:0,engine:'harness'});
 await request('/api/demo-login',{role:'admin'});await request('/api/admin/plugins/install',{plugin_id:'numeric_check'});
 await request('/api/teacher/onboarding/template',{course_id:'numeric_smoke',title:'数值插件链路测试夹具',template_id:'numeric',department:'合成测试院系',teacher:'测试身份',classes:['合成教学班'],
  topics:[{id:'addition',title:'数值相加',objective:'核验数值',summary:'本条为合成测试夹具，验证插件链路。',support:['相加'],source:{url:'https://example.org/test-fixture',text:'合成测试资料，不作真实教学来源。',license:'Synthetic test fixture'},
   question:{prompt:'1+2 的数值是多少？',answer:'3',required_points:['相加'],numeric:{target:3,absolute_tolerance:0.01}}}]});
 await request('/api/teacher/review',{item_id:'L-numeric_smoke-addition-001',status:'approved',notes:'自动化测试状态夹具，非教师审定。'});
 await request('/api/teacher/onboarding/numeric_smoke/publish',{notes:'自动化测试发布夹具，非真实课程。'});
 await request('/api/demo-login',{role:'student'});
 const numericPractice=await request('/api/practice',{course_id:'numeric_smoke',count:1,engine:'harness'});
 const numericGrade=await request('/api/submit',{assignment_id:numericPractice.items[0].assignment_id,event_id:'smoke-numeric-001',answer:'3.005',explanation:'把数值相加。',expected_version:0,engine:'harness'});
 await request('/api/demo-login',{role:'teacher'});await request('/api/teacher/pilot/setup',{});const pilotRuns=[];
 for(const course of ['python_pilot','ai_literacy_pilot']){
  const query=course==='python_pilot'?'列表浅拷贝':'模型训练 training';
  const q=await request('/api/teacher/preview/ask',{course_id:course,query,engine:'harness'});
  const p=await request('/api/teacher/preview/practice',{course_id:course,count:1,engine:'harness'}),item=p.items[0],ref=app.data.items.get(item.id);
  const g=await request('/api/teacher/preview/submit',{assignment_id:item.assignment_id,event_id:'smoke-'+course+'-001',answer:ref.reference.answer,explanation:course==='python_pilot'?'原地修改同一列表。':'训练更新参数，推理使用固定参数。',expected_version:0,engine:'harness'});
  pilotRuns.push({tool:'retrieve_evidence',course,runtime:q.runtime,citations:q.citations.length},{tool:'generate_task',course,runtime:p.runtime,items:p.items.length},{tool:'verify_submission',course,runtime:g.runtime,preview:g.preview});
 }
 const report={status:'passed',paid_model_calls:0,mode:'official_harness_scripted_adapter',
  runs:[{tool:'retrieve_evidence',runtime:ask.runtime,citations:ask.citations.length},{tool:'generate_task',runtime:practice.runtime,items:practice.items.length},{tool:'verify_submission',runtime:grade.runtime,correct:grade.correct,state_version:grade.state.version},
   {tool:'generate_task',course:'numeric_smoke',runtime:numericPractice.runtime,items:numericPractice.items.length},
   {tool:'verify_submission',course:'numeric_smoke',runtime:numericGrade.runtime,correct:numericGrade.correct,assessment_method:numericGrade.assessment_method},...pilotRuns],
  note:'Verifies real headless/profile/tool/session plumbing with a scripted adapter; not LLM reasoning quality.'};
 if(report.runs.some(x=>!x.runtime.session_id))throw new Error('Missing official Harness session identity');
 if(numericGrade.correct!==true||numericGrade.assessment_method!=='numeric_tolerance')throw new Error('Numeric extension did not participate in Harness grading');
 mkdirSync(path.join(ROOT,'reports'),{recursive:true});writeFileSync(path.join(ROOT,'reports/harness-smoke.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await app.close();}
