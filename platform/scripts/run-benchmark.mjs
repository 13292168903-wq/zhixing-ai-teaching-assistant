import path from 'node:path';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {ROOT} from '../src/data.mjs';
import {benchmarkFixture,waitBenchmark} from './benchmark-fixture.mjs';
const mode=process.argv.includes('--longcat')?'longcat':'offline';
if(mode==='longcat'&&!process.env.LONGCAT_API_KEY){console.error('LONGCAT_API_KEY 未配置；不会复用其他进程的密钥或伪造真实结果。');process.exitCode=2;}else{
 const output=path.resolve(ROOT,'../output/benchmark-v0.1',mode),dir=path.join(output,'private-runtime');mkdirSync(output,{recursive:true});
 const alternative=process.argv.find(x=>x.startsWith('--output='));
 const target=alternative?path.resolve(alternative.slice(9)):output;mkdirSync(target,{recursive:true});
 if(existsSync(path.join(target,'private-runtime/platform.sqlite')))throw Error('该实验已创建。为避免重放付费步骤，请检查既有任务；新实验请使用 --output=新目录。');
 const {app,users}=await benchmarkFixture({directory:path.join(target,'private-runtime'),mode});
 const factory=app.pluginLab.evaluationFactory,reports=[],started=new Date().toISOString();
 const save=(name,value)=>writeFileSync(path.join(target,name),JSON.stringify(value,null,2));
 try{
  const sandbox=await app.sandbox.status();save('environment.json',{mode,sandbox,harness:app.harness.status(),started,synthetic_accounts:true,teacher_approval:false});
  const countsBefore=Object.fromEntries(['submissions','states','chat','reviews'].map(t=>[t,app.store.db.prepare('SELECT COUNT(*) n FROM '+t).get().n]));
  const run=async(d,action='generate',extra={})=>{const j=factory.queue(d.id,action,users.teacher,{idempotency_key:'benchmark-'+mode+'-'+d.id,...extra});console.log(JSON.stringify({event:'queued',id:d.id,job:j.id,title:d.title||action}));const result=await waitBenchmark(app,j.id);console.log(JSON.stringify({event:'finished',id:d.id,status:result.status,error:result.error}));if(result.status!=='completed')throw Error('实验暂停：'+result.error);return factory.report(d.id);};
  if(process.argv.includes('--probe')){
   for(const course_id of ['python_pilot','ai_literacy_pilot']){const concept_id=course_id==='python_pilot'?'lists':'train_infer';const d=factory.create({course_id,arm:'B',mode,count:2,seed:42,concept_ids:[concept_id],scenarios:['hint_dependency'],title:'独立真实协议探针 · 不计入对照收益'},users.teacher);reports.push(await run(d));}
   if(reports.reduce((n,r)=>n+r.metrics.real_model_calls,0)===0)throw Error('协议探针没有有效教学调用；请先核查生成与核验记录');
   save('summary.json',{status:'completed',mode,scope:'protocol_probe_not_comparative_benefit',reports:reports.map(r=>({dataset:r.dataset,metrics:r.metrics})),started,completed:new Date().toISOString()});
  }else{
  const anchor=factory.create({course_id:'python_pilot',arm:'A',mode,count:40,seed:42,title:'Python 固定锚定案例 · 研究候选'},users.teacher);reports.push(await run(anchor));
  const experiment=factory.experiment({course_id:'python_pilot',mode,seeds:[42,43,44]},users.teacher);save('experiment-config.json',experiment);
  const anchorCategories=factory.cases(anchor.id).filter(c=>c.variant==='normal').map(c=>({category_id:c.category_id,concept_id:c.concept_id,scenario:c.scenario}));
  for(const id of experiment.dataset_ids){const d=factory.get(id);d.anchor_categories=anchorCategories;if(d.arm==='C')d.feedback=reports[0].failures.map(r=>({category_id:r.category_id,concept_id:r.concept_id,scenario:r.scenario,confirmed_failure:true,failure_type:r.failure_type}));factory.save('datasets',d);}
  const ej=factory.queue(experiment.dataset_ids[0],'experiment',users.teacher,{idempotency_key:'comparison-'+experiment.id,experiment_id:experiment.id});
  const result=await waitBenchmark(app,ej.id,{timeout:8*60*60*1000});save('experiment-job.json',result);if(result.status!=='completed')throw Error('对照实验暂停：'+result.error);
  for(const id of experiment.dataset_ids)reports.push(factory.report(id));
  const transfer=factory.create({course_id:'ai_literacy_pilot',arm:'C',mode,count:24,seed:42,title:'AI通识迁移 · 研究候选'},users.teacher);reports.push(await run(transfer));
  const countsAfter=Object.fromEntries(Object.keys(countsBefore).map(t=>[t,app.store.db.prepare('SELECT COUNT(*) n FROM '+t).get().n]));
  save('state-isolation.json',{countsBefore,countsAfter,unchanged:JSON.stringify(countsBefore)===JSON.stringify(countsAfter),formal_workspace_not_opened:true});
  for(const r of reports)await factory.routes('/api/teacher/evaluation-datasets/'+r.dataset.id+'/freeze','POST',new URL('http://localhost'),{},users.teacher);
  save('summary.json',{status:'completed',mode,reports:reports.map(r=>({dataset:factory.summary(factory.get(r.dataset.id)),metrics:r.metrics})),claims:{teacher_accuracy:null,learning_gain:null,real_user_satisfaction:null},sealed_read:false,started,completed:new Date().toISOString()});
  }
 }catch(e){save('interrupted.json',{status:'interrupted',reason:e.message,mode,started,at:new Date().toISOString(),no_automatic_paid_replay:true});process.exitCode=1;}
 finally{
  const datasets=factory.db.prepare('SELECT id FROM benchmark_datasets').all(),allCases=[],allRuns=[];
  for(const {id}of datasets){const d=factory.get(id);allCases.push(...factory.cases(id));allRuns.push(...factory.runs(id));save('report-'+id+'.json',factory.report(id));}
  const jsonl=(name,rows)=>writeFileSync(path.join(target,name),rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
  jsonl('candidates.evaluator-private.jsonl',allCases);jsonl('inputs.public.jsonl',allCases.map(c=>({id:c.id,course_id:c.course_id,concept_id:c.concept_id,family_id:c.family_id,public:c.public,validation_status:c.validation.status})));
  jsonl('runs.evaluator-private.jsonl',allRuns);
  const csv=s=>'"'+String(s??'').replaceAll('"','""')+'"';writeFileSync(path.join(target,'human-review.csv'),'\ufeff'+[['id','course','scenario','variant','family','technical','review','notes'],...allCases.map(c=>[c.id,c.course_id,c.scenario,c.variant,c.family_id,c.validation.status,c.review.status,''])].map(r=>r.map(csv).join(',')).join('\r\n'));
  const budgetPath=app.harness.budgetPath;let usage={requests:0,charged_cny:0,scope:'no_real_calls'};
  if(existsSync(budgetPath)){const db=new DatabaseSync(budgetPath,{readOnly:true}),rows=db.prepare('SELECT run_id,charged,status,usage FROM requests').all(),phaseRuns=new Map();for(const c of allCases){if(c.generator.runtime?.run_id)phaseRuns.set(c.generator.runtime.run_id,'generation');if(c.advisory?.runtime?.run_id)phaseRuns.set(c.advisory.runtime.run_id,'verification');}for(const r of allRuns)for(const trial of r.trials)for(const runtime of trial.runtimes||[])if(runtime.run_id)phaseRuns.set(runtime.run_id,'tutor');const phases={};for(const row of rows){const phase=phaseRuns.get(row.run_id)||'interrupted_or_unknown';const p=phases[phase]||(phases[phase]={requests:0,estimated_cny:0});p.requests++;p.estimated_cny+=row.charged;}usage={requests:rows.length,charged_cny:rows.reduce((n,r)=>n+r.charged,0),phases,scope:'isolated_experiment_ledger',pricing:'configured_estimate_not_invoice'};db.close();}save('usage.json',usage);
  save('criteria-evidence.json',{criteria:factory.report(datasets[0]?.id).criteria,automation_scope:'local_technical_checks',teacher_review:'pending',real_users:'not_recruited',reference:'https://arxiv.org/html/2407.08351v2'});
  await app.close();
 }
}
