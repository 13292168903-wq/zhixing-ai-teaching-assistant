// A warm DS-H plugin tree, with a NEW Agent/session for every authorized job.
import {randomUUID} from 'node:crypto';
import {installModelSelection} from '@deepseek-ai/dsh-agent';
import {createUserMessage} from '@deepseek-ai/dsh-llm';
export const name='teaching-chat-worker';
export const inject=['agentDefaultModel','agents','sessions'];
export function apply(ctx){
 let busy=false;
 const send=value=>process.connected&&process.send(value);
 process.on('disconnect',()=>process.exit(0));
 process.on('message',async job=>{
  if(job.type!=='run')return;
  if(busy){send({type:'failure',message:'Worker already busy'});return;}
  busy=true;let owned,projection,outcome,runId=job.env.TUTOR_TICKET;
  try{
   for(const k of ['TUTOR_TICKET','TUTOR_RPC_SECRET','TUTOR_RPC_URL','TUTOR_BUDGET_FILE','TUTOR_LONGCAT_BUDGET','TUTOR_OPERATION'])process.env[k]=job.env[k]||'';
   process.env.TUTOR_PRESELECT_TOOL='1';process.env.TUTOR_STREAM_RESPONSE=job.stream?'1':'0';
   const selection=ctx.agentDefaultModel.currentSelection();
   owned=await ctx.agents.create({sessionId:'session-'+randomUUID(),meta:{cwd:process.cwd()},agentOptions:{provider:selection.provider,model:selection.model},setup:scope=>{installModelSelection(scope,{current:selection,assembled:undefined});}});
   const agent=owned.agent;await agent.whenIdle();
   const {pathToFileURL}=await import('node:url');
   const {projectJsonRun}=await import(pathToFileURL(process.env.HARNESS_ROOT+'/packages/bundle/headless/lib/types/json-stream.js').href);
   let stdout='';projection=projectJsonRun(ctx,agent,{write:s=>{stdout+=s;}},{cwd:process.cwd()});
   agent.followup(createUserMessage({content:[{type:'text',text:JSON.stringify({tool:'retrieve_evidence',ticket:runId,instruction:'执行本轮授权工具。'})}],source:{kind:'user'}}));
   await agent.whenIdle();await ctx.sessions.flush(agent.session);
   let text='',reason;
   for(let i=0;i<agent.session.seq;i++){const e=agent.session.eventAt(i);if(e?.type==='assistant/message'){const t=e.data.message.content.filter(b=>b.type==='text').map(b=>b.text).join('');if(t)text=t;}if(e?.type==='turn/end')reason=e.data.reason;}
   projection.finish(text);outcome={type:'done',run_id:runId,code:reason?.kind==='completed'?0:1,stdout,stderr:'',timedOut:false};
  }catch(e){outcome={type:'failure',run_id:runId,message:String(e.stack||e.message).slice(0,1800)};}
  finally{projection?.dispose();try{await owned?.dispose();}catch{outcome={type:'failure',run_id:runId,message:'DS-H session cleanup failed'};}busy=false;send(outcome);}
 });
 void ctx.get('loader')?.await().then(()=>send({type:'ready'}));
}
