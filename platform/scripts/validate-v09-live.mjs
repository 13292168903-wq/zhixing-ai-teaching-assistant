import {writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {createPilotFixture,FIXTURE_PASSWORD} from './pilot08-fixture.mjs';
import {ROOT} from '../src/data.mjs';
import {ModelBudget} from '../src/longcat-client.mjs';
export async function validateV09Live(){const {app,users}=await createPilotFixture({real:true}),ledger=new ModelBudget(app.harness.budgetPath),before=ledger.summary(),report={scope:'isolated_synthetic_accounts_not_teacher_approval',cases:[],paid_steps_auto_retried:false};const out=path.resolve(ROOT,'../output/pilot-v0.9/reports');mkdirSync(out,{recursive:true});
 const examples=[
 ['student','我做作业时不知道提示、独立完成证据和教师复核分别是什么关系。请根据平台说明把三个概念连起来解释，并告诉我下一步去哪。'],
 ['student','我想把昨天的问答继续下去，但又担心之前的聊天被当成已经掌握。请结合历史会话和复测机制说明我应该怎样使用。'],
 ['teacher','我准备把一个旧课程修改后再次用于新班，请结合发布冻结、重新审核和作业快照，给出不覆盖旧记录的操作次序。'],
 ['teacher','学生表示解释写得没问题却收到未识别反馈，我想批阅、修正并向全班讲评。请给我一个保留原始作答的流程。'],
 ['admin','我希望教师拥有自己的账号且仅负责授权课程，同时需要追踪模型用量。请结合账号授权和运行治理说明操作顺序。'],
 ['admin','准备本机试点之前，我需要说明学生加入方式、资料审核和备份恢复分别由谁负责。请给出简明分工并指出人工确认环节。']
 ];try{for(let i=0;i<examples.length;i++){const[role,query]=examples[i],login=await fetch(app.origin+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:users[role].username,password:FIXTURE_PASSWORD})}),cookie=login.headers.get('set-cookie').split(';')[0],start=Date.now(),r=await fetch(app.origin+'/api/guide/ask',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({query,course_id:'python_pilot',character:'xiaozhi',request_id:crypto.randomUUID(),page:role==='student'?'学习工作台':'课程工作台'})}),result=await r.json(),context=app.pilot.guide.context(users[role],{course_id:'python_pilot'}),checks={http_ok:r.ok,real_model:result.runtime?.model_mode==='real',native_dsh:result.runtime?.engine==='ds-h',has_sources:result.documents?.length>0,actions_authorized:result.actions?.every(a=>context.actions.some(x=>x.id===a.id))===true,no_learning_records:app.store.db.prepare('SELECT COUNT(*) n FROM submissions').get().n===0};report.cases.push({role,query,duration_ms:Date.now()-start,checks,passed:Object.values(checks).every(Boolean),result});console.log(JSON.stringify({role,checks}));if(!Object.values(checks).every(Boolean))throw Error('Guide live acceptance failed');}}
 finally{const after=ledger.summary();report.requests=after.requests-before.requests;report.estimated_cny=after.charged_cny-before.charged_cny;report.passed=report.cases.length===6&&report.cases.every(c=>c.passed);ledger.close();await app.close();writeFileSync(path.join(out,'longcat-live.json'),JSON.stringify(report,null,2));writeFileSync(path.join(out,'longcat-attempt-'+Date.now()+'.json'),JSON.stringify(report,null,2));}return report;}
