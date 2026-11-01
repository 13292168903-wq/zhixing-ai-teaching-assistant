import assert from 'node:assert/strict';
import path from 'node:path';
import {startWorkspace} from './serve-workspace.mjs';
import {ROOT,availableHarness} from '../src/data.mjs';
assert.equal(availableHarness(),path.join(ROOT,'runtime/dsh'));
process.env.TUTOR_ENABLE_REAL_MODEL='0';
const app=await startWorkspace({port:0,varDir:path.join(ROOT,'var/workspace-portable-check')});
try{
 assert.equal(app.store.db.prepare('SELECT COUNT(*) n FROM pilot_users').get().n,0);
 const status=await fetch(app.origin+'/api/auth/status').then(r=>r.json());
 assert.equal(status.initialized,false);
 const html=await fetch(app.origin+'/').then(r=>r.text());
 assert.match(html,/workspace\/live.js/);assert.doesNotMatch(html,/features.js|app.js/);
 for(const file of ['/workspace/live.js','/workspace/live.css','/workspace/styles.css','/workspace/features.css','/onboarding.js','/plugin-lab.js','/platform-guide.js','/chat-stream.mjs','/classic'])assert.equal((await fetch(app.origin+file)).status,200,file);
 assert.equal((await fetch(app.origin+'/api/courses')).status,401);
 assert.equal(app.data.courses.has('python_pilot'),true);
 const guide=await fetch(app.origin+'/api/guide/ask',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:'怎么登录'})}).then(r=>r.json());
 assert.equal(guide.runtime.real_model_calls,0);
 console.log(JSON.stringify({passed:true,connected_layout_A:true,first_admin_uninitialized:true,old_database_used:false,real_model_calls:0,seed_courses:['python_pilot','ai_literacy_pilot','statistics_pilot','programming_pilot'].every(id=>app.data.courses.has(id))}));
}finally{await app.close();}
