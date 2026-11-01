import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {ROOT} from '../src/data.mjs';
import {ModelBudget} from '../src/longcat-client.mjs';
const file=path.resolve(ROOT,'../output/pilot-v0.5/reports/longcat-validation.json'),previous=JSON.parse(readFileSync(file,'utf8'));
if(previous.status!=='completed_with_contract_failures'||previous.scenarios.filter(s=>!s.contract_passed).length!==1)throw new Error('Expected exactly one inspected quote-length contract failure');
if(!process.env.LONGCAT_API_KEY)throw new Error('Missing process key');
const filename=path.join(ROOT,'var/longcat-budget.sqlite'),ledger=new ModelBudget(filename),initial=ledger.summary();ledger.close();if(initial.requests+3>50)throw new Error('Insufficient remaining request budget');
writeFileSync(path.join(path.dirname(file),'longcat-pre-quote-fix.json'),JSON.stringify(previous,null,2));
process.env.TUTOR_ENABLE_REAL_MODEL='1';process.env.TUTOR_PROVIDER='longcat';process.env.TUTOR_MODEL_ID='LongCat-2.0';
const {createApp}=await import('../src/server.mjs');const app=await createApp({port:0,varDir:path.join(ROOT,'var/longcat-v05-validation'),defaultEngine:'local'});
try{
 const login=await fetch(app.origin+'/api/demo-login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({role:'teacher'})}),cookie=login.headers.get('set-cookie').split(';')[0];
 const response=await fetch(app.origin+'/api/teacher/preview/ask',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({course_id:'ai_literacy_pilot',query:'训练与推理有什么区别？',engine:'harness'})}),result=await response.json();
 if(!response.ok)throw new Error(result.error);
 const target=previous.scenarios.find(s=>!s.contract_passed);target.previous_failure='Model copied quotes longer than 240 characters; server correctly rejected the output';target.result=result;target.contract_passed=Boolean(!result.model_output_error&&result.model_evidence_quotes?.length);target.manual_recheck=true;
 previous.status=previous.scenarios.every(s=>s.contract_passed)?'real_calls_completed_pending_human_review':'completed_with_contract_failures';previous.manual_recheck_reason='Inspected quote-length failure; added schema length/item bounds; single explicit recheck, no automatic retry';
}catch(e){previous.status='stopped_on_recheck_failure';previous.reason=e.message;}
finally{await app.close();const budget=new ModelBudget(filename);previous.budget=budget.summary();budget.close();previous.manual_recheck_requests=previous.budget.requests-initial.requests;previous.cumulative_revision_requests=previous.budget.requests-previous.original_revision_start_requests;previous.completed_at=new Date().toISOString();writeFileSync(file,JSON.stringify(previous,null,2));console.log(JSON.stringify({status:previous.status,passed:previous.scenarios.filter(s=>s.contract_passed).length,cumulative:previous.budget.requests,recheck_requests:previous.manual_recheck_requests}));}
