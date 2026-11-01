import {spawn} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {ROOT} from './data.mjs';
import {uid,failure} from './store.mjs';
export const LANGUAGES=['python','c','cpp'];
export const normalizeOutput=s=>String(s).replace(/\r\n/g,'\n').split('\n').map(x=>x.trimEnd()).join('\n').trimEnd();
export function dockerPath(){return process.env.TUTOR_DOCKER_PATH||(existsSync('D:/tool/docker/resources/bin/docker.exe')?'D:/tool/docker/resources/bin/docker.exe':'docker');}
export function command(binary,args,{input='',timeout=15000,limit=65536,signal}={}){
 return new Promise(resolve=>{let out=[],err=[],bytes=0,reason=null,settled=false;const p=spawn(binary,args,{windowsHide:true,stdio:['pipe','pipe','pipe']});
  const stop=why=>{reason=why;p.kill();};const timer=setTimeout(()=>stop('timeout'),timeout);const abort=()=>stop('cancelled');signal?.addEventListener('abort',abort,{once:true});
  const done=result=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);resolve({...result,reason,stdout:Buffer.concat(out).toString('utf8'),stderr:Buffer.concat(err).toString('utf8')});};
  p.stdout.on('data',b=>{bytes+=b.length;if(bytes>limit)stop('output_limit');else out.push(b);});p.stderr.on('data',b=>{bytes+=b.length;if(bytes>limit)stop('output_limit');else err.push(b);});
  p.on('error',e=>done({code:null,error:e.code||e.message}));p.on('close',code=>done({code}));p.stdin.on('error',()=>{});p.stdin.end(input);if(signal?.aborted)abort();
 });
}
export function isolationArgs(name,image,script){return ['run','--name',name,'--label','zhixing.sandbox=v0.7','--pull=never','--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--user','65534:65534','--memory=512m','--memory-swap=512m','--cpus=1','--pids-limit=64','--ulimit','nofile=128:128','--ulimit','core=0','--tmpfs','/work:rw,exec,nosuid,nodev,size=67108864,mode=1777','--workdir','/work','--env','TMPDIR=/work','--log-driver=none','--interactive','--entrypoint','/bin/sh',image,'-c',script];}
export class CodeSandbox{
 constructor({lockPath=path.join(ROOT,'sandbox/images.lock.json'),binary=dockerPath()}={}){this.lockPath=lockPath;this.binary=binary;}
 lock(){if(!existsSync(this.lockPath))failure('代码沙箱尚未准备镜像；先运行 prepare-sandbox.mjs',503);const x=JSON.parse(readFileSync(this.lockPath));for(const [k,repo]of [['python','python'],['gcc','gcc']])if(!new RegExp('^'+repo+'@sha256:[a-f0-9]{64}$').test(x[k]?.image||''))failure('沙箱镜像摘要无效',503);return x;}
 async status(){const r=await command(this.binary,['info','--format','{{.ServerVersion}}'],{timeout:10000});let images=false;try{this.lock();images=true;}catch{}return {available:r.code===0&&images,engine:r.code===0?r.stdout.trim():null,images_locked:images,binary:this.binary,reason:r.code!==0?'docker_engine_unavailable':images?null:'images_not_prepared'};}
 async container(language,script,input,{compile=false,signal,timeout}={}){
  const lock=this.lock(),image=lock[language==='python'?'python':'gcc'].image,name='zhixing-'+uid();let r;
  try{r=await command(this.binary,isolationArgs(name,image,script),{input,signal,timeout:timeout||(compile?30000:5000),limit:compile?8*1024*1024:65536});
   // Inspect before removing the unique container; Docker's client exit does not prove process cleanup.
   if(r.reason)await command(this.binary,['kill',name],{timeout:4000});
   const state=await command(this.binary,['inspect','--format','{{json .State}}',name],{timeout:4000});try{r.container_state=JSON.parse(state.stdout);}catch{}
   return {...r,image,container_name:name};
  }finally{await command(this.binary,['rm','--force',name],{timeout:5000});}
 }
 async compile(language,source,{signal}={}){
  if(!LANGUAGES.includes(language)||typeof source!=='string'||!source.trim()||Buffer.byteLength(source)>64000)failure('程序语言或源码格式无效');
  if(language==='python'){
   const script='umask 077; cat > /work/main.py; python -I -B -c "import ast; ast.parse(open(\'/work/main.py\').read())"';
   const check=await this.container(language,script,source,{compile:true,signal});return {ok:check.code===0&&!check.reason,language,artifact:Buffer.from(source).toString('base64'),check};
  }
  const ext=language==='c'?'c':'cpp',compiler=language==='c'?'gcc -std=c17':'g++ -std=c++17';
  const script=`umask 077; cat > /work/main.${ext}; ${compiler} -O0 -pipe /work/main.${ext} -o /work/program >&2 && base64 -w0 /work/program`;
  const check=await this.container(language,script,source,{compile:true,signal});return {ok:check.code===0&&!check.reason,language,artifact:check.code===0?check.stdout.trim():null,check:{...check,stdout:check.code===0?'[compiled artifact withheld]':check.stdout}};
 }
 async run(compiled,input,{signal,timeout}={}){
  if(!compiled.ok)failure('程序尚未编译通过');if(typeof input!=='string'||Buffer.byteLength(input)>64000)failure('测试输入过大');
  const python=compiled.language==='python',file=python?'main.py':'program';
  const script=`umask 077; IFS= read -r encoded; printf '%s' "$encoded" | base64 -d > /work/${file}; chmod 500 /work/${file}; exec ${python?'python -I -B /work/main.py':'/work/program'}`;
  return this.container(compiled.language,script,compiled.artifact+'\n'+input,{signal,timeout});
 }
 async verify(program,{signal,independentSource}={}){
  const tests=[...(program.public_tests||[]),...(program.private_tests||[])];
  if(!tests.length||tests.length>20||tests.some(t=>typeof t.stdin!=='string'||typeof t.stdout!=='string'))failure('程序题需提供 1-20 个 stdin/stdout 测试');
  const first=await this.compile(program.language,program.reference_implementation,{signal});
  if(!first.ok)return {status:'quarantined',reason:'reference_compile_failed',compile:first.check};
  const second=independentSource?await this.compile(program.language,independentSource,{signal}):null;
  if(second&&!second.ok)return {status:'quarantined',reason:'independent_compile_failed',compile:second.check};
  const results=[];for(let i=0;i<tests.length;i++){
   signal?.throwIfAborted();const a=await this.run(first,tests[i].stdin,{signal}),b=second?await this.run(second,tests[i].stdin,{signal}):null;
   results.push({index:i,public:i<(program.public_tests||[]).length,passed:a.code===0&&!a.reason&&normalizeOutput(a.stdout)===normalizeOutput(tests[i].stdout),differential_agrees:b?b.code===0&&!b.reason&&normalizeOutput(a.stdout)===normalizeOutput(b.stdout):null,execution:{code:a.code,reason:a.reason,oom:Boolean(a.container_state?.OOMKilled),image:a.image},...(b?{independent_execution:{code:b.code,reason:b.reason}}:{})});
  }
  const ok=results.every(r=>r.passed&&r.differential_agrees!==false);return {status:ok?'technical_checks_passed':'quarantined',human_review:'pending',semantic_validation:'not_teacher_verified',independent_implementation:!!second,tests:results,language:program.language};
 }
 async assess(source,program,{signal}={}){const compiled=await this.compile(program.language,source,{signal});if(!compiled.ok)return {correct:false,method:'docker_stdin_stdout',reason:'compile_failed',compiler_diagnostic:compiled.check.stderr.slice(0,3000)};
  const checks=[];for(const t of [...program.public_tests,...program.private_tests]){const r=await this.run(compiled,t.stdin,{signal});checks.push({passed:r.code===0&&!r.reason&&normalizeOutput(r.stdout)===normalizeOutput(t.stdout),reason:r.reason,code:r.code});}
  // Never expose private inputs, expected output or hidden actual output to a student.
  return {correct:checks.every(x=>x.passed),method:'docker_stdin_stdout',passed:checks.filter(x=>x.passed).length,total:checks.length,checks};
 }
}
