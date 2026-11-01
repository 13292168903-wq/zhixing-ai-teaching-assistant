import {LlmAdapter,ToolCallId} from '@deepseek-ai/dsh-llm';
import {ModelBudget,responsesRequest,callLongCat} from '../src/longcat-client.mjs';
export const name='teaching-longcat-model';export const inject=['llm'];
class LongCat extends LlmAdapter{
 async *stream(options){
  const budget=new ModelBudget(process.env.TUTOR_LONGCAT_BUDGET);
  try{
   const request=responsesRequest(options,{tool:process.env.TUTOR_TOOL,ticket:process.env.TUTOR_TICKET});
   const result=await callLongCat(request,{key:process.env.LONGCAT_API_KEY,budget,runId:process.env.TUTOR_TICKET});
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
