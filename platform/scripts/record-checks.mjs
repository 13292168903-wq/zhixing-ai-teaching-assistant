import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {ROOT} from '../src/data.mjs';
const results=[];mkdirSync(path.join(ROOT,'reports'),{recursive:true});
for(const [name,file]of [['backend-tests','tests/platform.test.mjs'],['onboarding-tests','tests/onboarding.test.mjs'],['longcat-protocol-tests','tests/longcat.test.mjs'],['pilot-tests','tests/pilot.test.mjs'],['v05-tests','tests/v05.test.mjs'],['v06-tests','tests/v06.test.mjs'],['evolution-pilot','scripts/evolution-pilot.mjs'],['harness-smoke','scripts/harness-smoke.mjs']]){
 const r=spawnSync(process.execPath,[path.join(ROOT,file)],{cwd:ROOT,encoding:'utf8',windowsHide:true,env:{...process.env,TUTOR_ENABLE_REAL_MODEL:'0'},timeout:90000});
 const text=(r.stdout||'')+(r.stderr||'')+(r.error?String(r.error):'');
 writeFileSync(path.join(ROOT,'reports',name+'.txt'),text);results.push({name,exit_code:r.status,passed:r.status===0,log:name+'.txt'});
}
writeFileSync(path.join(ROOT,'reports/checks.json'),JSON.stringify({results,real_model_calls:0,note:'All checks force offline mode.'},null,2));
console.log(JSON.stringify(results));if(results.some(x=>!x.passed))process.exitCode=1;
