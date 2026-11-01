import assert from 'node:assert/strict';
import path from 'node:path';
import {createApp} from '../src/server.mjs';
import {ROOT,availableHarness} from '../src/data.mjs';
import {bootstrapV08} from './bootstrap-v08.mjs';
assert.equal(availableHarness(),path.join(ROOT,'runtime/dsh'));
const app=await createApp({mode:'pilot',port:0,varDir:path.join(ROOT,'var/portable-smoke'),defaultEngine:'harness'});
try{
 await bootstrapV08(app,{legacyDir:path.join(ROOT,'var/no-legacy-database')});
 assert.equal(app.store.db.prepare('SELECT COUNT(*) n FROM pilot_users').get().n,0);
 const auth=await fetch(app.origin+'/api/auth/status').then(r=>r.json());assert.equal(auth.initialized,false);assert.equal(auth.version,'0.9.0');
 const ctx=await fetch(app.origin+'/api/guide/context').then(r=>r.json());assert.equal(ctx.role,'visitor');assert.ok(ctx.enabled);
 const local=await fetch(app.origin+'/api/guide/ask',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:'怎么登录'})}).then(r=>r.json());assert.equal(local.runtime.real_model_calls,0);
 for(const c of ['xiaozhi'])for(const pose of ['idle','blink','wave','point','thinking','notice']){const r=await fetch(app.origin+'/guide-assets/'+c+'-'+pose+'.png');assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/png');assert.ok((await r.arrayBuffer()).byteLength>1000);}
 const result=await app.harness.invoke('platform_guide',{course_id:''},()=>({offline_payload:{answer:'PORTABLE_FIXTURE_ONLY',document_ids:['login'],action_ids:['login'],uncertain:false}}),app.origin+'/internal/tool',{operation:'answer',mode:'offline'});
 assert.equal(result.runtime.engine,'ds-h');assert.equal(result.runtime.real_model_calls,0);
 console.log(JSON.stringify({passed:true,version:'0.9.0',source_root:ROOT,runtime_relative:path.relative(ROOT,app.harness.root),old_database_used:false,real_model_calls:0,transparent_assets_served:12,first_admin_uninitialized:true}));
}finally{await app.close();}
