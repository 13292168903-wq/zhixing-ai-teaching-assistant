import {spawnSync} from 'node:child_process';
import {readdirSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {ROOT} from '../src/data.mjs';
const out=path.resolve(ROOT,'../output/pilot-v0.9/reports');mkdirSync(out,{recursive:true});
const integration=new Set(['chat-speed.test.mjs','v07.test.mjs','guide.test.mjs']),all=readdirSync(path.join(ROOT,'tests')).filter(x=>x.endsWith('.test.mjs')),groups=[];
for(const[name,files]of [['business_and_protocol',all.filter(f=>!integration.has(f))],['dsh_offline_integration',all.filter(f=>integration.has(f))]]){const run=spawnSync(process.execPath,['--test',...files.map(f=>path.join(ROOT,'tests',f))],{encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024}),log=run.stdout+'\n'+run.stderr;writeFileSync(path.join(out,name+'.txt'),log);const count=k=>Number(log.match(new RegExp('(?:ℹ |# )'+k+' (\\d+)'))?.[1]||0),r={name,status:run.status===0?'passed':'failed',tests:count('tests'),passed:count('pass'),failed:count('fail'),real_model_calls:0};groups.push(r);console.log(JSON.stringify(r));}
writeFileSync(path.join(out,'automated-checks.json'),JSON.stringify({groups,total:groups.reduce((n,r)=>n+r.tests,0),baseline_tests:128},null,2));if(groups.some(r=>r.status!=='passed'))process.exitCode=1;
