import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync} from 'node:fs';
import {DatabaseSync,backup} from 'node:sqlite';
import {spawnSync,spawn} from 'node:child_process';
import {createServer} from 'node:net';
import path from 'node:path';
import {createPilotFixture} from '../scripts/pilot08-fixture.mjs';
import {reviseCandidate} from '../src/pilot08-review.mjs';
import {retentionPreview,retentionPurge} from '../src/pilot08-retention.mjs';
import {validateRubricCandidate} from '../src/pilot08-validation.mjs';
import {PilotModelQueue} from '../src/pilot08-queue.mjs';
import {Store,uid} from '../src/store.mjs';
import {ROOT} from '../src/data.mjs';
process.env.TUTOR_ENABLE_REAL_MODEL='0';
let f,app,p,user,teacher;
before(async()=>{f=await createPilotFixture();app=f.app;p=app.pilot;user=f.users.student;teacher=f.users.teacher;});
after(async()=>{await app?.close();});
test('explicit item selection overrides unrelated weak concept without changing course scope',()=>{
 const i=app.data.items.get('P08-lists-alias_write'),task=p.service.assign({actor:user,course_id:'python_pilot',item_id:i.id}).items[0];
 p.service.submit({actor:user,assignment_id:task.assignment_id,event_id:uid(),answer:i.reference.answer,explanation:'说不清'});
 const chosen=p.service.assign({actor:user,course_id:'python_pilot',item_id:'P08-range-exclusive_bound'});
 assert.equal(chosen.items[0].concept_id,'range');assert.throws(()=>p.service.assign({actor:user,course_id:'other',item_id:i.id}),/课程|授权/);
});
test('explanation advice rejects invented quotations and never mutates objective evidence',async()=>{
 const old=app.harness.invoke,item=app.data.items.get('P08-lists-alias_write'),before=JSON.stringify(app.store.states(user.id,'python_pilot'));
 app.harness.invoke=async()=>({model_payload:{matches:[{point_index:0,verdict:'supported',quote:'学生从未说过此句',reason:'invalid'}],summary:'invalid'}});
 try{await assert.rejects(p.explain(user,{answer:'[9,2]',explanation:'不清楚',event_id:uid()},{},item),/未说过/);assert.equal(JSON.stringify(app.store.states(user.id,'python_pilot')),before);}finally{app.harness.invoke=old;}
});
test('revised candidate loses approval, preserves previous version, and cannot evade program checking',()=>{
 const archived=readFileSync(path.resolve(ROOT,'../output/pilot-v0.7/datasets/generated-candidates.teacher.jsonl'),'utf8').trim().split('\n').map(JSON.parse),source=archived.find(c=>c.program);
 assert.ok(source);const c={...source,id:uid(),course_id:'python_pilot'},now=new Date().toISOString();app.store.db.prepare('INSERT INTO generated_candidates VALUES(?,?,?,?,?,?,?,?,?)').run(c.id,'fixture',0,c.course_id,c.fingerprint,JSON.stringify(c),JSON.stringify({status:'approved'}),null,now);
 assert.throws(()=>reviseCandidate(p,teacher,c.id,{expected_digest:c.fingerprint,program:null,notes:'TEST'}),/不能移除/);
 const revised=reviseCandidate(p,teacher,c.id,{expected_digest:c.fingerprint,prompt:c.prompt+'\n请注意边界。',notes:'TEST FIXTURE ONLY'});
 assert.equal(revised.review_status,'pending');assert.equal(revised.validation.status,'pending_sandbox');assert.equal(revised.revision_history[0].previous.prompt,c.prompt);assert.notEqual(revised.fingerprint,c.fingerprint);
});
test('rubric candidate without independent teacher labels cannot pass by self-evaluation',()=>{
 const item=app.data.items.get('P08-lists-alias_write'),r=validateRubricCandidate(p,{course_id:'python_pilot',item_id:item.id,reference:JSON.stringify(item.reference)});
 assert.equal(r.eligible,false);assert.equal(r.status,'pending_independent_labels');assert.equal(r.sealed_read,false);assert.equal(r.confirmed_cases,0);
});
test('legacy course intake is scoped and published revision starts without copied approvals',async()=>{
 const login=await fetch(app.origin+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:teacher.username,password:'fixture-only-password-2026'})}),cookie=login.headers.get('set-cookie').split(';')[0];
 const request=async(route,b)=>{const r=await fetch(app.origin+route,{method:b?'POST':'GET',headers:{cookie,'content-type':'application/json'},body:b?JSON.stringify(b):undefined});return {status:r.status,data:await r.json()};};
 const info=await request('/api/teacher/onboarding');assert.equal(info.status,200);assert.equal(info.data.courses.length,1);assert.equal((await request('/api/teacher/onboarding/no_such_course/pack')).status,404);
 const cloned=await request('/api/teacher/courses/python_pilot/clone',{version:'0.8-fixture-revision'});assert.equal(cloned.status,200,JSON.stringify(cloned.data));assert.equal(cloned.data.approvals_carried_forward,false);assert.equal(app.data.courses.get(cloned.data.course_id).onboarding_status,'draft');assert.equal(app.store.db.prepare('SELECT COUNT(*) n FROM review_attestations WHERE item_id LIKE ?').get(cloned.data.course_id+'-%').n,0);assert.throws(()=>app.pilot.identity.course(user,cloned.data.course_id),/未加入|未发布/);
 const d=await request('/api/teacher/diagnostic-labels?course=python_pilot');assert.equal(d.data.cases.length,60);assert.ok(d.data.cases.every(c=>!('candidate_label' in c)&&c.labels.length===0&&c.prompt));
});
test('restarted model queue interrupts paid work instead of automatically replaying it',async()=>{
 const store=new Store(':memory:'),id=uid(),h={invoke:async()=>{throw Error('must not execute');}};store.db.exec('CREATE TABLE pilot_model_tasks(id TEXT PRIMARY KEY,actor TEXT,course_id TEXT,tool TEXT,status TEXT,input TEXT,input_hash TEXT,run_id TEXT,result TEXT,error TEXT,created TEXT,updated TEXT)');
 store.db.prepare('INSERT INTO pilot_model_tasks VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,user.id,'python_pilot','verify_submission','running','{}','fixture','paid-run',null,null,'fixture','fixture');const q=new PilotModelQueue(store,h);assert.equal(q.get(id,user).status,'interrupted');assert.equal(q.waiting.length,0);await q.close();store.close();
});
test('restore refuses an active server and restores isolated data without login sessions',async()=>{
 const dir=mkdtempSync(path.join(ROOT,'var/v08-restore-test-')),id=uid();mkdirSync(path.join(dir,'backups'));const store=new Store(path.join(dir,'platform.sqlite'));store.set('restore_fixture','original');await backup(store.db,path.join(dir,'backups',id+'.sqlite'));store.set('restore_fixture','changed');store.close();
 const env={...process.env,TUTOR_V08_VAR:dir,PORT:new URL(app.origin).port},args=[path.join(ROOT,'scripts/pilot08-restore.mjs'),'--backup',id,'--stopped'];const blocked=await new Promise(resolve=>{const child=spawn(process.execPath,args,{env,windowsHide:true});let stderr='';child.stderr.on('data',b=>stderr+=b);child.on('close',status=>resolve({status,stderr}));});assert.notEqual(blocked.status,0);assert.match(blocked.stderr,/仍运行/);
 const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const freePort=probe.address().port;await new Promise(r=>probe.close(r));const restored=spawnSync(process.execPath,args,{env:{...env,PORT:String(freePort)},encoding:'utf8',windowsHide:true});assert.equal(restored.status,0,restored.stderr);const db=new DatabaseSync(path.join(dir,'platform.sqlite'));assert.equal(db.prepare("SELECT value FROM settings WHERE key='restore_fixture'").get().value,'original');assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions').get().n,0);db.close();
});
test('retention requires fresh preview, backs up raw records and removes linked advice',async()=>{
 const db=app.store.db,row=db.prepare('SELECT * FROM submissions WHERE user_id=? LIMIT 1').get(user.id);db.prepare('UPDATE submissions SET created=? WHERE id=?').run('2000-01-01',row.id);app.store.set('explanation_advice:'+row.id,'synthetic student quotation');
 const preview=retentionPreview(p,90);await assert.rejects(retentionPurge(p,f.users.admin,{days:90,expected_digest:'stale',confirm:'清理活动试点记录'}),/预览/);
 const result=await retentionPurge(p,f.users.admin,{days:90,expected_digest:preview.expected_digest,confirm:'清理活动试点记录'});assert.equal(result.cleaned,true);assert.ok(result.recovery_backup);assert.equal(db.prepare('SELECT id FROM submissions WHERE id=?').get(row.id),undefined);assert.equal(app.store.get('explanation_advice:'+row.id),undefined);
});
