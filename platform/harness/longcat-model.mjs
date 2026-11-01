import {LlmAdapter,ToolCallId} from '@deepseek-ai/dsh-llm';
import {ModelBudget,responsesRequest,callLongCat,currentToolMessages} from '../src/longcat-client.mjs';
import {setDefaultResultOrder} from 'node:dns';
import {setDefaultAutoSelectFamily} from 'node:net';
// The pilot host's IPv4 TLS path was verified; avoid its failing dual-stack connection path.
// This selects a network family only: same official hostname, verified TLS, no request retry.
setDefaultResultOrder('ipv4first');setDefaultAutoSelectFamily(false);
export const name='teaching-longcat-model';export const inject=['llm'];
class LongCat extends LlmAdapter{
 async *stream(options){
  // The server has ALREADY selected the sole authorized tool. No remote
  // decision is needed to repeat that deterministic routing step.
  if(process.env.TUTOR_PRESELECT_TOOL==='1'&&!currentToolMessages(options.messages).some(m=>m.role==='tool')){
   const name=process.env.TUTOR_TOOL;if(!options.tools?.some(t=>t.name===name))throw Error('Authorized tool unavailable');
   const id=ToolCallId('server-'+process.env.TUTOR_TICKET),argumentsText=JSON.stringify({ticket:process.env.TUTOR_TICKET});
   yield {type:'block-start',index:0,blockType:'tool-call'};yield {type:'tool-call-delta',index:0,id,name,argumentsDelta:argumentsText};
   yield {type:'block-end',index:0,block:{type:'tool-call',id,name,arguments:argumentsText}};yield {type:'finish',reason:{kind:'tool-calls'}};return;
  }
  const budget=new ModelBudget(process.env.TUTOR_LONGCAT_BUDGET);
  try{
   const request=responsesRequest(options,{tool:process.env.TUTOR_TOOL,ticket:process.env.TUTOR_TICKET,operation:process.env.TUTOR_OPERATION});
   request.stream=process.env.TUTOR_STREAM_RESPONSE==='1';
   const result=await callLongCat(request,{key:process.env.LONGCAT_API_KEY,budget,runId:process.env.TUTOR_TICKET,onDelta:text=>process.connected&&process.send({type:'progress',run_id:process.env.TUTOR_TICKET,text})});
   for(let i=0;i<result.blocks.length;i++){const b=result.blocks[i];
    if(b.type==='tool-call'){
     if(b.name!==process.env.TUTOR_TOOL||JSON.parse(b.arguments).ticket!==process.env.TUTOR_TICKET)throw new Error('LongCat selected an unauthorized teaching tool');
     const id=ToolCallId(b.id);yield {type:'block-start',index:i,blockType:'tool-call'};yield {type:'tool-call-delta',index:i,id,name:b.name,argumentsDelta:b.arguments};yield {type:'block-end',index:i,block:{...b,id}};
    }else{yield {type:'block-start',index:i,blockType:'text'};yield {type:'text-delta',index:i,text:b.text};yield {type:'block-end',index:i,block:b};}
   }
   if(result.usage)yield {type:'usage',usage:{inputTokens:result.usage.input_tokens||0,outputTokens:result.usage.output_tokens||0}};
   yield {type:'finish',reason:{kind:result.blocks.some(b=>b.type==='tool-call')?'tool-calls':'stop'}};
  }finally{budget.close();}
 }
}
export function apply(ctx){ctx.llm.registerAdapter(['teaching-longcat'],new LongCat());}
