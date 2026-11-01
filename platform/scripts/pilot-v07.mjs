import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {ROOT} from '../src/data.mjs';
import {createApp} from '../src/server.mjs';
import {setupV06} from '../src/v06.mjs';
import {ModelBudget} from '../src/longcat-client.mjs';
import {TRUSTED_PLUGINS,PERSONAS,STRATEGIES} from '../src/plugin-sdk.mjs';
import {buildSimulationFixtures} from '../src/student-simulator.mjs';
const out=path.resolve(ROOT,'../output/pilot-v0.7');for(const p of ['reports','datasets','course-packs','sdk'])mkdirSync(path.join(out,p),{recursive:true});
const actor={id:'v07-acceptance-runner-not-human-approval',role:'teacher',name:'v0.7 合成验收'},app=await createApp({port:Number(process.env.PORT||3810)}),lab=app.pluginLab;
const close=async()=>{delete process.env.LONGCAT_API_KEY;await app.close();process.exit(0);};process.on('SIGINT',close);process.on('SIGTERM',close);
console.log('v0.7 server listening: '+app.origin);
if(!app.store.get('v07_bootstrap')){await setupV06(app);for(const course of ['python_pilot','ai_literacy_pilot'])if(!app.data.courses.has(course))app.onboarding.importPack(JSON.parse(readFileSync(path.join(out,'../pilot-v0.6/course-packs',course+'.json'))),actor);lab.setup(actor);app.store.set('v07_bootstrap','0.7.0');}
const ledger=new ModelBudget(app.harness.budgetPath),boundary=app.store.db.prepare("SELECT MIN(created) stamp FROM plugin_jobs WHERE json_extract(input,'$.mode')='longcat'").get().stamp;
const before=app.store.get('v07_budget_before')?JSON.parse(app.store.get('v07_budget_before')):boundary?{...ledger.summary(),...ledger.db.prepare('SELECT COUNT(*) requests,COALESCE(SUM(charged),0) charged_cny,COALESCE(SUM(reserved),0) reserved_cny FROM requests WHERE created<?').get(boundary)}:ledger.summary();app.store.set('v07_budget_before',JSON.stringify(before));ledger.close();const jobs=[];
async function runJob(input){let j=lab.create({...input,idempotency_key:input.idempotency_key},actor);let previousAttempt=null;if(['failed','interrupted','cancelled'].includes(j.status)&&process.env.TUTOR_V07_RECOVER_SAVED_OUTPUTS==='1'){
 const unknown=app.store.db.prepare("SELECT 1 FROM plugin_job_steps WHERE job_id=? AND status IN ('started','uncertain')").get(j.id);previousAttempt={id:j.id,status:j.status,error:j.error};
 if(unknown){const previousId=j.id;input={...input,idempotency_key:input.idempotency_key+'-repair1'};j=lab.create(input,actor);for(const step of app.store.db.prepare("SELECT * FROM plugin_job_steps WHERE job_id=? AND status='completed'").all(previousId))app.store.db.prepare('INSERT OR IGNORE INTO plugin_job_steps VALUES(?,?,?,?,?)').run(j.id,step.step,step.status,step.result,step.updated);app.store.audit(actor.id,'acceptance_explicit_repair_task',{previous_id:previousId,replacement_id:j.id,completed_model_outputs_reused:true});}else j=lab.jobs.resume(j.id,actor);
 }
 const limit=Date.now()+12*60*1000;while(Date.now()<limit){const r=lab.jobs.get(j.id);if(!['queued','running'].includes(r.status)){jobs.push({id:r.id,plugin_id:r.plugin_id,course_id:r.course_id,mode:r.input.mode,status:r.status,error:r.error,result:r.result,previous_attempt:previousAttempt});console.log(r.plugin_id+' '+r.course_id+' '+r.input.mode+': '+r.status+(r.error?' '+r.error:''));return r;}await new Promise(r=>setTimeout(r,150));}lab.jobs.cancel(j.id);const r=lab.jobs.get(j.id);jobs.push({id:r.id,plugin_id:r.plugin_id,status:r.status,error:'acceptance_wait_timeout'});return r;}
for(const course_id of ['python_pilot','ai_literacy_pilot','statistics_pilot'])for(let i=0;i<6;i++){const course=app.data.courses.get(course_id);await runJob({plugin_id:'exercise_factory',course_id,mode:'offline',kind:course_id==='statistics_pilot'?'numeric':'concept',concept_id:course.concepts[i%course.concepts.length].id,count:1,seed:42+i,idempotency_key:`accept-v07-offline-${course_id}-${i}`});}
// Native DS-H coverage of all four learner behaviours, with a separate ungraded synthetic database.
for(const persona of PERSONAS)await runJob({plugin_id:'student_simulator',course_id:'python_pilot',mode:'offline',persona,strategy:'socratic',max_turns:3,idempotency_key:'accept-v07-offline-sim-'+persona});
const fixtures=buildSimulationFixtures(app.data),comparisons={},improvements=[];
for(const course_id of ['python_pilot','ai_literacy_pilot','statistics_pilot']){comparisons[course_id]=lab.simulator.compare(course_id,STRATEGIES.map(strategy=>({id:'fixed-'+strategy,config:{strategy}})));let policy=lab.policies.list(course_id).find(p=>p.config.strategy==='socratic'&&p.config.only_uncertain);if(!policy)policy=lab.policies.create(course_id,{strategy:'socratic',only_uncertain:true},actor);improvements.push(lab.validatePolicy(policy.id));}
let realStatus='not_requested';
if(process.env.TUTOR_V07_REAL_ACCEPTANCE==='1'){
 realStatus=process.env.LONGCAT_API_KEY?'running':'blocked_missing_key';
 if(process.env.LONGCAT_API_KEY){
  for(const language of ['python','c','cpp'])for(let i=0;i<3;i++)await runJob({plugin_id:'exercise_factory',course_id:'programming_pilot',mode:'longcat',kind:'program',language,count:1,seed:210+i,idempotency_key:`accept-v07-real-${language}-${i}`});
  const course=app.data.courses.get('ai_literacy_pilot');for(let i=0;i<3;i++)await runJob({plugin_id:'exercise_factory',course_id:course.course_id,mode:'longcat',kind:'concept',concept_id:course.concepts[i%course.concepts.length].id,count:1,seed:310+i,idempotency_key:`accept-v07-real-ai-${i}`});
  for(const course_id of ['python_pilot','ai_literacy_pilot','statistics_pilot'])for(let i=0;i<PERSONAS.length;i++)await runJob({plugin_id:'student_simulator',course_id,mode:'longcat',persona:PERSONAS[i],strategy:STRATEGIES[1+i],max_turns:3,idempotency_key:`accept-v07-real-sim-${course_id}-${PERSONAS[i]}`});
  realStatus='finite_matrix_finished';
 }
}
function dump(){
 const generated=lab.factory.list(),simulations=lab.simulator.list();for(const student of [false,true])writeFileSync(path.join(out,'datasets/generated-candidates.'+(student?'student':'teacher')+'.jsonl'),lab.factory.export(null,student).map(x=>JSON.stringify(x)).join('\n')+'\n');
 writeFileSync(path.join(out,'datasets/simulation-fixtures.jsonl'),fixtures.map(x=>JSON.stringify(x)).join('\n')+'\n');writeFileSync(path.join(out,'datasets/simulation-trajectories.jsonl'),simulations.map(x=>JSON.stringify(x)).join('\n')+'\n');
 const ledger=new ModelBudget(app.harness.budgetPath),after=ledger.summary();ledger.close();const report={version:'0.7.0',created:new Date().toISOString(),server:app.origin,real_status:realStatus,before,after,new_requests:after.requests-before.requests,new_estimated_cny:after.charged_cny-before.charged_cny,jobs,candidates:generated.map(c=>({id:c.id,course:c.course_id,mode:c.generator.name,language:c.language,validation:c.validation.status,review:c.review_status,independent_scope:c.independent_generation_scope||null})),candidate_count:generated.length,real_candidate_count:generated.filter(c=>c.generator.name.includes('LongCat')).length,simulations:simulations.map(s=>({id:s.id,course:s.course_id,persona:s.persona,mode:s.mode,validity:s.validity,checks:s.checks})),fixtures:fixtures.length,comparisons,improvements,holdout_opened:false,real_student_data:false,human_review:'pending_not_simulated'};
 writeFileSync(path.join(out,'reports/pilot-validation.json'),JSON.stringify(report,null,2));writeFileSync(path.join(out,'reports/human-review-package.json'),JSON.stringify({formal_teacher_approval:false,generated,simulations,policies:improvements,holdout_references_included:false},null,2));
 for(const row of app.store.db.prepare("SELECT course_id,pack FROM course_catalog WHERE course_id LIKE '%_pilot'").all())writeFileSync(path.join(out,'course-packs',row.course_id+'.json'),row.pack+'\n');
 writeFileSync(path.join(out,'sdk/plugin-manifests.json'),JSON.stringify(TRUSTED_PLUGINS,null,2));console.log(JSON.stringify({candidate_count:generated.length,real_candidate_count:report.real_candidate_count,simulations:simulations.length,new_requests:report.new_requests,new_estimated_cny:report.new_estimated_cny,real_status:realStatus}));return report;
}
dump();console.log('Finite v0.7 validation finished. Server remains running; no further automatic model calls.');
if(process.env.TUTOR_V07_EXIT==='1')await close();
