import http from 'node:http';
import path from 'node:path';
import {readFileSync,mkdirSync,readdirSync,existsSync} from 'node:fs';
import {backup} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {ROOT,loadData,assertCourse,importCourse} from './data.mjs';
import {Store,uid,failure} from './store.mjs';
import {PluginRegistry,registerCorePlugins} from './pedagogy.mjs';
import {TeachingService} from './services.mjs';
import {Evaluator} from './evaluation.mjs';
import {HarnessBridge} from './harness.mjs';
import {OnboardingService,COURSE_TEMPLATES} from './onboarding.mjs';
import {installExtension,EXTENSION_CATALOG} from './extensions.mjs';
import {MaterialService} from './materials.mjs';
import {seedPilots} from './pilot.mjs';
import {PilotEvaluator} from './pilot-evaluation.mjs';
import {ModelBudget} from './longcat-client.mjs';

export async function createApp({port=3810,varDir=path.join(ROOT,'var'),dbPath,defaultEngine='harness'}={}){
 mkdirSync(varDir,{recursive:true});const filename=dbPath||path.join(varDir,'platform.sqlite'),existing=filename!==':memory:'&&existsSync(filename),data=loadData(),store=new Store(filename);
 if(existing&&store.get('schema_version')!=='0.4.0'){mkdirSync(path.join(varDir,'backups'),{recursive:true});await backup(store.db,path.join(varDir,'backups/pre-v04-'+Date.now()+'.sqlite'));}
 const customDir=path.join(varDir,'course-packs');mkdirSync(customDir,{recursive:true});
 const service=new TeachingService(data,store),registry=new PluginRegistry();registerCorePlugins(registry,service);
 const onboarding=new OnboardingService(data,store,registry);
 for(const r of store.db.prepare('SELECT descriptor FROM installed_extensions ORDER BY created').all())installExtension(registry,JSON.parse(r.descriptor));
 data.capabilities=new Set(registry.plugins.keys());data.assessmentRegistry=registry.assessments;
 for(const f of readdirSync(customDir).filter(x=>x.endsWith('.json')))importCourse(data,JSON.parse(readFileSync(path.join(customDir,f),'utf8')));
 onboarding.load();
 const materials=new MaterialService(data,store,varDir);data.materialStore=store;
 const previewStore=new Store(path.join(varDir,'preview.sqlite')),previewService=new TeachingService(data,previewStore),previewRegistry=new PluginRegistry();previewService.preview=true;registerCorePlugins(previewRegistry,previewService);
 const pilotEvaluator=new PilotEvaluator(data,store);store.set('schema_version','0.4.0');let seeding=false;
 const evaluator=new Evaluator(data,store),harness=new HarnessBridge(varDir);let origin;
 const json=(res,status,value,headers={})=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers});res.end(JSON.stringify(value));};
 async function body(req){let s='';const max=req.url==='/api/teacher/materials'?8*1024*1024:1024*1024;for await(const chunk of req){s+=chunk;if(Buffer.byteLength(s)>max)failure('请求过大',413);}try{return s?JSON.parse(s):{};}catch{failure('JSON 格式错误');}}
 const allow=(actor,roles)=>{if(!actor)failure('请先登录演示账户',401);if(!roles.includes(actor.role))failure('当前角色没有此操作权限',403);};
 async function dispatch(tool,args,actor,engine,activeRegistry=registry){
  if(!['local','harness'].includes(engine))failure('执行方式不合法');
  const activeService=activeRegistry===previewRegistry?previewService:service,activeStore=activeService.store;
  if(tool==='verify_submission'&&typeof args.event_id==='string'&&activeStore.db.prepare('SELECT 1 FROM submissions WHERE id=?').get(args.event_id))return {...activeService.submit({...args,actor}),cached_submission:true};
  const execute=args=>activeRegistry.call(tool,{actor},{...args,actor});
  const result=engine==='harness'?await harness.invoke(tool,args,execute,origin+'/internal/tool'):{...await execute(args),runtime:{engine:'local_rules',real_model_calls:0}};
  if(tool==='verify_submission')activeStore.db.prepare('UPDATE submissions SET result=? WHERE id=? AND user_id=?').run(JSON.stringify(result),args.event_id,actor.id);
  return result;
 }
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  try{
   const expectedPort=server.address()?.port;
   if(!['127.0.0.1:'+expectedPort,'localhost:'+expectedPort].includes(req.headers.host))failure('Host 不允许',403);
   if(req.method!=='GET'&&req.headers.origin&&!['http://127.0.0.1:'+expectedPort,'http://localhost:'+expectedPort].includes(req.headers.origin))failure('跨站请求不允许',403);
   const url=new URL(req.url,'http://127.0.0.1');const route=url.pathname;
   const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('tutor_session='))?.slice(14);
   const actor=store.session(cookie);
   if(route==='/internal/tool'&&req.method==='POST')return json(res,200,await harness.rpc(await body(req),req.headers.authorization));
   if(route==='/api/status'&&req.method==='GET')return json(res,200,{name:'知行 · 插件化 AI 助教',version:'0.4.0',demo:true,harness:harness.status(),default_engine:defaultEngine,
     data_review:'课程包和开放量规为草稿；规则反馈非正式成绩',capabilities:registry.manifest()});
   if(route==='/api/demo-login'&&req.method==='POST'){
    const {role}=await body(req),login=store.login(role);return json(res,200,login.user,{'set-cookie':'tutor_session='+login.token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800'});
   }
   if(route.startsWith('/api/'))allow(actor,['student','teacher','admin']);
   if(route==='/api/me')return json(res,200,actor);
   if(route==='/api/logout'&&req.method==='POST'){
    store.db.prepare('DELETE FROM sessions WHERE token=?').run((await import('./store.mjs')).hash(cookie||''));return json(res,200,{ok:true},{'set-cookie':'tutor_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});
   }
   if(route==='/api/courses')return json(res,200,[...data.courses.values()].filter(c=>actor.role!=='student'||c.onboarding_status!=='draft').map(c=>({id:c.course_id,title:c.title,version:c.version,review_status:c.review_status,onboarding_status:c.onboarding_status,
     concepts:c.concepts.map(x=>({id:x.id,title:x.title,objective:x.learning_objective})),item_count:[...data.items.values()].filter(x=>x.course_id===c.course_id).length})));
   if(route==='/api/plugins')return json(res,200,registry.manifest());
   if(route==='/api/state'){
    const id=url.searchParams.get('course');service.access(actor,id);return json(res,200,store.states(actor.id,id));
   }
   if(route==='/api/history'){
    const id=url.searchParams.get('course');service.access(actor,id);return json(res,200,store.db.prepare('SELECT id,item_id,result,created FROM submissions WHERE user_id=? AND course_id=? ORDER BY created DESC LIMIT 30').all(actor.id,id).map(x=>({...x,result:JSON.parse(x.result)})));
   }
   if(route==='/api/ask'&&req.method==='POST'){
    const b=await body(req);if(typeof b.query!=='string'||!b.query.trim()||b.query.length>2000)failure('请输入 1-2000 字的问题');
    const result=await dispatch('retrieve_evidence',{course_id:b.course_id,query:b.query},actor,b.engine||defaultEngine);
    store.db.prepare('INSERT INTO chat VALUES(?,?,?,?,?,?)').run(uid(),actor.id,b.course_id,b.query,JSON.stringify(result),new Date().toISOString());return json(res,200,result);
   }
   if(route==='/api/practice'&&req.method==='POST'){const b=await body(req);return json(res,200,await dispatch('generate_task',b,actor,b.engine||defaultEngine));}
   if(route==='/api/submit'&&req.method==='POST'){const b=await body(req);return json(res,200,await dispatch('verify_submission',b,actor,b.engine||defaultEngine));}
   if(route==='/api/hint'&&req.method==='POST'){const b=await body(req);return json(res,200,service.hint(actor,b.assignment_id,b.full===true));}
   if(route.startsWith('/api/teacher/'))allow(actor,['teacher','admin']);
   if(route.startsWith('/api/admin/'))allow(actor,['admin']);
   if(route==='/api/teacher/pilot/setup'&&req.method==='POST'){
    if(seeding)failure('试点资料正在初始化',409);seeding=true;try{return json(res,201,await seedPilots(data,onboarding,materials,actor));}finally{seeding=false;}
   }
   if(route==='/api/teacher/materials'&&req.method==='POST')return json(res,201,await materials.upload(await body(req),actor));
   if(route==='/api/teacher/materials'&&req.method==='GET')return json(res,200,materials.list(url.searchParams.get('course')));
   const materialRoute=route.match(/^\/api\/teacher\/materials\/(mat-[a-f0-9]+)(?:\/(review|file))?$/);
   if(materialRoute){const [,id,op]=materialRoute;
    if(op==='review'&&req.method==='POST')return json(res,200,materials.review(id,await body(req),actor));
    if(!op&&req.method==='GET')return json(res,200,materials.get(id));
    if(op==='file'&&req.method==='GET'){materials.get(id);res.writeHead(200,{'content-type':'application/octet-stream','content-disposition':'attachment; filename="material.source"'});return res.end(readFileSync(path.join(varDir,'materials',id+'.source')));}
   }
   const previewRoute=route.match(/^\/api\/teacher\/preview\/(ask|practice|submit|hint|state|history)$/);
   if(previewRoute){const previewActor={...actor,id:'preview-'+actor.id},op=previewRoute[1];
    if(['state','history'].includes(op)&&req.method==='GET'){
     const course=url.searchParams.get('course');assertCourse(data,course);return json(res,200,op==='state'?previewStore.states(previewActor.id,course):previewStore.db.prepare('SELECT id,item_id,result,created FROM submissions WHERE user_id=? AND course_id=? ORDER BY created DESC LIMIT 30').all(previewActor.id,course).map(x=>({...x,result:JSON.parse(x.result)})));
    }
    if(req.method==='POST'){
     const b=await body(req);let result;
     if(op==='hint')result=previewService.hint(previewActor,b.assignment_id,b.full===true);
     else{if(op==='ask'&&(typeof b.query!=='string'||!b.query.trim()||b.query.length>2000))failure('请输入 1-2000 字的问题');
      result=await dispatch(({ask:'retrieve_evidence',practice:'generate_task',submit:'verify_submission'})[op],b,previewActor,b.engine||defaultEngine,previewRegistry);
      if(op==='ask')previewStore.db.prepare('INSERT INTO chat VALUES(?,?,?,?,?,?)').run(uid(),previewActor.id,b.course_id,b.query,JSON.stringify(result),new Date().toISOString());
     }return json(res,200,{...result,preview:true,review_status:'pending_human_review'});
    }
   }
   if(route==='/api/teacher/course-evaluations'&&req.method==='POST'){const b=await body(req);return json(res,200,b.action==='improve'?pilotEvaluator.improve(b.course_id,actor):pilotEvaluator.run({course_id:b.course_id,partition:b.partition,config:b.config||{},frozen:b.frozen===true,version:b.version||'baseline'}));}
   if(route==='/api/teacher/pilot/overview'&&req.method==='GET'){
    let budget={requests:0,budget_cny:5,request_limit:30};if(existsSync(harness.budgetPath)){const ledger=new ModelBudget(harness.budgetPath);budget=ledger.summary();ledger.close();}
    let realValidation=null;const reportPath=path.resolve(ROOT,'../output/pilot-v0.4/reports/longcat-validation.json');if(existsSync(reportPath)){const report=JSON.parse(readFileSync(reportPath,'utf8'));realValidation={status:report.status,scenarios:report.scenarios.length,contract_passed:report.scenarios.filter(s=>s.contract_passed).length,cumulative_requests:report.budget?.requests||0,human_review:report.human_review};}
    return json(res,200,{budget,longcat:harness.status(),real_validation:realValidation,courses:[...data.courses.values()].filter(c=>c.course_id.endsWith('_pilot')).map(c=>({id:c.course_id,title:c.title,status:c.onboarding_status})),
     runs:store.db.prepare('SELECT result FROM pilot_eval_runs ORDER BY created DESC LIMIT 30').all().map(r=>JSON.parse(r.result)),changes:store.db.prepare('SELECT data FROM pilot_changes').all().map(r=>JSON.parse(r.data))});
   }
   if(route==='/api/teacher/review-package'&&req.method==='GET')return json(res,200,{schema_version:'0.4.0',human_review:'pending',real_student_data:false,
    courses:onboarding.list().filter(c=>c.course_id.endsWith('_pilot')).map(c=>({...c,materials:materials.list(c.course_id).map(m=>materials.get(m.id))})),
    exercise_references:[...data.items.values()].filter(i=>i.course_id.endsWith('_pilot')).map(i=>({id:i.id,prompt:i.prompt,reference:i.reference,review_status:store.db.prepare('SELECT status FROM reviews WHERE item_id=?').get(i.id)?.status||'pending'})),
    preview_answers:previewStore.db.prepare('SELECT course_id,question,result,created FROM chat ORDER BY created DESC LIMIT 100').all().map(r=>({...r,result:JSON.parse(r.result)})),
    preview_submissions:previewStore.db.prepare('SELECT course_id,item_id,result,created FROM submissions ORDER BY created DESC LIMIT 100').all().map(r=>({...r,result:JSON.parse(r.result)})),
    candidate_changes:store.db.prepare('SELECT data FROM pilot_changes').all().map(r=>JSON.parse(r.data)),holdout_references_included:false});
   if(route==='/api/teacher/onboarding'&&req.method==='GET')return json(res,200,{templates:COURSE_TEMPLATES,courses:onboarding.list(),plugins:registry.manifest(),catalog:EXTENSION_CATALOG});
   if(route==='/api/teacher/onboarding/preview'&&req.method==='POST')return json(res,200,onboarding.preview((await body(req)).rows));
   if(route==='/api/teacher/onboarding/batch'&&req.method==='POST'){const b=await body(req);return json(res,201,onboarding.commit(b.rows,b.digest,actor));}
   if(route==='/api/teacher/onboarding/template'&&req.method==='POST'){
    const row=await body(req),report=onboarding.preview([row]);if(!report.valid)return json(res,400,{error:'课程校验未通过',details:report});
    return json(res,201,onboarding.commit([row],report.digest,actor));
   }
   const onboardCourse=route.match(/^\/api\/teacher\/onboarding\/([a-z][a-z0-9_]{1,47})\/(content|template|plugins|publish|pack)$/);
   if(onboardCourse){const [,id,op]=onboardCourse;
    if(op==='pack'&&req.method==='GET'){const row=store.db.prepare('SELECT pack FROM course_catalog WHERE course_id=?').get(id);if(!row)failure('课程不存在',404);return json(res,200,JSON.parse(row.pack));}
    if(req.method==='POST'){const b=await body(req);return json(res,200,op==='content'?onboarding.replace(id,b,actor):op==='template'?onboarding.fromTemplate(id,b,actor):op==='plugins'?onboarding.bind(id,b.capabilities,actor):op==='publish'?onboarding.publish(id,b.notes,actor):failure('方法不允许',405));}
   }
   if(route==='/api/admin/plugins/install'&&req.method==='POST'){
    const b=await body(req),descriptor=b.plugin_id?EXTENSION_CATALOG.find(p=>p.id===b.plugin_id):b.descriptor;
    if(!descriptor)failure('插件不存在');const plugin=installExtension(registry,descriptor);
    try{store.db.prepare('INSERT INTO installed_extensions VALUES(?,?,?)').run(plugin.id,JSON.stringify(plugin),new Date().toISOString());}
    catch(e){registry.plugins.delete(plugin.id);registry.assessments.delete(plugin.id);throw e;}
    data.capabilities.add(plugin.id);store.audit(actor.id,'plugin_installed',{id:plugin.id,version:plugin.version});return json(res,201,plugin);
   }
   if(route==='/api/teacher/items'){
    const course=url.searchParams.get('course');assertCourse(data,course);
    return json(res,200,[...data.items.values()].filter(x=>x.course_id===course).map(x=>({...x,review:store.db.prepare('SELECT * FROM reviews WHERE item_id=?').get(x.id)||{status:'pending'}})));
   }
   if(route==='/api/teacher/review'&&req.method==='POST'){
    const b=await body(req);if(!data.items.has(b.item_id)||!['approved','rejected'].includes(b.status)||typeof b.notes!=='string'||!b.notes.trim())failure('请选择题目、审核状态并填写理由');
    store.db.prepare('INSERT INTO reviews VALUES(?,?,?,?,?) ON CONFLICT(item_id) DO UPDATE SET status=excluded.status,reviewer=excluded.reviewer,notes=excluded.notes,updated=excluded.updated').run(b.item_id,b.status,actor.id,b.notes.slice(0,2000),new Date().toISOString());
    store.audit(actor.id,'item_review',{item_id:b.item_id,status:b.status});return json(res,200,{ok:true});
   }
   if(route==='/api/teacher/import'&&req.method==='POST'){
    return json(res,201,onboarding.importPack(await body(req),actor));
   }
   if(route==='/api/teacher/analytics')return json(res,200,{courses:store.db.prepare('SELECT course_id,COUNT(*) AS submissions FROM submissions GROUP BY course_id').all(),
    states:store.db.prepare('SELECT course_id,concept_id,COUNT(*) AS learners FROM states GROUP BY course_id,concept_id').all(),reviews:store.db.prepare('SELECT status,COUNT(*) AS count FROM reviews GROUP BY status').all()});
   if(['/api/overview','/api/evaluations','/api/runs','/api/candidates','/api/adaptive','/api/rollback'].includes(route)||route.startsWith('/api/candidates/'))allow(actor,['teacher','admin']);
   if(route==='/api/overview')return json(res,200,{published:store.release(),candidates:store.db.prepare('SELECT * FROM candidates ORDER BY created DESC').all().map(x=>({...x,config:JSON.parse(x.config),reason:JSON.parse(x.reason),validation:x.validation?JSON.parse(x.validation):null})),
    releases:store.db.prepare('SELECT version,status,parent,reviewer,created FROM releases ORDER BY created DESC').all(),experiences:store.db.prepare('SELECT * FROM experiences').all().map(x=>({...JSON.parse(x.data),status:x.status})),
    audit:store.db.prepare('SELECT actor,action,data,created FROM audit ORDER BY created DESC LIMIT 30').all(),harness:harness.status()});
   if(route==='/api/runs')return json(res,200,store.db.prepare('SELECT result FROM eval_runs ORDER BY created DESC LIMIT 30').all().map(x=>JSON.parse(x.result)));
   if(route==='/api/evaluations'&&req.method==='POST'){const b=await body(req);return json(res,200,evaluator.run({partition:b.partition||'dev',version:store.get('published_version'),frozen:b.frozen===true}));}
   if(route==='/api/candidates'&&req.method==='POST')return json(res,201,evaluator.propose(actor));
   if(route==='/api/adaptive'&&req.method==='POST')return json(res,200,evaluator.adaptive(actor));
   if(route==='/api/rollback'&&req.method==='POST')return json(res,200,evaluator.rollback(actor));
   const candidate=route.match(/^\/api\/candidates\/([a-zA-Z0-9_-]+)\/(validate|publish)$/);
   if(candidate&&req.method==='POST')return json(res,200,candidate[2]==='validate'?evaluator.validate(candidate[1],actor):evaluator.publish(candidate[1],actor));
   if(route.startsWith('/api/'))failure('接口不存在',404);
   const files={'/':'index.html','/app.js':'app.js','/pilot.js':'pilot.js','/onboarding.js':'onboarding.js','/onboarding-shared.mjs':'onboarding-shared.mjs','/onboarding.css':'onboarding.css','/styles.css':'styles.css'};
   if(!files[route]||req.method!=='GET')failure('页面不存在',404);
   const file=files[route];res.writeHead(200,{'content-type':/\.m?js$/.test(file)?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8'});res.end(readFileSync(path.join(ROOT,'public',file)));
  }catch(e){if(!res.headersSent)json(res,e.status||500,{error:e.status?e.message:'操作未完成，请查看服务端记录',...(e.status&&e.details?{details:e.details}:{})});else res.end();if(!e.status)console.error(e);}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});origin='http://127.0.0.1:'+server.address().port;
 return {server,origin,data,store,registry,onboarding,evaluator,harness,materials,previewStore,previewService,pilotEvaluator,close:async()=>{await new Promise(r=>server.close(r));previewStore.close();store.close();}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const app=await createApp({port:Number(process.env.PORT||3810),defaultEngine:process.env.TUTOR_ENGINE||'harness'});
 console.log('教学平台已启动：'+app.origin+(app.harness.real?'（已显式开启有预算上限的真实模型）':'（本地演示账户，不调用付费模型）'));
 const stop=async()=>{await app.close();process.exit(0);};process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
