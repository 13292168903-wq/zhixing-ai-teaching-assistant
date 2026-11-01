import {LlmAdapter,ToolCallId} from '@deepseek-ai/dsh-llm';
export const name='teaching-scripted-model';export const inject=['llm'];
class Scripted extends LlmAdapter{
 async *stream(options){
  const lastUser=options.messages.findLastIndex(m=>m.role==='user'&&m.source?.kind==='user');
  const toolResult=options.messages.slice(lastUser+1).findLast(m=>m.role==='tool');
  if(toolResult){
   const text=toolResult.content.filter(b=>b.type==='text').map(b=>b.text).join('');
   yield {type:'block-start',index:0,blockType:'text'};yield {type:'text-delta',index:0,text};
   yield {type:'block-end',index:0,block:{type:'text',text}};yield {type:'finish',reason:{kind:'stop'}};return;
  }
  const tool=process.env.TUTOR_TOOL;if(!options.tools?.some(t=>t.name===tool))throw new Error('Authorized teaching tool is absent');
  const id=ToolCallId('tutor-'+process.env.TUTOR_TICKET),args=JSON.stringify({ticket:process.env.TUTOR_TICKET});
  yield {type:'block-start',index:0,blockType:'tool-call'};
  yield {type:'tool-call-delta',index:0,id,name:tool,argumentsDelta:args};
  yield {type:'block-end',index:0,block:{type:'tool-call',id,name:tool,arguments:args}};
  yield {type:'finish',reason:{kind:'tool-calls'}};
 }
}
export function apply(ctx){ctx.llm.registerAdapter(['teaching-scripted'],new Scripted());}
