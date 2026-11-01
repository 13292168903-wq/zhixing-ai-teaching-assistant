import {spawn,spawnSync} from 'node:child_process';
export class HarnessWorker{
 constructor(){this.child=null;this.active=null;}
 async run(binary,args,spawnOptions,job,{signal,onProgress}={}){
  const reused=Boolean(this.child);const started=Date.now();
  if(!this.child){
   const child=this.child=spawn(binary,args,{...spawnOptions,stdio:['ignore','pipe','pipe','ipc']});
   let errorText='';child.stdout.on('data',s=>{errorText=(errorText+s).slice(-6000);});child.stderr.on('data',s=>{errorText=(errorText+s).slice(-6000);});
   this.ready=new Promise((resolve,reject)=>{
    this.readyReject=reject;
    child.on('message',m=>{if(m.type==='ready')resolve();else if(this.active){if(m.run_id&&m.run_id!==this.active.id)return;if(m.type==='progress')this.active.onProgress?.(m);else if(m.type==='done')this.active.resolve(m);else if(m.type==='failure')this.active.reject(new Error(m.message));}});
    child.on('error',reject);child.on('exit',()=>{if(this.child===child)this.child=null;const error=new Error('DS-H worker exited: '+errorText.replaceAll(process.env.LONGCAT_API_KEY||'__absent_key__','[REDACTED]'));reject(error);this.active?.reject(error);});
   });
  }
  let timer,abort;
  try{return await Promise.race([
   (async()=>{await this.ready;signal?.throwIfAborted();const readyMs=Date.now()-started;let firstDelta;
    const result=await new Promise((resolve,reject)=>{this.active={id:job.env.TUTOR_TICKET,resolve,reject,onProgress:m=>{firstDelta??=Date.now()-started;onProgress?.(m);}};this.child.send(job);});
    return {...result,worker_reused:reused,worker_ready_ms:readyMs,first_delta_ms:firstDelta};})(),
   new Promise((_,reject)=>{abort=()=>{this.close();reject(new Error('DS-H worker cancelled'));};signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>{this.close();reject(new Error('DS-H worker timeout'));},190000);})
  ]);}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);this.active=null;}
 }
 close(){const c=this.child;this.child=null;if(!c)return;if(process.platform==='win32')spawnSync('taskkill',['/PID',String(c.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else c.kill('SIGTERM');}
}
