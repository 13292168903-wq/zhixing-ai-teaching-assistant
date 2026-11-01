// Decode only a JSON string's completed prefix, never render markup from a model.
export function explanationPrefix(raw){
 const start=raw.match(/"model_explanation"\s*:\s*"/);if(!start)return '';
 let s=raw.slice(start.index+start[0].length),out='';
 for(let i=0;i<s.length;i++){const c=s[i];if(c==='"')break;if(c!=='\\'){out+=c;continue;}const next=s[++i];if(!next)break;if(next==='u'){const hex=s.slice(i+1,i+5);if(!/^[0-9a-f]{4}$/i.test(hex))break;out+=String.fromCharCode(parseInt(hex,16));i+=4;}else{const codes={n:'\n',r:'\r',t:'\t',b:'\b',f:'\f','"':'"','\\':'\\','/':'/'};if(!(next in codes))break;out+=codes[next];}}
 return out;
}
export async function consumeChat(response,onEvent){
 if(!response.ok){const e=await response.json();throw Error(e.error||'请求失败');}
 let buffer='',result;const decoder=new TextDecoder();
 const consume=()=>{let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line.trim())continue;const e=JSON.parse(line);if(e.type==='error')throw Error(e.error);if(e.type==='result')result=e.result;onEvent(e);}};
 for await(const chunk of response.body){buffer+=decoder.decode(chunk,{stream:true});consume();}buffer+=decoder.decode()+'\n';consume();if(!result)throw Error('连接中断，本次回答未完成');return result;
}
