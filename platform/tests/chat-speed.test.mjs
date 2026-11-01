import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import path from 'node:path';
import {createApp} from '../src/server.mjs';
import {ROOT} from '../src/data.mjs';
import {readLongCatStream} from '../src/longcat-client.mjs';
import {consumeChat,explanationPrefix} from '../public/chat-stream.mjs';
test('social fast path bypasses harness but still validates course and records conversation',async()=>{
 const app=await createApp({port:0,varDir:mkdtempSync(path.join(ROOT,'var/speed-social-'))});
 try{const login=await fetch(app.origin+'/api/demo-login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({role:'student'})}),cookie=login.headers.get('set-cookie').split(';')[0];
 app.harness.invoke=()=>{throw Error('Must not invoke model for greeting');};
 const ask=async course_id=>fetch(app.origin+'/api/ask/stream',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({course_id,query:'你好',engine:'harness',answer_mode:'tutor'})});
 const events=[],r=await consumeChat(await ask('python'),e=>events.push(e));assert.equal(r.runtime.real_model_calls,0);assert.equal(r.runtime.engine,'local_conversation');assert.equal(app.store.db.prepare('SELECT COUNT(*) n FROM chat').get().n,1);assert.equal(app.store.db.prepare('SELECT COUNT(*) n FROM states').get().n,0);assert.ok(events.some(e=>e.type==='result'));assert.equal((await ask('invalid_course')).status,404);
 }finally{await app.close();}
});
test('SSE decoding supports split UTF8, delta and completed usage; incomplete never succeeds',async()=>{
 const raw={status:'completed',output:[{type:'message',content:[{type:'output_text',text:'你好'}]}],usage:{input_tokens:10,output_tokens:2}},frames='data: '+JSON.stringify({type:'response.output_text.delta',delta:'你好'})+'\n\n'+'data: '+JSON.stringify({type:'response.completed',response:raw})+'\n\n',bytes=new TextEncoder().encode(frames);let delta='';
 const body=new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=7)c.enqueue(bytes.slice(i,i+7));c.close();}});assert.deepEqual(await readLongCatStream(new Response(body),s=>delta+=s),raw);assert.equal(delta,'你好');await assert.rejects(()=>readLongCatStream(new Response('data: {"type":"response.output_text.delta","delta":"partial"}\n\n')),/完成事件/);
});
test('unverified preview is plain text and incomplete JSON escapes are not leaked',()=>{assert.equal(explanationPrefix('{"model_explanation":"a\\n\\u4f60\\u59'),'a\n你');assert.equal(explanationPrefix('{"course_claims":[]}'),'');assert.equal(explanationPrefix('{"model_explanation":"<script>"}'),'<script>');});
test('stream client discards incomplete or rejected responses',async()=>{await assert.rejects(()=>consumeChat(new Response('{"type":"delta","text":"partial"}\n'),()=>{}),/未完成/);await assert.rejects(()=>consumeChat(new Response('{"type":"error","error":"rejected"}\n'),()=>{}),/rejected/);});
test('warm DS-H tree reuses process with new session and ticket per job',async()=>{
 process.env.TUTOR_ENABLE_REAL_MODEL='0';const app=await createApp({port:0,varDir:mkdtempSync(path.join(ROOT,'var/speed-worker-'))});
 try{let n=0;const invoke=()=>app.harness.invoke('retrieve_evidence',{query:'fixture'},async()=>({query:'fixture-'+(++n),citations:[],answer:'fixture'}),app.origin+'/internal/tool',{mode:'offline',warmWorker:true});
 const a=await invoke(),pid=app.harness.worker.child.pid,b=await invoke();assert.equal(app.harness.worker.child.pid,pid);assert.equal(a.runtime.worker_reused,false);assert.equal(b.runtime.worker_reused,true);assert.notEqual(a.runtime.session_id,b.runtime.session_id);assert.notEqual(a.runtime.run_id,b.runtime.run_id);assert.equal(n,2);assert.equal(b.query,'fixture-2');assert.equal(b.runtime.real_model_calls,0);
 }finally{await app.close();}
});
