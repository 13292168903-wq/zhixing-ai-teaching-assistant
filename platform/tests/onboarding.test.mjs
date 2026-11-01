import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import path from 'node:path';
import {createApp} from '../src/server.mjs';
import {ROOT} from '../src/data.mjs';
import {parseCourseCSV,BATCH_CSV} from '../public/onboarding-shared.mjs';

const dir=mkdtempSync(path.join(ROOT,'var/onboarding-test-'));
let app=await createApp({port:0,varDir:dir,defaultEngine:'local'});
after(async()=>app.close());
async function client(role){
 const r=await fetch(app.origin+'/api/demo-login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({role})});
 const cookie=r.headers.get('set-cookie').split(';')[0];
 return async(url,body)=>{const r=await fetch(app.origin+url,{method:body===undefined?'GET':'POST',headers:{cookie,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,value:await r.json()};};
}
const topic=()=>({id:'addition',title:'加法',objective:'解释加法结果',summary:'本测试夹具使用一加二等于三作为可核验题，不表示真实课程审核。',support:['相加'],
 source:{url:'https://example.org/test-fixture',text:'仅用于自动化测试的合成资料。',license:'Synthetic test fixture, not a teaching source'},
 question:{prompt:'计算 1+2，说明依据。',answer:'3',required_points:['相加'],numeric:{target:3,absolute_tolerance:0.01,relative_tolerance:0}}});
const row=(id,template='objective',full=true)=>({course_id:id,title:'测试课程 '+id,template_id:template,department:'合成测试院系',teacher:'合成测试教师',classes:['测试一班','测试二班'],topics:full?[topic()]:[]});
const create=async(req,r)=>{const result=await req('/api/teacher/onboarding/template',r);assert.equal(result.status,201,JSON.stringify(result.value));return result;};
async function publish(req,id){
 const {value:items}=await req('/api/teacher/items?course='+id);
 for(const item of items)assert.equal((await req('/api/teacher/review',{item_id:item.id,status:'approved',notes:'自动化状态夹具审核，非教师实测。'})).status,200);
 return req('/api/teacher/onboarding/'+id+'/publish',{notes:'自动化发布流程夹具，不代表真实教师教学审定。'});
}

test('CSV handles BOM, quoted commas, escaped quotes and rejects malformed rows',()=>{
 assert.equal(parseCourseCSV('\uFEFF'+BATCH_CSV)[0].classes.length,2);
 const csv='course_id,title,template_id,department,teacher\r\nquoted,"课程,与""引号""",concept,学院,教师\r\n';
 assert.equal(parseCourseCSV(csv)[0].title,'课程,与"引号"');
 assert.throws(()=>parseCourseCSV('course_id,title\na,b'),/表头/);
 assert.throws(()=>parseCourseCSV(BATCH_CSV+'bad,row\n'),/列数/);
 assert.throws(()=>parseCourseCSV(BATCH_CSV+'"open'),/未闭合/);
});
test('only teachers/admins onboard; only admins install plugins',async()=>{
 const student=await client('student'),teacher=await client('teacher');
 for(const [url,body]of [['/api/teacher/onboarding',undefined],['/api/teacher/onboarding/template',row('forbidden')],['/api/teacher/onboarding/preview',{rows:[row('forbidden')]}],['/api/admin/plugins/install',{plugin_id:'numeric_check'}]])assert.equal((await student(url,body)).status,403);
 assert.equal((await teacher('/api/admin/plugins/install',{plugin_id:'numeric_check'})).status,403);
});
test('template creates a scoped draft and hides it from student listings and tool calls',async()=>{
 const teacher=await client('teacher'),student=await client('student');await create(teacher,row('template_draft'));
 assert.equal((await student('/api/courses')).value.some(c=>c.id==='template_draft'),false);
 assert.equal((await student('/api/practice',{course_id:'template_draft',engine:'local'})).status,403);
 assert.equal((await student('/api/ask',{course_id:'template_draft',query:'加法',engine:'local'})).status,403);
 assert.equal((await student('/api/state?course=template_draft')).status,403);
 assert.equal((await teacher('/api/teacher/onboarding/template',row('template_draft'))).status,400);
 assert.equal((await teacher('/api/teacher/onboarding/'+ 'template_draft'+'/pack')).value.items[0].assessment_mode,'exact');
});
test('batch preflight reports all rows and writes nothing on errors or stale digest',async()=>{
 const teacher=await client('teacher');const rows=[row('batch_ok'),row('batch_bad')];rows[1].title='';
 const preview=await teacher('/api/teacher/onboarding/preview',{rows});assert.equal(preview.value.valid,false);assert.equal(preview.value.rows.length,2);
 assert.equal((await teacher('/api/teacher/onboarding/batch',{rows,digest:preview.value.digest})).status,400);assert.equal(app.data.courses.has('batch_ok'),false);
 const fixed=[row('batch_ok')],p=await teacher('/api/teacher/onboarding/preview',{rows:fixed});fixed[0].title='changed';
 assert.equal((await teacher('/api/teacher/onboarding/batch',{rows:fixed,digest:p.value.digest})).status,409);assert.equal(app.data.courses.has('batch_ok'),false);
});
test('batch transaction rolls back DB, audit and memory if storage fails midway',async()=>{
 const teacher=await client('teacher'),rows=[row('atomic_first'),row('atomic_second')],p=await teacher('/api/teacher/onboarding/preview',{rows});
 app.store.db.exec("CREATE TRIGGER reject_fixture BEFORE INSERT ON course_catalog WHEN NEW.course_id='atomic_second' BEGIN SELECT RAISE(ABORT,'synthetic storage failure'); END");
 try{assert.equal((await teacher('/api/teacher/onboarding/batch',{rows,digest:p.value.digest})).status,500);
  assert.equal(app.data.courses.has('atomic_first'),false);assert.equal(app.store.db.prepare("SELECT COUNT(*) n FROM course_catalog WHERE course_id LIKE 'atomic_%'").get().n,0);
 }finally{app.store.db.exec('DROP TRIGGER reject_fixture');}
});
test('bulk creates course spaces, teaching classes and allows template completion',async()=>{
 const teacher=await client('teacher'),rows=parseCourseCSV(BATCH_CSV),preview=await teacher('/api/teacher/onboarding/preview',{rows});assert.equal(preview.value.valid,true);
 const result=await teacher('/api/teacher/onboarding/batch',{rows,digest:preview.value.digest});assert.equal(result.status,201);assert.equal(result.value.total,2);
 const duplicate=row('duplicate_classes');duplicate.classes=['同一班',' 同一班 '];assert.equal((await teacher('/api/teacher/onboarding/template',duplicate)).status,400);
 const spaces=(await teacher('/api/teacher/onboarding')).value.courses;assert.equal(spaces.find(c=>c.course_id==='intro_computing').classes.length,2);
 assert.equal((await teacher('/api/teacher/onboarding/intro_computing/publish',{notes:'test'})).status,409);
 const filled=row('intro_computing','concept');assert.equal((await teacher('/api/teacher/onboarding/intro_computing/template',filled)).status,200);
 assert.equal(app.data.items.get('L-intro_computing-addition-001').assessment_mode,'open');
});
test('publishing requires approved exercises and freezes content after release',async()=>{
 const teacher=await client('teacher'),student=await client('student');
 assert.equal((await teacher('/api/teacher/onboarding/template_draft/publish',{notes:'test'})).status,409);
 assert.equal((await publish(teacher,'template_draft')).status,200);
 assert.equal((await student('/api/courses')).value.some(c=>c.id==='template_draft'),true);
 const exercise=(await student('/api/practice',{course_id:'template_draft',engine:'local'})).value.items[0];
 assert.equal(exercise.reference,undefined);assert.equal(exercise.assessment,undefined);
 assert.equal((await teacher('/api/teacher/onboarding/template_draft/template',row('template_draft'))).status,409);
 assert.equal((await teacher('/api/teacher/onboarding/template_draft/plugins',{capabilities:['retrieve_evidence']})).status,409);
});
test('replacing draft content invalidates old reviews and rejects course id mismatches',async()=>{
 const teacher=await client('teacher');await create(teacher,row('replace_draft'));
 const pack=(await teacher('/api/teacher/onboarding/replace_draft/pack')).value;
 await teacher('/api/teacher/review',{item_id:pack.items[0].id,status:'approved',notes:'fixture'});
 pack.items[0].reference.answer='4';assert.equal((await teacher('/api/teacher/onboarding/replace_draft/content',pack)).status,200);
 assert.equal((await teacher('/api/teacher/onboarding/replace_draft/publish',{notes:'test'})).status,409);
 pack.manifest.course_id='different_id';assert.equal((await teacher('/api/teacher/onboarding/replace_draft/content',pack)).status,400);
});
test('numeric templates require installed dependency; arbitrary handler code is rejected',async()=>{
 const teacher=await client('teacher'),admin=await client('admin');
 assert.equal((await teacher('/api/teacher/onboarding/template',row('numeric_before','numeric'))).status,400);
 assert.equal((await admin('/api/admin/plugins/install',{descriptor:{id:'unsafe_code',version:'1.0.0',label:'Unsafe',handler:'eval',code:'process.exit()'}})).status,400);
 assert.equal((await admin('/api/admin/plugins/install',{plugin_id:'numeric_check'})).status,201);
 assert.equal((await admin('/api/admin/plugins/install',{plugin_id:'numeric_check'})).status,409);
 const invalid=row('invalid_numeric','numeric');invalid.topics[0].question.numeric.absolute_tolerance=-1;assert.equal((await teacher('/api/teacher/onboarding/template',invalid)).status,400);
});
test('one numeric plugin serves two courses, retains hint dependence and isolates learning state',async()=>{
 const teacher=await client('teacher'),student=await client('student');
 for(const id of ['numeric_stats','numeric_physics']){await create(teacher,row(id,'numeric'));assert.equal((await publish(teacher,id)).status,200);}
 const p=(await student('/api/practice',{course_id:'numeric_stats',engine:'local'})).value.items[0];assert.equal(p.assessment,undefined);
 const result=await student('/api/submit',{assignment_id:p.assignment_id,event_id:'numeric-event-001',answer:'3.005',explanation:'把数值相加。',expected_version:0,engine:'local'});
 assert.equal(result.value.correct,true);assert.equal(result.value.assessment_method,'numeric_tolerance');assert.equal(result.value.independent_evidence,true);
 assert.equal((await student('/api/state?course=numeric_physics')).value.length,0);
 const p2=(await student('/api/practice',{course_id:'numeric_physics',engine:'local'})).value.items[0];await student('/api/hint',{assignment_id:p2.assignment_id});
 const hinted=await student('/api/submit',{assignment_id:p2.assignment_id,event_id:'numeric-event-002',answer:'3',explanation:'相加。',expected_version:0,engine:'local'});
 assert.equal(hinted.value.correct,true);assert.equal(hinted.value.independent_evidence,false);
 const handler=app.registry.assessments.get('numeric_check');assert.equal(handler.assess('3+0',{target:3}).correct,false);assert.equal(handler.assess('Infinity',{target:3}).correct,false);assert.equal(handler.assess('3.2',{target:3,absolute_tolerance:0.01}).correct,false);
});
test('custom declarative extension binds to a course and its handler is used for grading',async()=>{
 const admin=await client('admin'),teacher=await client('teacher'),student=await client('student');
 assert.equal((await admin('/api/admin/plugins/install',{descriptor:{id:'lab_numeric',version:'1.0.0',label:'实验数值',handler:'numeric_tolerance'}})).status,201);
 await create(teacher,row('custom_assessment'));
 assert.equal((await teacher('/api/teacher/onboarding/custom_assessment/plugins',{capabilities:['missing']})).status,400);
 assert.equal((await teacher('/api/teacher/onboarding/custom_assessment/plugins',{capabilities:['lab_numeric']})).status,200);
 const pack=(await teacher('/api/teacher/onboarding/custom_assessment/pack')).value;pack.items[0].assessment_mode='plugin';pack.items[0].assessment={capability:'lab_numeric',config:{target:3}};
 assert.equal((await teacher('/api/teacher/onboarding/custom_assessment/content',pack)).status,200);assert.equal((await publish(teacher,'custom_assessment')).status,200);
 const item=(await student('/api/practice',{course_id:'custom_assessment',engine:'local'})).value.items[0];
 const graded=await student('/api/submit',{assignment_id:item.assignment_id,event_id:'custom-plugin-event01',answer:'3e0',explanation:'相加',expected_version:0,engine:'local'});assert.equal(graded.value.correct,true);
});
test('course packs, batch metadata, publication and plugins survive full server restart',async()=>{
 await app.close();app=await createApp({port:0,varDir:dir,defaultEngine:'local'});
 const teacher=await client('teacher'),student=await client('student');
 const catalog=(await teacher('/api/teacher/onboarding')).value;
 assert.equal(catalog.courses.find(c=>c.course_id==='numeric_stats').status,'published');assert.equal(catalog.courses.find(c=>c.course_id==='intro_computing').classes.length,2);
 assert.ok(catalog.plugins.some(p=>p.id==='lab_numeric'));assert.equal(app.data.courses.get('numeric_physics').onboarding_status,'published');
 assert.equal((await student('/api/state?course=numeric_stats')).value[0].independent_correct,1);
 assert.equal((await student('/api/courses')).value.some(c=>c.id==='replace_draft'),false);
});
