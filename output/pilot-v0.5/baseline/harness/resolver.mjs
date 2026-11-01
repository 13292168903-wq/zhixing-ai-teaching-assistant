import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.env.HARNESS_ROOT;
const locations={'@deepseek-ai/cordis':'vendor/cordis','@deepseek-ai/schemastery':'vendor/schemastery',
 '@deepseek-ai/dsh-tools':'packages/core/tools','@deepseek-ai/dsh-llm':'packages/llm/llm'};
const choose=x=>typeof x==='string'?x:x&&choose(x.import??x.node??x.default);
export async function resolve(specifier,context,next){
 if(root&&locations[specifier]){
  const folder=path.join(root,locations[specifier]);const m=JSON.parse(readFileSync(path.join(folder,'package.json'),'utf8'));
  const entry=choose(m.exports?.['.'])||m.module||m.main;
  if(!entry||!existsSync(path.join(folder,entry)))throw new Error('Missing built Harness package '+specifier);
  return {url:pathToFileURL(path.join(folder,entry)).href,shortCircuit:true};
 }
 return next(specifier,context);
}
