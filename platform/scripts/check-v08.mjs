import {spawnSync} from 'node:child_process';
import {readdirSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {ROOT} from '../src/data.mjs';
const out=path.resolve(ROOT,'../output/pilot-v0.8/reports');mkdirSync(out,{recursive:true});
const integration=new Set(['chat-speed.test.mjs','v07.test.mjs']);
const all=readdirSync(path.join(ROOT,'tests')).filter(x=>x.endsWith('.test.mjs'));
const results=[];for(const [name,files]of [['business_and_protocol',all.filter(f=>!integration.has(f))],['dsh_offline_integration',all.filter(f=>integration.has(f))]]){
 const run=spawnSync(process.execPath,['--test',...files.map(f=>path.join(ROOT,'tests',f))],{encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});const log=run.stdout+'\n'+run.stderr;writeFileSync(path.join(out,name+'.txt'),log);
 const count=key=>Number(log.match(new RegExp('(?:ℹ |# )'+key+' (\\d+)'))?.[1]||0);const r={group:name,status:run.status===0?'passed':'failed',tests:count('tests'),passed:count('pass'),failed:count('fail'),real_model_calls:0};results.push(r);console.log(JSON.stringify(r));
}
writeFileSync(path.join(out,'automated-checks.json'),JSON.stringify({groups:results,total:results.reduce((n,r)=>n+r.tests,0),actual_model_and_docker_reported_separately:true},null,2));if(results.some(r=>r.status!=='passed'))process.exitCode=1;
