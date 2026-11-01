import {spawn,spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {ROOT,availableHarness} from './data.mjs';
import {uid,failure} from './store.mjs';
import {ModelBudget} from './longcat-client.mjs';
export class HarnessBridge{
 constructor(varDir){this.root=availableHarness();this.varDir=varDir;this.pending=new Map();this.busy=false;this.real=process.env.TUTOR_ENABLE_REAL_MODEL==='1';
  this.budgetPath=process.env.TUTOR_LONGCAT_BUDGET||path.join(ROOT,'var/longcat-budget.sqlite');
  if(this.real&&((process.env.TUTOR_PROVIDER||'longcat')!=='longcat'||(process.env.TUTOR_MODEL_ID||'LongCat-2.0')!=='LongCat-2.0'||!process.env.LONGCAT_API_KEY))throw new Error('LongCat real mode requires LONGCAT_API_KEY, provider longcat and model LongCat-2.0');}
 status(){return {available:Boolean(this.root&&existsSync(path.join(this.root,'apps/cli/lib/bin.js'))),mode:this.real?'real_model_explicit':'scripted_no_paid_calls',provider:this.real?'longcat':'teaching-scripted',model:this.real?'LongCat-2.0':'scripted',longcat_key_configured:Boolean(process.env.LONGCAT_API_KEY),busy:this.busy};}
 async invoke(tool,args,execute,rpcUrl){
  if(!this.status().available)failure('DS-H 未配置；可在界面选择本地规则模式，或设置 HARNESS_ROOT',503);
  if(this.busy)failure('DS-H 正在执行另一任务，请稍后重试',409);
  this.busy=true;
  const ticket=uid(),secret=uid(),dir=path.join(this.varDir,'harness',ticket);mkdirSync(dir,{recursive:true});
  const home=path.join(this.varDir,'harness-home');mkdirSync(home,{recursive:true});
  const entry={secret,tool,args,execute,result:undefined,called:false};this.pending.set(ticket,entry);
  const disabled=['session-title-llm','agent-instructions','llm-retry','compaction-basic','command-compact','llm-deepseek-account','llm-deepseek','session-telemetry-otel'];
  const overlay=[{id:'system-prompt',config:{personaPrefix:'你是课程教学工具助手。必须调用本轮指定工具且仅使用本轮 ticket；依据工具结果回答，不编造评分或状态。',personaSuffix:''}},
   {id:'tools',config:{mode:'native'}},...disabled.map(id=>({id,disabled:true})),
   {id:'skill-filesystem',config:{includeDefaultRoots:false,customSkillDirs:[]}},
   {id:'agent-default-model',config:{provider:this.real?'teaching-longcat':'teaching-scripted',model:this.real?'LongCat-2.0':'scripted'}},
   {insert:[{id:'teaching-platform-tools',name:path.join(ROOT,'harness/teaching-plugin.mjs')},{id:this.real?'teaching-longcat-model':'teaching-scripted-model',name:path.join(ROOT,this.real?'harness/longcat-model.mjs':'harness/scripted-model.mjs')}]}];
  const patch=path.join(dir,'overlay.json');writeFileSync(patch,JSON.stringify(overlay));
  const budget=path.join(this.varDir,this.real?'real-model-budget.json':'scripted-budget.json');
  let old=existsSync(budget)?JSON.parse(readFileSync(budget,'utf8')):{total_requests:0};
  writeFileSync(budget,JSON.stringify({total_requests:old.total_requests,task_requests:0,limit:this.real?6:1000000}));
  const env={...process.env,HARNESS_ROOT:this.root,DSH_HOME:home,DSH_TELEMETRY_DISABLED:'1',TUTOR_TOOL:tool,TUTOR_TICKET:ticket,TUTOR_RPC_SECRET:secret,TUTOR_RPC_URL:rpcUrl,TUTOR_BUDGET_FILE:budget,TUTOR_LONGCAT_BUDGET:this.budgetPath};
  for(const key of Object.keys(env))if(/API_KEY|ACCESS_TOKEN|AUTH_TOKEN/.test(key)&&(!this.real||key!=='LONGCAT_API_KEY'))delete env[key];
  const argsCLI=['--import',pathToFileURL(path.join(ROOT,'harness/register.mjs')).href,path.join(this.root,'apps/cli/lib/bin.js'),
    '--profile','teaching-platform',...(!existsSync(path.join(home,'profiles/teaching-platform/package.json'))?['--from-default-profile','headless']:[]),
    '--patch',patch,'--json',JSON.stringify({tool,ticket,instruction:'调用指定工具完成此教学请求，不调用其他工具。'})];
  const started=Date.now();
  try{
   const result=await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,argsCLI,{cwd:ROOT,env,windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='',timedOut=false;
    child.stdout.setEncoding('utf8').on('data',s=>{stdout+=s;if(stdout.length>2000000)child.kill();});child.stderr.setEncoding('utf8').on('data',s=>{stderr+=s;});
    const timer=setTimeout(()=>{timedOut=true;if(process.platform==='win32')spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true});else child.kill('SIGTERM');},this.real?190000:60000);
    child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);resolve({code,stdout,stderr,timedOut});});
   });
   const redact=s=>[secret,process.env.DEEPSEEK_API_KEY,process.env.LONGCAT_API_KEY].filter(Boolean).reduce((v,x)=>v.split(x).join('[REDACTED]'),s);
   writeFileSync(path.join(dir,'events.jsonl'),redact(result.stdout));writeFileSync(path.join(dir,'stderr.log'),redact(result.stderr));
   let events=[];for(const line of result.stdout.split(/\r?\n/)){try{events.push(JSON.parse(line));}catch{}}
   const session=events.find(e=>e.type==='session');
   if(result.code!==0||result.timedOut||!entry.called||entry.result===undefined)failure('DS-H 执行未完成；请在管理员运行记录中检查，未自动回退为成功结果。',502);
   const finalText=events.findLast(e=>e.type==='final')?.text;let generated={},callCount=0;
   if(this.real){
    const ledger=new ModelBudget(this.budgetPath);callCount=ledger.db.prepare('SELECT COUNT(*) n FROM requests WHERE run_id=?').get(ticket).n;ledger.close();
    try{
     const parsed=JSON.parse(finalText);
     if(tool==='retrieve_evidence'){
      if(typeof parsed.answer!=='string'||!Array.isArray(parsed.citation_ids)||parsed.citation_ids.some(id=>!entry.result.citations.some(c=>c.id===id))||(!parsed.citation_ids.length&&entry.result.citations.length))throw new Error('Invalid citations');
      generated={model_answer:entry.result.citations.length?parsed.answer:entry.result.answer,model_citation_ids:parsed.citation_ids,model_answer_review:entry.result.citations.length?'pending_human_review':'abstention_enforced'};
     }else if(typeof parsed.feedback==='string')generated={model_feedback:parsed.feedback,model_feedback_review:'pending_human_review'};
     else throw new Error('Invalid feedback');
    }catch{generated={model_output_error:'invalid_or_incomplete_structured_output',model_answer_review:'not_accepted',uncertainty:'invalid_model_output'};}
   }
   return {...entry.result,...generated,runtime:{engine:'ds-h',provider:this.real?'longcat':'teaching-scripted',model:this.real?'LongCat-2.0':'scripted',model_mode:this.real?'real':'scripted',session_id:session?.sessionId,run_id:ticket,duration_ms:Date.now()-started,real_model_calls:callCount}};
  }finally{this.pending.delete(ticket);this.busy=false;}
 }
 async rpc(body,authorization){
  const entry=this.pending.get(body.ticket);if(!entry||authorization!=='Bearer '+entry.secret||entry.tool!==body.tool)failure('内部工具授权无效',403);
  if(entry.called)return entry.result;
  if(entry.inflight)return entry.inflight;
  entry.inflight=Promise.resolve().then(()=>entry.execute(entry.args)).then(result=>{entry.result=result;entry.called=true;return result;});
  return entry.inflight;
 }
}
