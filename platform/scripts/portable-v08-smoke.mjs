import assert from 'node:assert/strict';
import path from 'node:path';
import {createApp} from '../src/server.mjs';
import {ROOT,availableHarness} from '../src/data.mjs';
import {bootstrapV08} from './bootstrap-v08.mjs';
assert.equal(availableHarness(),path.join(ROOT,'runtime/dsh'));
const app=await createApp({mode:'pilot',port:0,varDir:path.join(ROOT,'var/portable-smoke'),defaultEngine:'harness'});
try{
 const imported=await bootstrapV08(app,{legacyDir:path.join(ROOT,'var/no-legacy-database')});
 assert.equal(app.store.db.prepare('SELECT COUNT(*) n FROM pilot_users').get().n,0);
 assert.ok([...app.data.courses.values()].filter(c=>c.course_id.endsWith('_pilot')).every(c=>c.onboarding_status==='draft'));
 const result=await app.harness.invoke('retrieve_evidence',{course_id:'python_pilot'},()=>({citations:[],answer:'PORTABLE_FIXTURE_ONLY',response_kind:'evidence'}),app.origin+'/internal/tool');
 assert.equal(result.runtime.engine,'ds-h');assert.equal(result.runtime.real_model_calls,0);
 const auth=await fetch(app.origin+'/api/auth/status').then(r=>r.json());assert.equal(auth.initialized,false);
 console.log(JSON.stringify({passed:true,source_root:ROOT,runtime_relative:path.relative(ROOT,app.harness.root),old_database_used:false,real_model_calls:0,content:imported,first_admin_uninitialized:true}));
}finally{await app.close();}
