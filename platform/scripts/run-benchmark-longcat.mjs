// Interactive bootstrap: never put an API key in source, command-line arguments,
// configuration files or console output. Model adapters only read process.env.
if(!process.env.LONGCAT_API_KEY){
 if(!process.stdin.isTTY)throw Error('需要交互终端的隐藏输入，或已配置 LONGCAT_API_KEY');
 process.stdout.write('LongCat credential (hidden): ');
 process.stdin.setRawMode(true);process.stdin.resume();
 try{process.env.LONGCAT_API_KEY=await new Promise(resolve=>{let value='';const read=bytes=>{for(const char of bytes.toString()){
  if(char==='\u0003'){process.stdin.setRawMode(false);process.exit(130);}
  if(char==='\r'||char==='\n'){process.stdin.off('data',read);process.stdout.write('\nCredential loaded into process environment; value not displayed.\n');resolve(value.trim());return;}
  if(char==='\u007f'||char==='\b')value=value.slice(0,-1);else value+=char;
 }};process.stdin.on('data',read);});}finally{process.stdin.setRawMode(false);process.stdin.pause();process.stdin.unref();}
 if(!process.env.LONGCAT_API_KEY)throw Error('密钥不能为空');
}
process.env.TUTOR_ENABLE_REAL_MODEL='1';process.env.TUTOR_PROVIDER='longcat';process.env.TUTOR_MODEL_ID='LongCat-2.0';
if(!process.argv.includes('--longcat'))process.argv.push('--longcat');
try{
 if(process.argv.includes('--evidence-pilot'))await import('./run-evidence-pilot.mjs');
 else if(process.argv.includes('--probe-first')){
  const {spawn}=await import('node:child_process');const {fileURLToPath}=await import('node:url');const path=await import('node:path');
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),script=path.join(root,'platform/scripts/run-benchmark.mjs');
  const invoke=args=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,[script,...args],{cwd:root,env:{...process.env},stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('close',resolve);});
  const probeOutput=process.argv.find(x=>x.startsWith('--probe-output='))?.slice(15)||'output/benchmark-v0.1/longcat-probe';
  const probe=await invoke(['--longcat','--probe','--output='+probeOutput]);
  if(probe!==0)process.exitCode=probe||1;
  else process.exitCode=await invoke(process.argv.slice(2).filter(x=>x!=='--probe-first'&&!x.startsWith('--probe-output=')));
 }else await import('./run-benchmark.mjs');
}finally{delete process.env.LONGCAT_API_KEY;}
