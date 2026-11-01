import {uid,hash,failure} from './store.mjs';
import {checkJob,stable} from './plugin-sdk.mjs';
export class PluginJobs{
 constructor(store,{authorize,run}){this.store=store;this.authorize=authorize;this.run=run;this.active=null;this.stopped=false;
  store.db.exec(`CREATE TABLE IF NOT EXISTS plugin_jobs(id TEXT PRIMARY KEY,idempotency_key TEXT UNIQUE,actor TEXT,course_id TEXT,plugin_id TEXT,status TEXT,input TEXT,input_hash TEXT,progress TEXT,result TEXT,error TEXT,created TEXT,updated TEXT);
   CREATE TABLE IF NOT EXISTS plugin_job_steps(job_id TEXT,step TEXT,status TEXT,result TEXT,updated TEXT,PRIMARY KEY(job_id,step));`);
  store.db.prepare("UPDATE plugin_jobs SET status='interrupted',error='server_restart_explicit_resume_required' WHERE status IN ('running','queued')").run();
 }
 list(){return this.store.db.prepare('SELECT id FROM plugin_jobs ORDER BY created DESC LIMIT 100').all().map(r=>{const {input,actor,input_hash,...summary}=this.get(r.id);return {...summary,input:{mode:input.mode,seed:input.seed,kind:input.kind,language:input.language,persona:input.persona,strategy:input.strategy,dataset_id:input.dataset_id,experiment_id:input.experiment_id,action:input.action}};});}
 get(id){const r=this.store.db.prepare('SELECT * FROM plugin_jobs WHERE id=?').get(id);if(!r)failure('插件任务不存在',404);return {...r,input:JSON.parse(r.input),progress:JSON.parse(r.progress),result:r.result?JSON.parse(r.result):null};}
 create(input,actor){input=checkJob(input);this.authorize(input,actor);const digest=hash(stable({...input,actor:actor.id})),old=this.store.db.prepare('SELECT id,input_hash FROM plugin_jobs WHERE idempotency_key=?').get(input.idempotency_key);if(old){if(old.input_hash!==digest)failure('任务编号已用于不同参数',409);return {...this.get(old.id),cached:true};}
  const id=uid(),now=new Date().toISOString();this.store.db.prepare('INSERT INTO plugin_jobs VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,input.idempotency_key,JSON.stringify(actor),input.course_id,input.plugin_id,'queued',JSON.stringify(input),digest,'{}',null,null,now,now);
  this.kick();return this.get(id);
 }
 update(id,fields){for(const [k,v]of Object.entries(fields)){if(!['status','progress','result','error'].includes(k))throw Error('Bad job update');this.store.db.prepare(`UPDATE plugin_jobs SET ${k}=?,updated=? WHERE id=?`).run(['progress','result'].includes(k)?JSON.stringify(v):v,new Date().toISOString(),id);}}
 cancel(id){const j=this.get(id);if(['completed','cancelled'].includes(j.status))return j;this.update(id,{status:'cancelled',error:'cancelled_by_teacher'});if(this.active?.id===id)this.active.controller.abort();return this.get(id);}
 resume(id,actor){const j=this.get(id);if(!['failed','interrupted','cancelled'].includes(j.status))failure('该任务无需恢复',409);this.authorize(j.input,actor);
  const uncertain=this.store.db.prepare("SELECT step FROM plugin_job_steps WHERE job_id=? AND status IN ('started','uncertain')").all(id);if(uncertain.length)failure('存在结果未知的模型或教学步骤；为防止重复计费，不能重放。请核查运行记录后另建任务。',409);
  this.update(id,{status:'queued',error:null});this.store.audit(actor.id,'plugin_job_explicit_resume',{id,completed_steps_reused:true});this.kick();return this.get(id);
 }
 async step(id,key,fn){const old=this.store.db.prepare('SELECT * FROM plugin_job_steps WHERE job_id=? AND step=?').get(id,key);if(old?.status==='completed')return JSON.parse(old.result);if(old?.status==='started')failure('步骤结果未知，禁止自动重复执行',409);
  this.store.db.prepare('INSERT INTO plugin_job_steps VALUES(?,?,?,?,?)').run(id,key,'started',null,new Date().toISOString());
  try{const value=await fn();this.store.db.prepare("UPDATE plugin_job_steps SET status='completed',result=?,updated=? WHERE job_id=? AND step=?").run(JSON.stringify(value),new Date().toISOString(),id,key);return value;}catch(e){this.store.db.prepare("UPDATE plugin_job_steps SET status='uncertain',result=?,updated=? WHERE job_id=? AND step=?").run(JSON.stringify({error:e.message}),new Date().toISOString(),id,key);throw e;}
 }
 kick(){if(this.stopped||this.active)return;this.timer=setTimeout(()=>this.drain(),10);}
 async drain(){if(this.stopped||this.active)return;const row=this.store.db.prepare("SELECT id FROM plugin_jobs WHERE status='queued' ORDER BY created LIMIT 1").get();if(!row)return;const job=this.get(row.id),controller=new AbortController();this.active={id:job.id,controller};this.update(job.id,{status:'running'});
  try{this.authorize(job.input,JSON.parse(job.actor));const result=await this.run(job,{signal:controller.signal,progress:p=>this.update(job.id,{progress:p}),step:(key,fn)=>this.step(job.id,key,fn)});if(!controller.signal.aborted)this.update(job.id,{status:'completed',result});}
  catch(e){if(!controller.signal.aborted)this.update(job.id,{status:'failed',error:String(e.message).slice(0,1000)});}finally{this.active=null;this.kick();}
 }
 async close(){this.stopped=true;clearTimeout(this.timer);if(this.active){this.active.controller.abort();while(this.active)await new Promise(r=>setTimeout(r,30));}}
}
