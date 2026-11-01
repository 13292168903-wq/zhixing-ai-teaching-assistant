import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync,mkdirSync} from 'node:fs';
import {createApp} from '../src/server.mjs';
import {ROOT,loadData,importCourse} from '../src/data.mjs';
import {Store} from '../src/store.mjs';
import {TeachingService} from '../src/services.mjs';
import {Evaluator} from '../src/evaluation.mjs';
import {grade,retrieve} from '../src/pedagogy.mjs';
const dir=path.join(ROOT,'var/test-'+Date.now());mkdirSync(dir,{recursive:true});
const app=await createApp({port:0,varDir:dir,dbPath:':memory:',defaultEngine:'local'});
after(async()=>app.close());
async function client(role){
 const response=await fetch(app.origin+'/api/demo-login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({role})});
 const cookie=response.headers.get('set-cookie').split(';')[0];
 return async(url,body,headers={})=>{const r=await fetch(app.origin+url,{method:body===undefined?'GET':'POST',headers:{cookie,...(body===undefined?{}:{'content-type':'application/json'}),...headers},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,value:await r.json()};};
}
test('student completes objective feedback, idempotency and stale-state rejection',async()=>{
 const request=await client('student');const {value:p}=await request('/api/practice',{course_id:'python',concept_id:'lists',count:1});const item=p.items[0];
 const data={assignment_id:item.assignment_id,event_id:'test-submit-event1',answer:'[2, 9]',explanation:'同一列表对象的原地修改会通过其他引用观察到。',expected_version:0,engine:'local'};
 const first=await request('/api/submit',data);assert.equal(first.status,200);assert.equal(first.value.correct,true);assert.equal(first.value.state.version,1);
 const duplicate=await request('/api/submit',data);assert.equal(duplicate.value.state.version,1);
 const changed=await request('/api/submit',{...data,answer:'different'});assert.equal(changed.status,409);
 const stale=await request('/api/submit',{...data,event_id:'test-submit-event2'});assert.equal(stale.status,409);
});
test('correct output with contradictory explanation is not marked supported',()=>{
 const item=app.data.items.get('L-python-002');const result=grade(app.data,item,{answer:item.reference.answer,explanation:'切片总是和原列表共享同一个对象。'});
 assert.equal(result.correct,true);assert.equal(result.next_action,'probe_contradiction');assert.equal(result.state_status,'needs_review');
});
test('full-solution use never counts as independent evidence',()=>{
 const item=app.data.items.get('L-python-001');const r=grade(app.data,item,{answer:item.reference.answer,explanation:'这是同一列表对象的原地修改。'},undefined,{count:1,full:true});
 assert.equal(r.independent_evidence,false);assert.equal(r.next_action,'assign_transfer');
});
test('course evidence is scoped and unsupported questions retain uncertainty',()=>{
 assert.equal(retrieve(app.data,'python','请告诉我期末考试时间').citations.length,0);
 const r=retrieve(app.data,'ai_literacy','模型训练和推理');assert.ok(r.citations.length>0);assert.ok(r.citations.every(c=>c.url.includes('developers.google.com')));
});
test('student cannot access review, evaluation, release or holdout routes',async()=>{
 const req=await client('student');for(const [url,body]of [['/api/teacher/items?course=python',undefined],['/api/overview',undefined],['/api/evaluations',{partition:'test',frozen:true}],['/api/candidates',{}]])assert.equal((await req(url,body)).status,403);
 const r=await fetch(app.origin+'/../output/bootstrap-v0.1/evaluator_private/holdout/references.jsonl');assert.equal(r.status,404);
});
test('CSRF origin is rejected before a state mutation',async()=>{
 const req=await client('student');const r=await req('/api/practice',{course_id:'python'},{origin:'https://untrusted.invalid'});assert.equal(r.status,403);
});
test('assignment cannot be used by a different learner',()=>{
 const service=new TeachingService(app.data,app.store),a={id:'learner-a'},b={id:'learner-b'};
 const assignment=service.assign({actor:a,course_id:'python',count:1}).items[0];assert.throws(()=>service.assignment(b,assignment.assignment_id),/不属于/);
});
test('hint counter is server-owned and answer requires a prior attempt',async()=>{
 const req=await client('student');const {value:p}=await req('/api/practice',{course_id:'ai_literacy',count:1});const id=p.items[0].assignment_id;
 assert.equal((await req('/api/hint',{assignment_id:id,full:true})).status,409);
 assert.equal((await req('/api/hint',{assignment_id:id})).value.count,1);
 const r=await req('/api/submit',{assignment_id:id,event_id:'ai-event-test01',answer:'推理使用固定参数，训练会更新参数。',explanation:'需要检查是否更新参数，不能仅凭输出断言训练。',expected_version:0,engine:'local',hints_used:0});
 assert.equal(r.value.hints_used,1);assert.equal(r.value.score,null);
});
test('teacher review rejects a question from future assignments',async()=>{
 const req=await client('teacher');const r=await req('/api/teacher/review',{item_id:'L-python-025',status:'rejected',notes:'自动化验收中的审核记录，非正式教学审定。'});assert.equal(r.status,200);
 const service=new TeachingService(app.data,app.store);for(let i=0;i<5;i++)assert.ok(service.assign({actor:{id:'review-test-'+i},course_id:'python',concept_id:'returns',count:5}).items.every(x=>x.id!=='L-python-025'));
});
test('legacy course upload joins the reviewed onboarding flow and uses the same kernel',async()=>{
 const teacher=await client('teacher'),pack=JSON.parse(readFileSync(path.join(ROOT,'examples/course-pack.json'),'utf8'));
 assert.equal((await teacher('/api/teacher/import',pack)).status,201);
 const req=await client('student');assert.equal((await req('/api/practice',{course_id:'evidence_basics',count:1})).status,403);
 await teacher('/api/teacher/review',{item_id:pack.items[0].id,status:'approved',notes:'自动化流程夹具，非正式教师审定。'});
 assert.equal((await teacher('/api/teacher/onboarding/evidence_basics/publish',{notes:'自动化发布状态夹具。'})).status,200);
 const {value:p}=await req('/api/practice',{course_id:'evidence_basics',count:1});assert.equal(p.items[0].course_id,'evidence_basics');
 const r=await req('/api/ask',{course_id:'evidence_basics',query:'如何核验原文证据？',engine:'local'});assert.equal(r.value.citations[0].id,'evidence-basics-1');
 assert.ok(app.store.db.prepare('SELECT pack FROM course_catalog WHERE course_id=?').get('evidence_basics').pack.includes('source_support'));
});
test('invalid imported dependency is rejected without installing code',()=>{
 const pack=JSON.parse(readFileSync(path.join(ROOT,'examples/course-pack.json'),'utf8'));pack.manifest.course_id='unsupported';pack.manifest.required_capabilities=['run_arbitrary_code'];
 assert.throws(()=>importCourse(app.data,pack),/尚未安装/);
});
test('evaluation uses dev and independent validation, rejects a non-improving candidate',()=>{
 const store=new Store(':memory:'),e=new Evaluator(loadData(),store),actor={id:'unit-teacher'};
 const run=e.run({partition:'dev',version:'v1-baseline'});assert.equal(run.total,60);assert.equal(run.real_model_calls,0);
 const c=e.propose(actor);assert.throws(()=>e.publish(c.id,actor),/仅独立验证/);
 const v=e.validate(c.id,actor);assert.equal(v.baseline.total,30);assert.equal(v.candidate.total,30);
 if(!v.passed)assert.throws(()=>e.publish(c.id,actor),/仅独立验证/);
 assert.throws(()=>e.run({partition:'test',version:'v1-baseline'}),/显式确认/);store.close();
});
test('publication and rollback are atomic and withdraw corresponding experience (state fixture)',()=>{
 const store=new Store(':memory:'),e=new Evaluator(loadData(),store),actor={id:'unit-teacher'},c=e.propose(actor);
 // Explicit state fixture tests the gate's happy path; NOT reported as empirical validation.
 store.db.prepare('UPDATE candidates SET validation=?,status=? WHERE id=?').run(JSON.stringify({candidate:{id:'fixture-validation-only'},new_regressions:[],passed:true}),'validated',c.id);
 const published=e.publish(c.id,actor);assert.equal(store.get('published_version'),published.version);
 assert.equal(store.db.prepare('SELECT status FROM experiences').get().status,'verified_enabled');
 e.rollback(actor);assert.equal(store.get('published_version'),'v1-baseline');assert.equal(store.db.prepare('SELECT status FROM experiences').get().status,'withdrawn');store.close();
});
test('adaptive variants are limited to dev and explicitly not independent families',()=>{
 const store=new Store(':memory:'),e=new Evaluator(loadData(),store),r=e.adaptive({id:'unit-teacher'});
 assert.equal(r.new_independent_families,0);assert.equal(r.report.partition,'dev');assert.ok(r.variants.every(x=>x.provenance.new_independent_family===false));store.close();
});
test('no heldout answers appear in student question responses',async()=>{
 const req=await client('student');const r=await req('/api/practice',{course_id:'python',count:3});for(const item of r.value.items){assert.equal(item.reference,undefined);assert.equal(item.expected_stdout,undefined);assert.equal(item.checks,undefined);}
});
test('finalization is cached and closes optimization (synthetic evaluator fixture)',()=>{
 const store=new Store(':memory:'),e=new Evaluator(loadData(),store),dev=e.cases('dev');
 // Do not open the actual holdout in development tests.
 e.cases=()=>dev.slice(0,2);const first=e.run({partition:'test',version:'v1-baseline',frozen:true});
 assert.equal(first.results,undefined);assert.equal(e.run({partition:'test',version:'v1-baseline',frozen:true}).cached,true);
 assert.throws(()=>e.propose({id:'unit-teacher'}),/优化阶段已关闭/);store.close();
});
test('SQLite learning evidence persists across a process-store restart',()=>{
 const filename=path.join(dir,'persistence.sqlite'),s=new Store(filename),service=new TeachingService(loadData(),s),actor={id:'persistent-student'};
 const item=service.assign({actor,course_id:'python',concept_id:'lists'}).items[0];
 service.submit({actor,assignment_id:item.assignment_id,event_id:'persistent-event-01',answer:'[2, 9]',explanation:'同一列表的原地修改。',expected_version:0});s.close();
 const again=new Store(filename);assert.equal(again.state(actor.id,'python','lists').version,1);assert.equal(again.state(actor.id,'ai_literacy','train_infer').version,0);again.close();
});
test('an assigned task pins its published strategy version',()=>{
 const store=new Store(':memory:'),service=new TeachingService(loadData(),store),actor={id:'pinned-version-user'};
 const item=service.assign({actor,course_id:'python',concept_id:'lists'}).items[0];
 store.db.prepare('INSERT INTO releases VALUES(?,?,?,?,?,?)').run('v-test',JSON.stringify({check_explanation:true,require_transfer:true}),'published','v1-baseline','test-only',new Date().toISOString());store.set('published_version','v-test');
 const result=service.submit({actor,assignment_id:item.assignment_id,event_id:'pinned-event-0001',answer:'[2, 9]',explanation:'同一列表原地修改。',expected_version:0});
 assert.equal(result.policy_version,'v1-baseline');assert.equal(result.submitted_answer,'[2, 9]');store.close();
});
