import path from 'node:path';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {ROOT} from '../src/data.mjs';
import {fingerprint} from '../src/plugin-sdk.mjs';
import {benchmarkFixture,waitBenchmark} from './benchmark-fixture.mjs';
import {evidenceStillMatches} from '../src/evidence-bindings.mjs';
const mode=process.argv.includes('--longcat')?'longcat':'offline',target=path.resolve(process.argv.find(a=>a.startsWith('--output='))?.slice(9)||'output/benchmark-v0.1/evidence-binding-v0.1.1');
mkdirSync(target,{recursive:true});if(existsSync(path.join(target,'private-runtime/platform.sqlite')))throw Error('输出目录已使用，不自动重放付费步骤');
const oldPath=path.resolve(ROOT,'../output/benchmark-v0.1/longcat-release/private-runtime/benchmark-v0.1/benchmark.sqlite');
const old=existsSync(oldPath)?new DatabaseSync(oldPath,{readOnly:true}):null;
const baseline=old?old.prepare('SELECT data FROM benchmark_datasets').all().map(r=>JSON.parse(r.data)):[];
const {app,users}=await benchmarkFixture({mode,directory:path.join(target,'private-runtime')}),factory=app.pluginLab.evaluationFactory,reports=[];
const before=Object.fromEntries(['submissions','states','chat','reviews'].map(t=>[t,app.store.db.prepare('SELECT COUNT(*) n FROM '+t).get().n]));
const save=(name,value)=>writeFileSync(path.join(target,name),JSON.stringify(value,null,2));
try{
 for(const [course_id,count,title]of [['python_pilot',12,'证据绑定修复 · Python小批验证'],['ai_literacy_pilot',8,'证据绑定修复 · AI通识小批验证']]){
  const previous=baseline.find(d=>d.course_id===course_id&&(course_id==='python_pilot'?d.arm==='B'&&d.seed===42:d.title.startsWith('AI通识迁移')));
  const created=factory.create({course_id,count,arm:previous?.arm||'B',seed:42,mode,title},users.teacher),d=factory.get(created.id);
  d.anchor_categories=previous?.anchor_categories||[];factory.save('datasets',d);
  const job=factory.queue(d.id,'generate',users.teacher,{idempotency_key:'evidence-binding-'+d.id});console.log(JSON.stringify({event:'queued',course_id,count,job:job.id}));
  const done=await waitBenchmark(app,job.id,{timeout:90*60*1000});if(done.status!=='completed')throw Error('验证中断，不自动重试：'+done.error);
  const cases=factory.cases(d.id),runs=factory.runs(d.id),prior=previous?old.prepare('SELECT data FROM benchmark_cases WHERE dataset_id=? ORDER BY rowid LIMIT ?').all(previous.id,count).map(r=>JSON.parse(r.data)):[];
  const sourceMatch=previous?fingerprint({course:d.snapshot.course,sources:d.snapshot.sources,items:d.snapshot.items})===fingerprint({course:previous.snapshot.course,sources:previous.snapshot.sources,items:previous.snapshot.items}):null;
  const matched=prior.length===cases.length&&prior.every((c,i)=>c.category_id===cases[i].category_id&&c.variant===cases[i].variant);
  const bindings=cases.every(c=>(c.source_evidence||[]).every(e=>evidenceStillMatches(e,d.snapshot))&&(c.advisory?.source_excerpts||[]).every(e=>evidenceStillMatches(e,d.snapshot)));
  if(!bindings)throw Error('证据绑定完整性失败');
  const result={dataset:factory.summary(factory.get(d.id)),metrics:factory.metrics(d.id),source_snapshot_matches_previous:sourceMatch,matched_category_prefix:matched,previous_prefix_admitted:prior.filter(c=>c.validation.status==='passed').length,previous_prefix_candidates:prior.length,scope:'small_engineering_comparison_not_full_ABC_or_learning_effect',binding_integrity:true,quote_integrity:cases.every(c=>!c.advisory?.valid_quote||((c.public.kind==='ask'?c.public.query:c.public.explanation).includes(c.advisory.quote))),teacher_review:'pending',failures_by_check:{}};
  for(const c of cases)for(const check of c.validation.checks.filter(x=>!x.passed))result.failures_by_check[check.name]=(result.failures_by_check[check.name]||0)+1;
  reports.push(result);save('report-'+course_id+'.json',result);
  await factory.routes('/api/teacher/evaluation-datasets/'+d.id+'/freeze','POST',new URL('http://localhost'),{},users.teacher);
  console.log(JSON.stringify({event:'finished',course_id,counts:result.metrics}));
 }
 const after=Object.fromEntries(Object.keys(before).map(t=>[t,app.store.db.prepare('SELECT COUNT(*) n FROM '+t).get().n]));
 save('summary.json',{status:'completed',version:'0.1.1',mode,reports,state_isolation:{before,after,unchanged:fingerprint(before)===fingerprint(after)},teacher_accuracy:null,learning_gain:null,original_matrix_modified:false});
}catch(e){save('interrupted.json',{status:'interrupted',reason:e.message,automatic_paid_replay:false});process.exitCode=1;}
finally{
 const ds=factory.db.prepare('SELECT id FROM benchmark_datasets').all(),cases=ds.flatMap(d=>factory.cases(d.id)),runs=ds.flatMap(d=>factory.runs(d.id));
 const jsonl=(n,v)=>writeFileSync(path.join(target,n),v.map(x=>JSON.stringify(x)).join('\n')+'\n');
 jsonl('candidates.evaluator-private.jsonl',cases);jsonl('runs.evaluator-private.jsonl',runs);jsonl('inputs.public.jsonl',cases.map(c=>({id:c.id,course_id:c.course_id,family_id:c.family_id,public:c.public})));
 let requests=[];if(existsSync(app.harness.budgetPath)){const ledger=new DatabaseSync(app.harness.budgetPath,{readOnly:true});try{requests=ledger.prepare('SELECT charged,status,usage FROM requests').all();}finally{ledger.close();}}
 save('usage.json',{requests:requests.length,completed:requests.filter(r=>r.status==='completed').length,estimated_cny:requests.reduce((n,r)=>n+r.charged,0),estimated_not_invoice:true,old_matrix_cost_not_included:true});
 old?.close();await app.close();
}
