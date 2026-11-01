import {defineTool} from '@deepseek-ai/dsh-tools';
import {readFileSync,writeFileSync} from 'node:fs';
export const name='teaching-platform-tools';
export const inject=['tools','agents','llm'];
export function apply(ctx){
 const allowed=process.env.TUTOR_TOOL;
 for(const tool of ['retrieve_evidence','generate_task','verify_submission']){
  ctx.tools.register(defineTool({name:tool,description:'执行当前教学平台授权的 '+tool+' 操作；仅使用本轮 ticket。',
   parameters:{ticket:{type:'string',required:true,description:'本轮固定授权标识'}},
   output:{schema:{type:'object',additionalProperties:false,properties:{payload:{type:'string',required:true}}},render:(_args,value)=>[{type:'text',text:value.payload}]},
   async execute(args,exec){
    if(tool!==allowed||args.ticket!==process.env.TUTOR_TICKET)throw new Error('Tool is outside the current teaching operation');
    const response=await fetch(process.env.TUTOR_RPC_URL,{method:'POST',signal:exec.signal,
      headers:{'content-type':'application/json','authorization':'Bearer '+process.env.TUTOR_RPC_SECRET},body:JSON.stringify({ticket:args.ticket,tool})});
    const value=await response.json();if(!response.ok)throw new Error(value.error||'Teaching RPC failed');
    return {payload:JSON.stringify(value)};
   }}));
 }
 ctx.on('agent/created',({agent})=>{agent.ctx.tools.restrict({allow:[allowed]});});
 ctx.on('llm/stream',async function*(_options,next){
  if(process.env.TUTOR_ENABLE_REAL_MODEL==='1'){yield* next();return;}
  // Admission happens before dispatch; failed attempts consume the finite budget.
  const p=process.env.TUTOR_BUDGET_FILE;const b=JSON.parse(readFileSync(p,'utf8'));
  if(b.task_requests>=3||b.total_requests>=b.limit)throw new Error('TUTOR_MODEL_REQUEST_BUDGET_EXHAUSTED');
  b.task_requests++;b.total_requests++;writeFileSync(p,JSON.stringify(b));
  yield* next();
 });
}
