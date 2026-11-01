import {mkdirSync,writeFileSync,existsSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {ROOT} from '../src/data.mjs';
import {command,dockerPath} from '../src/code-sandbox.mjs';
const binary=dockerPath(),lockPath=path.join(ROOT,'sandbox/images.lock.json'),existing=existsSync(lockPath)&&!process.argv.includes('--refresh')?JSON.parse(readFileSync(lockPath)):null,lock={schema_version:'0.7.0',prepared_at:new Date().toISOString(),platform:'linux/amd64'};
const dockerfileHash=createHash('sha256').update(readFileSync(path.join(ROOT,'sandbox/Dockerfile'))).digest('hex');
for(const [key,tag]of [['python','python:3.13-slim-bookworm'],['gcc','gcc:15-trixie']]){
 const ref=existing?.[key]?.image||tag;
 const cached=existing?await command(binary,['image','inspect',ref,'--format','{{.Id}}']):null;
 if(!cached||cached.code!==0){const pull=await command(binary,['pull',ref],{timeout:20*60*1000,limit:2*1024*1024});if(pull.code!==0)throw Error('Official image pull failed: '+ref+' '+pull.stderr.slice(-1000));}
 const inspect=await command(binary,['image','inspect',ref,'--format','{{json .RepoDigests}}']);if(inspect.code!==0)throw Error('Image inspect failed');
 const image=JSON.parse(inspect.stdout).find(s=>s.startsWith(key+'@sha256:'));if(!image)throw Error('Official image digest absent');
 const derivedTag='zhixing-'+key+':0.7';
 const derived=existing?await command(binary,['image','inspect',derivedTag]):null;
 const base=await command(binary,['image','inspect',image]);
 const old=derived?.code===0?JSON.parse(derived.stdout)[0]:null,official=base.code===0?JSON.parse(base.stdout)[0]:null;
 const unchanged=!existing?.[key]?.dockerfile_sha256||existing[key].dockerfile_sha256===dockerfileHash;
 const reusable=old&&official&&unchanged&&old.Config.User==='65534:65534'&&old.Config.WorkingDir==='/work'&&JSON.stringify(old.Config.Entrypoint)==='["/bin/sh"]'&&official.RootFS.Layers.every((layer,i)=>old.RootFS.Layers[i]===layer);
 if(!reusable){const build=await command(binary,['build','--build-arg','BASE='+image,'--file',path.join(ROOT,'sandbox/Dockerfile'), '--tag',derivedTag,path.join(ROOT,'sandbox')],{timeout:120000,limit:1024*1024});if(build.code!==0)throw Error(build.stderr.slice(-2000));}
 // The execution uses the official base digest directly; the derived image documents an identical unprivileged default.
 lock[key]={tag,image,derived_tag:derivedTag,dockerfile_sha256:dockerfileHash};
 console.log(key+' locked: '+image);
}
mkdirSync(path.join(ROOT,'sandbox'),{recursive:true});writeFileSync(path.join(ROOT,'sandbox/images.lock.json'),JSON.stringify(lock,null,2)+'\n');
