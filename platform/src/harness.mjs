import {spawn,spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {ROOT,availableHarness} from './data.mjs';
import {uid,failure} from './store.mjs';
import {ModelBudget} from './longcat-client.mjs';
import {validateGrounding,selectedQuotes,attachServerExcerpts} from './grounding.mjs';
import {validateClaims} from './claims.mjs';
import {TRUSTED_PLUGINS} from './plugin-sdk.mjs';
import {GUIDE_MANIFEST} from './guide-knowledge.mjs';
import {operationContract,validateSchema} from './plugin-contracts.mjs';
import {validateTutorReply} from './tutoring-chat.mjs';
import {HarnessWorker} from './harness-worker.mjs';
export class HarnessBridge{
 constructor(varDir){this.worker=new HarnessWorker();this.root=availableHarness();this.varDir=varDir;this.pending=new Map();this.busy=false;this.real=process.env.TUTOR_ENABLE_REAL_MODEL==='1';
  this.budgetPath=process.env.TUTOR_LONGCAT_BUDGET||path.join(ROOT,'var/longcat-budget.sqlite');
  if(this.real&&((process.env.TUTOR_PROVIDER||'longcat')!=='longcat'||(process.env.TUTOR_MODEL_ID||'LongCat-2.0')!=='LongCat-2.0'||!process.env.LONGCAT_API_KEY))throw new Error('LongCat real mode requires LONGCAT_API_KEY, provider longcat and model LongCat-2.0');}
 status(){return {available:Boolean(this.root&&existsSync(path.join(this.root,'apps/cli/lib/bin.js'))),mode:this.real?'real_model_explicit':'scripted_no_paid_calls',provider:this.real?'longcat':'teaching-scripted',model:this.real?'LongCat-2.0':'scripted',longcat_key_configured:Boolean(process.env.LONGCAT_API_KEY),busy:this.busy};}
 async invoke(tool,args,execute,rpcUrl,options={}){
  const received=Date.now();
  const real=options.mode?options.mode==='longcat':this.real,contract=operationContract(tool,options.operation),extension=[...TRUSTED_PLUGINS,GUIDE_MANIFEST].find(p=>p.id===tool);
  if(extension&&!contract)failure('插件操作不受信',403);
  if(real&&!process.env.LONGCAT_API_KEY)failure('本机尚未配置 LONGCAT_API_KEY',503);
  if(!this.status().available)failure('DS-H 未配置；可在界面选择本地规则模式，或设置 HARNESS_ROOT',503);
  while(this.busy){options.signal?.throwIfAborted();await new Promise(r=>setTimeout(r,40));}
  this.busy=true;
  const queueMs=Date.now()-received,fast=tool==='retrieve_evidence'&&(real||options.warmWorker===true);
  const ticket=uid(),secret=uid(),dir=path.join(this.varDir,'harness',ticket);options.onTicket?.(ticket);mkdirSync(dir,{recursive:true});
  const home=path.join(this.varDir,'harness-home');mkdirSync(home,{recursive:true});
  const entry={secret,tool,args,execute,result:undefined,called:false};this.pending.set(ticket,entry);
  const disabled=['session-title-llm','agent-instructions','llm-retry','compaction-basic','command-compact','llm-deepseek-account','llm-deepseek','session-telemetry-otel'];
  const overlay=[{id:'system-prompt',config:{personaPrefix:'你是课程教学工具助手。必须调用本轮指定工具且仅使用本轮 ticket；依据工具结果回答，不编造评分或状态。',personaSuffix:''}},
   {id:'tools',config:{mode:'native'}},...disabled.map(id=>({id,disabled:true})),
   {id:'skill-filesystem',config:{includeDefaultRoots:false,customSkillDirs:[]}},
   {id:'agent-default-model',config:{provider:real?'teaching-longcat':'teaching-scripted',model:real?'LongCat-2.0':'scripted'}},
   {insert:[{id:'teaching-platform-tools',name:path.join(ROOT,'harness/teaching-plugin.mjs')},...(extension?[{id:extension.id,name:path.join(ROOT,extension.entry)}]:[]),{id:real?'teaching-longcat-model':'teaching-scripted-model',name:path.join(ROOT,real?'harness/longcat-model.mjs':'harness/scripted-model.mjs')}]}];
  if(fast)overlay.push({id:'headless-runner',disabled:true},{insert:[{id:'teaching-chat-worker',name:path.join(ROOT,'harness/chat-worker.mjs')}]});
  const patch=path.join(dir,'overlay.json');writeFileSync(patch,JSON.stringify(overlay));
  const budget=path.join(this.varDir,real?'real-model-budget.json':'scripted-budget.json');
  let old=existsSync(budget)?JSON.parse(readFileSync(budget,'utf8')):{total_requests:0};
  writeFileSync(budget,JSON.stringify({total_requests:old.total_requests,task_requests:0,limit:real?null:1000000}));
  const env={...process.env,TUTOR_ENABLE_REAL_MODEL:real?'1':'0',TUTOR_PRESELECT_TOOL:real?'1':'0',TUTOR_OPERATION:options.operation||'',HARNESS_ROOT:this.root,DSH_HOME:home,DSH_TELEMETRY_DISABLED:'1',TUTOR_TOOL:tool,TUTOR_TICKET:ticket,TUTOR_RPC_SECRET:secret,TUTOR_RPC_URL:rpcUrl,TUTOR_BUDGET_FILE:budget,TUTOR_LONGCAT_BUDGET:this.budgetPath};
  for(const key of Object.keys(env))if(/API_KEY|ACCESS_TOKEN|AUTH_TOKEN/.test(key)&&(!real||key!=='LONGCAT_API_KEY'))delete env[key];
  const argsCLI=['--import',pathToFileURL(path.join(ROOT,'harness/register.mjs')).href,path.join(this.root,'apps/cli/lib/bin.js'),
    '--profile','teaching-platform',...(!existsSync(path.join(home,'profiles/teaching-platform/package.json'))?['--from-default-profile','headless']:[]),
    '--patch',patch,'--json',JSON.stringify({tool,ticket,instruction:'调用指定工具完成此教学请求，不调用其他工具。'})];
  const started=Date.now();
  try{
   const jobEnv=Object.fromEntries(['TUTOR_TICKET','TUTOR_RPC_SECRET','TUTOR_RPC_URL','TUTOR_BUDGET_FILE','TUTOR_LONGCAT_BUDGET','TUTOR_OPERATION'].map(k=>[k,env[k]]));
   const result=fast?await this.worker.run(process.execPath,argsCLI,{cwd:ROOT,env,windowsHide:true},{type:'run',env:jobEnv,stream:Boolean(options.onProgress)},{signal:options.signal,onProgress:options.onProgress}):await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,argsCLI,{cwd:ROOT,env,windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='',timedOut=false;
    child.stdout.setEncoding('utf8').on('data',s=>{stdout+=s;if(stdout.length>2000000)child.kill();});child.stderr.setEncoding('utf8').on('data',s=>{stderr+=s;});
    const terminate=()=>{if(process.platform==='win32')spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true});else child.kill('SIGTERM');};
    const timer=setTimeout(()=>{timedOut=true;terminate();},real?190000:60000);
    options.signal?.addEventListener('abort',terminate,{once:true});if(options.signal?.aborted)terminate();
    child.on('error',e=>{clearTimeout(timer);options.signal?.removeEventListener('abort',terminate);reject(e);});child.on('close',code=>{clearTimeout(timer);options.signal?.removeEventListener('abort',terminate);resolve({code,stdout,stderr,timedOut});});
   });
   const redact=s=>[secret,process.env.DEEPSEEK_API_KEY,process.env.LONGCAT_API_KEY].filter(Boolean).reduce((v,x)=>v.split(x).join('[REDACTED]'),s);
   writeFileSync(path.join(dir,'events.jsonl'),redact(result.stdout));writeFileSync(path.join(dir,'stderr.log'),redact(result.stderr));
   let events=[];for(const line of result.stdout.split(/\r?\n/)){try{events.push(JSON.parse(line));}catch{}}
   const session=events.find(e=>e.type==='session');
   if(result.code!==0||result.timedOut||!entry.called||entry.result===undefined)failure('DS-H 执行未完成；请在管理员运行记录中检查，未自动回退为成功结果。',502);
   const finalText=events.findLast(e=>e.type==='final')?.text;let generated={},callCount=0;
   if(real){
    const ledger=new ModelBudget(this.budgetPath);callCount=ledger.db.prepare('SELECT COUNT(*) n FROM requests WHERE run_id=?').get(ticket).n;ledger.close();
    try{
     let parsed=JSON.parse(finalText);
     if(contract){generated={model_payload:validateSchema(parsed,operationContract(tool,options.operation,entry.result).schema)};}
     else if(tool==='retrieve_evidence'){
      generated=['tutoring','conversation'].includes(entry.result.response_kind)?validateTutorReply(parsed,entry.result):validateClaims(parsed,entry.result.citations);
     }else if(typeof parsed.feedback==='string'){
      const context=entry.result.teaching_context,missing=entry.result.diagnostic_evidence?.missing_points;
      const mismatch=context&&((!/(嵌套|\[\[)/.test(context.item_prompt)&&/嵌套/.test(parsed.feedback))||(missing?.length===0&&/(未|没有|缺少).{0,8}(说明|提到|给出).{0,12}固定参数/.test(parsed.feedback)));
      generated=mismatch?{model_feedback:entry.result.feedback,model_feedback_candidate:parsed.feedback,model_feedback_review:'rejected_by_consistency_guard'}:{model_feedback:parsed.feedback,model_feedback_review:'pending_human_review'};
     }
     else throw new Error('Invalid feedback');
    }catch(e){if(contract)failure('插件模型输出未通过契约检查：'+e.message,502);generated={model_output_error:'invalid_or_incomplete_structured_output',model_output_error_reason:e.message.slice(0,180),model_answer_review:'not_accepted',uncertainty:'invalid_model_output',...(tool==='retrieve_evidence'?{model_answer:'本次模型回答未通过格式或引用核验，暂不展示。请重新提问；下方检索资料仅供参考，不是模型回答。',model_answer_status:'rejected'}:{})};}
   }
   if(contract&&!real)generated={model_payload:validateSchema(entry.result.offline_payload,operationContract(tool,options.operation,entry.result).schema)};
   return {...entry.result,...generated,runtime:{engine:'ds-h',provider:real?'longcat':'teaching-scripted',model:real?'LongCat-2.0':'scripted',model_mode:real?'real':'scripted',session_id:session?.sessionId,run_id:ticket,duration_ms:Date.now()-started,queue_ms:queueMs,total_ms:Date.now()-received,worker_reused:result.worker_reused||false,worker_ready_ms:result.worker_ready_ms,first_delta_ms:result.first_delta_ms,tool_ms:entry.tool_ms,real_model_calls:callCount}};
  }finally{this.pending.delete(ticket);this.busy=false;}
 }
 async rpc(body,authorization){
  const entry=this.pending.get(body.ticket);if(!entry||authorization!=='Bearer '+entry.secret||entry.tool!==body.tool)failure('内部工具授权无效',403);
  if(entry.called)return entry.result;
  if(entry.inflight)return entry.inflight;
  const started=Date.now();entry.inflight=Promise.resolve().then(()=>entry.execute(entry.args)).then(result=>{entry.tool_ms=Date.now()-started;entry.result=result;entry.called=true;return result;});
  return entry.inflight;
 }
 close(){this.worker.close();}
}
