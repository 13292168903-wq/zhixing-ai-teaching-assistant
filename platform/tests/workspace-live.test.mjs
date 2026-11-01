import test from 'node:test';
import assert from 'node:assert/strict';
import {createPilotFixture,FIXTURE_PASSWORD} from '../scripts/pilot08-fixture.mjs';
process.env.TUTOR_ENABLE_REAL_MODEL='0';
test('layout A serves connected assets without demo state and keeps classic UI available',async()=>{
 const {app}=await createPilotFixture();try{
 const root=await fetch(app.origin+'/');assert.equal(root.status,200);const html=await root.text();assert.match(html,/workspace\/live.js/);assert.doesNotMatch(html,/features.js|app.js/);
 for(const path of ['/workspace/live.js','/workspace/live.css','/workspace/styles.css','/workspace/features.css','/chat-stream.mjs','/onboarding.js','/plugin-lab.js','/platform-guide.js','/classic']){const r=await fetch(app.origin+path);assert.equal(r.status,200,path);assert.equal(r.headers.get('x-content-type-options'),'nosniff');}
 assert.equal((await fetch(app.origin+'/workspace/../../package.json')).status,404);
 const live=await (await fetch(app.origin+'/workspace/live.js')).text();assert.doesNotMatch(live,/localStorage|demo-login/);assert.match(live,/expected_digest/);assert.match(live,/content_base64/);
 }finally{await app.close();}
});
test('invitation list persists revocation metadata and never discloses token/hash or other teachers invitations',async()=>{
 const {app,users,cls}=await createPilotFixture();const client=async name=>{const login=await fetch(app.origin+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'fixture-'+name,password:FIXTURE_PASSWORD})});const cookie=login.headers.get('set-cookie').split(';')[0];return async(path,body)=>{const r=await fetch(app.origin+path,{method:body===undefined?'GET':'POST',headers:{cookie,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};};};
 try{const teacher=await client('teacher'),student=await client('student');const invite=(await teacher('/api/auth/invites',{role:'student',class_id:cls.id})).data;let rows=(await teacher('/api/auth/invites')).data;assert.equal(rows.length,1);assert.equal(rows[0].id,invite.id);assert.equal(rows[0].revoked,0);assert.ok(!JSON.stringify(rows).includes(invite.token));assert.equal(rows[0].token_hash,undefined);assert.equal((await student('/api/auth/invites')).status,403);
 const other=app.pilot.identity.addUser({username:'fixture-other',password:FIXTURE_PASSWORD,name:'合成教师',role:'teacher'});app.store.db.prepare('INSERT INTO pilot_teachers VALUES(?,?)').run('python_pilot',other.id);const otherClient=await client('other');assert.deepEqual((await otherClient('/api/auth/invites')).data,[]);await teacher('/api/auth/invites/'+invite.id+'/revoke',{});rows=(await teacher('/api/auth/invites')).data;assert.equal(rows[0].revoked,1);
 }finally{await app.close();}
});
