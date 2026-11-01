import test from 'node:test';
import assert from 'node:assert/strict';
import {createPilotFixture,FIXTURE_PASSWORD} from '../scripts/pilot08-fixture.mjs';
process.env.TUTOR_ENABLE_REAL_MODEL='0';
test('teacher-owned draft without license, admin-only approval, stale checks, rejection and ownership isolation',async()=>{
 const {app,users}=await createPilotFixture();
 const client=async u=>{const r=await fetch(app.origin+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:u.username,password:FIXTURE_PASSWORD})}),cookie=r.headers.get('set-cookie').split(';')[0];return async(path,b)=>{const r=await fetch(app.origin+path,{method:b===undefined?'GET':'POST',headers:{cookie,'content-type':'application/json'},body:b===undefined?undefined:JSON.stringify(b)});return {status:r.status,data:await r.json()};};};
 try{const t=await client(users.teacher),a=await client(users.admin),s=await client(users.student),other=app.pilot.identity.addUser({username:'teacher_other',name:'合成教师2',password:FIXTURE_PASSWORD,role:'teacher'}),o=await client(other),id='teacher_draft';
 const row={course_id:id,title:'合成体验课',department:'初始院系',teacher:'合成教师',template_id:'objective',topics:[{id:'lists',title:'共享列表',objective:'判断赋值',summary:'赋值不复制列表',source:{url:'https://docs.python.org/3.13/tutorial/introduction.html#lists',text:'赋值不复制列表'},question:{prompt:'a=[1];b=a;b.append(2);print(a)',answer:'[1, 2]',required_points:['赋值不复制列表']}}]};
 assert.equal((await t('/api/teacher/courses',row)).status,200);assert.ok((await t('/api/courses')).data.some(c=>c.id===id));assert.ok(!(await o('/api/courses')).data.some(c=>c.id===id));assert.equal((await s('/api/teacher/courses',{...row,course_id:'student_draft'})).status,403);
 assert.equal((await t('/api/teacher/courses/'+id+'/publish',{notes:'TEST FIXTURE'})).status,409);
 const mat=await app.materials.upload({course_id:id,filename:'synthetic.txt',source_url:row.topics[0].source.url,content_base64:Buffer.from('仅用于隔离测试的自建材料。变量赋值不会复制列表，两个变量引用同一个列表对象，通过任一变量追加元素都会改变这个列表。').toString('base64')},users.teacher);assert.equal(mat.license,'');app.materials.review(mat.id,{status:'approved',notes:'SYNTHETIC FIXTURE ONLY'},users.teacher);
 const item=[...app.data.items.values()].find(i=>i.course_id===id);app.workbench.review(item.id,{expected_digest:app.workbench.item(item.id).digest,status:'approved',notes:'SYNTHETIC FIXTURE ONLY'},users.teacher);
 const requested=await t('/api/teacher/courses/'+id+'/publish',{notes:'TEST REQUEST'});assert.equal(requested.status,200);assert.equal(requested.data.status,'pending');assert.equal(app.data.courses.get(id).onboarding_status,'draft');
 assert.equal((await t('/api/teacher/onboarding/'+id+'/publish',{notes:'TEST REQUEST'})).data.id,requested.data.id);assert.throws(()=>app.onboarding.publish(id,'bypass',users.teacher),/权限/);
 const review='/api/admin/course-release-requests/'+requested.data.id+'/review',decision={status:'approved',expected_digest:requested.data.digest,notes:'TEST APPROVAL'};
 assert.equal((await t(review,decision)).status,403);assert.equal((await o('/api/teacher/courses/'+id+'/publish',{notes:'x'})).status,403);
 app.store.db.prepare('UPDATE materials SET version=? WHERE id=?').run('changed-fixture',mat.id);assert.equal((await a(review,decision)).status,409);assert.equal(app.data.courses.get(id).onboarding_status,'draft');
 assert.equal((await a(review,{...decision,status:'rejected'})).data.status,'rejected');
 const again=(await t('/api/teacher/courses/'+id+'/publish',{notes:'REVISED TEST REQUEST'})).data;assert.notEqual(again.id,requested.data.id);assert.equal((await a('/api/admin/course-release-requests/'+again.id+'/review',{...decision,expected_digest:again.digest})).data.status,'approved');assert.equal(app.data.courses.get(id).onboarding_status,'published');assert.equal((await a('/api/admin/course-release-requests/'+again.id+'/review',{...decision,expected_digest:again.digest})).status,409);
 const own=(await a('/api/admin/course-ownership?course='+id)).data;assert.equal((await t('/api/admin/course-ownership',{course_id:id,department:'越权院系',teacher_ids:[other.id],expected_digest:own.digest})).status,403);assert.equal((await a('/api/admin/course-ownership',{course_id:id,department:'归属院系',teacher_ids:[other.id],expected_digest:own.digest})).status,200);assert.ok(!(await t('/api/courses')).data.some(c=>c.id===id));assert.ok((await o('/api/courses')).data.some(c=>c.id===id));
 const live=await fetch(app.origin+'/workspace/live.js').then(r=>r.text());assert.doesNotMatch(live,/input\('来源与许可'\)|input\('许可说明'\)|field\('来源与许可'/);assert.match(live,/提交发布申请/);assert.match(live,/批准发布/);
 }finally{await app.close();}
});
