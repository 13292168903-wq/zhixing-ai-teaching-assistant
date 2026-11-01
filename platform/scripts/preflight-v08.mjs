import {existsSync,readFileSync,realpathSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {ROOT,availableHarness} from '../src/data.mjs';
import {pythonBinary} from '../src/materials.mjs';
import {dockerPath} from '../src/code-sandbox.mjs';
export function preflight({verify=false}={}){
 const root=availableHarness(),checks=[{name:'Node.js >=24',required:true,ok:Number(process.versions.node.split('.')[0])>=24},{name:'built DS-H',required:true,ok:!!root&&existsSync(path.join(root,'apps/cli/lib/bin.js'))},{name:'LONGCAT_API_KEY',required:false,ok:!!process.env.LONGCAT_API_KEY}];
 const python=pythonBinary(),p=spawnSync(python,['-c','import pypdf,docx; print("ok")'],{encoding:'utf8',windowsHide:true});checks.push({name:'Python text parsers (initial course material import)',required:true,ok:p.status===0,remedy:'python -m pip install -r platform/requirements-v08.txt'});
 const docker=spawnSync(dockerPath(),['info','--format','{{.ServerVersion}}'],{encoding:'utf8',windowsHide:true,timeout:10000});checks.push({name:'Docker Linux sandbox',required:false,ok:docker.status===0});
 const lockPath=path.resolve(ROOT,'../output/pilot-v0.8/dsh-runtime.lock.json');let integrity='not_requested';
 if(verify&&root&&existsSync(lockPath)){const lock=JSON.parse(readFileSync(lockPath,'utf8')),bad=[];for(const[name,sha]of Object.entries(lock.files)){const file=path.join(root,name);if(!existsSync(file)||createHash('sha256').update(readFileSync(file)).digest('hex')!==sha)bad.push(name);}integrity=bad.length?{failed:bad.slice(0,10)}:'passed';checks.push({name:'DS-H snapshot integrity',required:true,ok:bad.length===0});}
 return {checks,ok:checks.filter(x=>x.required).every(x=>x.ok),runtime:root?path.relative(ROOT,root):null,integrity,model_calls:0,missing_optional_does_not_claim_success:true};
}
if(process.argv[1]?.endsWith('preflight-v08.mjs')){const r=preflight({verify:process.argv.includes('--verify')});console.log(JSON.stringify(r,null,2));if(!r.ok)process.exitCode=1;}

