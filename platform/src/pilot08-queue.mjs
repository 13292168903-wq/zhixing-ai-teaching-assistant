import {uid,hash,failure} from './store.mjs';
import {ModelBudget} from './longcat-client.mjs';
export class PilotModelQueue{
 constructor(store,harness){this.store=store;this.db=store.db;this.harness=harness;this.waiting=[];this.active=null;this.db.exec('CREATE TABLE IF NOT EXISTS pilot_model_tasks(id TEXT PRIMARY KEY,actor TEXT,course_id TEXT,tool TEXT,status TEXT,input TEXT,input_hash TEXT,run_id TEXT,result TEXT,error TEXT,created TEXT,updated TEXT)');this.db.prepare("UPDATE pilot_model_tasks SET status='interrupted',error='restart_requires_explicit_review' WHERE status IN ('queued','running')").run();}
 visible(actor){return this.db.prepare('SELECT id,actor,course_id,tool,status,run_id,error,created,updated FROM pilot_model_tasks ORDER BY rowid DESC LIMIT 200').all().filter(t=>actor.role==='admin'||t.actor===actor.id);}
 get(id,actor){const t=this.db.prepare('SELECT * FROM pilot_model_tasks WHERE id=?').get(id);if(!t||actor.role!=='admin'&&t.actor!==actor.id)failure('任务不存在',404);return t;}
 update(id,fields){for(const[k,v]of Object.entries(fields)){if(!['status','run_id','result','error'].includes(k))throw Error('Invalid task field');this.db.prepare('UPDATE pilot_model_tasks SET '+k+'=?,updated=? WHERE id=?').run(k==='result'?JSON.stringify(v):v,new Date().toISOString(),id);}}
 async invoke(tool,args,execute,rpc,options={}){
  const actor=options.actor_id||args.actor?.id||'system',id=options.request_id||uid();if(!/^[a-zA-Z0-9_-]{8,100}$/.test(id))failure('任务标识无效');const input=JSON.stringify({args,operation:options.operation||'',mode:options.mode||null}),digest=hash(input+actor+tool),old=this.db.prepare('SELECT * FROM pilot_model_tasks WHERE id=?').get(id);
  if(old){if(old.actor!==actor||old.input_hash!==digest)failure('任务编号已用于其他内容',409);if(old.status==='completed')return JSON.parse(old.result);failure('该任务已存在，请查看状态，不能自动重放付费步骤',409);}
  const now=new Date().toISOString();this.db.prepare('INSERT INTO pilot_model_tasks VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,actor,args.course_id||'',tool,'queued',input,digest,null,null,null,now,now);
  const controller=new AbortController();let abort=()=>controller.abort();options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)controller.abort();
  try{return await new Promise((resolve,reject)=>{this.waiting.push({id,controller,resolve,reject,run:()=>this.original(tool,args,execute,rpc,{...options,signal:controller.signal,onTicket:run=>{this.update(id,{run_id:run});options.onTicket?.(run);}})});options.onPhase?.({task_id:id,phase:'queued',position:this.waiting.length});this.drain();});}
  finally{options.signal?.removeEventListener('abort',abort);}
 }
 install(){this.original=this.harness.invoke.bind(this.harness);this.harness.invoke=this.invoke.bind(this);}
 async drain(){if(this.active||this.stopped)return;const item=this.waiting.shift();if(!item)return;this.active=item;
  try{item.controller.signal.throwIfAborted();this.update(item.id,{status:'running'});const result=await item.run();item.controller.signal.throwIfAborted();this.update(item.id,{status:'completed',result});item.resolve({...result,model_task_id:item.id});}
  catch(e){this.update(item.id,{status:item.controller.signal.aborted?'cancelled':'failed',error:String(e.message).slice(0,1000)});item.reject(e);}
  finally{this.active=null;this.drain();}
 }
 cancel(id,actor){const t=this.get(id,actor);if(['completed','cancelled'].includes(t.status))return {id,status:t.status};const item=this.active?.id===id?this.active:this.waiting.find(x=>x.id===id);item?.controller.abort();if(!item)this.update(id,{status:'cancelled'});return {id,status:'cancelling'};}
 limits(input){const allowed=['request_limit','budget_cny'];if(Object.keys(input).some(k=>!allowed.includes(k))||allowed.some(k=>input[k]!==null&&(!Number.isFinite(input[k])||input[k]<0)))failure('额度需为非负数或 null');const b=new ModelBudget(this.harness.budgetPath);b.db.exec('CREATE TABLE IF NOT EXISTS budget_policy(id INTEGER PRIMARY KEY,request_limit INTEGER,budget_cny REAL)');b.db.prepare('INSERT OR REPLACE INTO budget_policy VALUES(1,?,?)').run(input.request_limit,input.budget_cny);b.close();return input;}
 usage(actor){const b=new ModelBudget(this.harness.budgetPath),summary=b.summary(),rows=b.db.prepare('SELECT run_id,COUNT(*) calls,SUM(charged) estimated_cny FROM requests GROUP BY run_id').all();b.close();const tasks=this.visible(actor);return {summary:actor.role==='admin'?summary:undefined,estimated_not_invoice:true,tasks:tasks.map(t=>({...t,usage:rows.find(x=>x.run_id===t.run_id)||{calls:0,estimated_cny:0}}))};}
 async close(){this.stopped=true;this.active?.controller.abort();for(const i of this.waiting){i.controller.abort();this.update(i.id,{status:'cancelled'});i.reject(new Error('Server stopped'));}this.waiting=[];while(this.active)await new Promise(r=>setTimeout(r,20));}
}

