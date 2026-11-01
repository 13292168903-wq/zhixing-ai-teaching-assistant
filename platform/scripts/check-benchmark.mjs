import {spawnSync} from 'node:child_process';
import {mkdirSync,readdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {ROOT} from '../src/data.mjs';
const out=path.resolve(ROOT,'../output/benchmark-v0.1/reports');mkdirSync(out,{recursive:true});
const integration=new Set(['chat-speed.test.mjs','v07.test.mjs','guide.test.mjs']),all=readdirSync(path.join(ROOT,'tests')).filter(x=>x.endsWith('.test.mjs')),groups=[];
for(const [name,files]of [['business_and_protocol',all.filter(f=>!integration.has(f)&&f!=='benchmark.test.mjs')],['evaluation_factory',['benchmark.test.mjs']],['dsh_offline_integration',all.filter(f=>integration.has(f))]]){
 const r=spawnSync(process.execPath,['--test','--test-concurrency=1',...files.map(f=>path.join(ROOT,'tests',f))],{env:{...process.env,TUTOR_ENABLE_REAL_MODEL:'0'},encoding:'utf8',windowsHide:true,timeout:600000,maxBuffer:16*1024*1024});const log=(r.stdout||'')+'\n'+(r.stderr||'');writeFileSync(path.join(out,name+'.txt'),log);
 const count=k=>Number(log.match(new RegExp('(?:ℹ |# )'+k+' (\\d+)'))?.[1]||0);const group={name,status:r.status===0?'passed':'failed',tests:count('tests'),passed:count('pass'),failed:count('fail'),error:r.error?.message||null,real_model_calls:0};groups.push(group);console.log(JSON.stringify(group));
}
writeFileSync(path.join(out,'automated-checks.json'),JSON.stringify({groups,total:groups.reduce((n,g)=>n+g.tests,0)},null,2));if(groups.some(g=>g.status!=='passed'))process.exitCode=1;
