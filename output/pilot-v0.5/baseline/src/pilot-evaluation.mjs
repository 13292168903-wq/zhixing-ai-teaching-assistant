import path from 'node:path';
import {existsSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {Store,failure,hash,uid} from './store.mjs';
import {ROOT} from './data.mjs';
import {loadPilotPartition,DATA_VERSION} from './pilot-dataset.mjs';
import {retrieveMaterials} from './retrieval.mjs';
import {TeachingService} from './services.mjs';
export const PILOT_OUTPUT=path.resolve(ROOT,'../output/pilot-v0.4');

export function executePilotCase(data,materialStore,c,config={}){
 if(['retrieval','boundary'].includes(c.kind)){
  const result=retrieveMaterials(data,materialStore,c.course_id,c.input.query,{preview:true,config});
  const found=result.citations.length>0,correctSource=result.citations.some(x=>c.reference.source_keywords.some(k=>x.excerpt.toLowerCase().includes(k.toLowerCase())));
  return {pass:c.reference.expected_evidence?found&&correctSource:!found,prediction:{citations:result.citations.map(x=>x.id),uncertainty:result.uncertainty},critical:!c.reference.expected_evidence&&found};
 }
 if(c.kind==='instruction_boundary'){
  const result=retrieveMaterials(data,materialStore,c.course_id,c.input.query,{preview:true,config});
  return {pass:result.source_content_is_untrusted_data===true,prediction:{state_write:false,executed_instruction:false},critical:false,quality_note:'Verifies deterministic data handling; model injection resistance remains a separate check'};
 }
 const store=new Store(':memory:');
 try{
  const id='isolated-evaluator-item',item={id,course_id:c.course_id,concept_id:c.input.concept_id,assessment_mode:'exact',task_type:'synthetic_evaluation_fixture',prompt:c.input.prompt||'合成平台流程测试题',hints:['先说明依据。'],reference:{answer:c.reference.answer,required_points:[]},checks:{human_review:'not_reviewed'}};
  if(c.input.missing_plugin){item.assessment_mode='plugin';item.assessment={capability:'not_installed'};}
  const isolated={...data,items:new Map([[id,item]])},service=new TeachingService(isolated,store),actor={id:'synthetic-evaluator',role:'teacher'};
  const assignment=service.assign({actor,course_id:c.course_id,concept_id:c.input.concept_id}).items[0];
  if(c.input.hint_count)service.hint(actor,assignment.assignment_id);
  const request={actor,assignment_id:assignment.assignment_id,event_id:'synthetic-case-event',answer:c.input.answer,explanation:c.input.explanation,expected_version:c.input.expected_version??0};
  try{
   const result=service.submit(request);if(c.input.duplicate)service.submit(request);
   const pass=c.kind==='grading'?result.next_action===c.reference.expected_action:c.kind==='hint'?result.independent_evidence===c.reference.expected_independent:c.kind==='idempotency'?store.state(actor.id,c.course_id,item.concept_id).version===1:c.kind==='state_version'?!c.reference.expected_conflict:!c.reference.expected_failure;
   return {pass,prediction:{action:result.next_action,independent_evidence:result.independent_evidence,state_version:result.state.version},critical:!pass&&['state_version','tool_failure','idempotency'].includes(c.kind)};
  }catch(e){const expected=(c.kind==='state_version'&&c.reference.expected_conflict)||(c.kind==='tool_failure'&&c.reference.expected_failure);
   return {pass:expected&&e.status===409&&store.states(actor.id,c.course_id).length===0,prediction:{error_status:e.status||500,state_write:store.states(actor.id,c.course_id).length>0},critical:!expected};}
 }finally{store.close();}
}
export class PilotEvaluator{
 constructor(data,store,datasetDir=path.join(PILOT_OUTPUT,'datasets')){this.data=data;this.store=store;this.datasetDir=datasetDir;
  store.db.exec(`CREATE TABLE IF NOT EXISTS pilot_eval_runs(id TEXT PRIMARY KEY,course_id TEXT,partition TEXT,data_version TEXT,result TEXT,created TEXT);
   CREATE TABLE IF NOT EXISTS pilot_changes(id TEXT PRIMARY KEY,data TEXT,status TEXT);
   CREATE TABLE IF NOT EXISTS pilot_finalizations(course_id TEXT PRIMARY KEY,data_version TEXT,result TEXT);
   CREATE TABLE IF NOT EXISTS pilot_releases(id TEXT PRIMARY KEY,course_id TEXT,parent TEXT,data TEXT,status TEXT);`);
 }
 run({course_id,partition='dev',config={},frozen=false,version='baseline'}){
  if(!['dev','validation','test'].includes(partition)||!['python_pilot','ai_literacy_pilot'].includes(course_id))failure('试点课程或分区无效');
  if(!existsSync(path.join(this.datasetDir,'inputs.jsonl')))failure('请先构建 v0.4 评测数据',409);
  const markerFile=path.join(this.datasetDir,'finalizations.json'),markers=existsSync(markerFile)?JSON.parse(readFileSync(markerFile,'utf8')):{},marker=markers[course_id];
  const final=this.store.db.prepare('SELECT * FROM pilot_finalizations WHERE course_id=?').get(course_id)||(marker?{result:JSON.stringify(marker)}:undefined);
  if(partition==='test'){
   if(!frozen)failure('封存测试需要确认版本冻结',409);
   if(final){const cached=JSON.parse(final.result);if(cached.version!==version||cached.config_digest!==hash(config))failure('封存测试已结束，不能改换候选',409);return {...cached,cached:true};}
  }
  const cases=loadPilotPartition(this.datasetDir,partition).filter(c=>c.course_id===course_id),results=cases.map(c=>({id:c.id,family_id:c.family_id,kind:c.kind,...executePilotCase(this.data,this.store,c,config)}));
  const output={id:uid(),course_id,data_version:DATA_VERSION,partition,version,config_digest:hash(config),total:results.length,passed:results.filter(r=>r.pass).length,critical_failures:results.filter(r=>!r.pass&&r.critical).length,
   results:partition==='test'?undefined:results,open_answer_quality:'pending_human_review',mode:'offline_workflow_and_bm25_checks',real_model_calls:0,created:new Date().toISOString()};
  this.store.db.exec('BEGIN IMMEDIATE');try{
   this.store.db.prepare('INSERT INTO pilot_eval_runs VALUES(?,?,?,?,?,?)').run(output.id,course_id,partition,DATA_VERSION,JSON.stringify(output),output.created);
   if(partition==='test')this.store.db.prepare('INSERT INTO pilot_finalizations VALUES(?,?,?)').run(course_id,DATA_VERSION,JSON.stringify(output));this.store.db.exec('COMMIT');
  }catch(e){this.store.db.exec('ROLLBACK');throw e;}
  if(partition==='test'){const temporary=markerFile+'.tmp';writeFileSync(temporary,JSON.stringify({...markers,[course_id]:output},null,2));renameSync(temporary,markerFile);}return output;
 }
 improve(course_id,actor){
  const markerFile=path.join(this.datasetDir,'finalizations.json');
  if(this.store.db.prepare('SELECT 1 FROM pilot_finalizations WHERE course_id=?').get(course_id)||(existsSync(markerFile)&&JSON.parse(readFileSync(markerFile,'utf8'))[course_id]))failure('本轮封存测试已开启，优化关闭',409);
  const digest=JSON.parse(readFileSync(path.join(this.datasetDir,'quality.json'),'utf8')).content_sha256;
  const materials=this.store.db.prepare('SELECT digest FROM materials WHERE course_id=? AND id NOT IN (SELECT old_id FROM material_supersessions) ORDER BY digest').all(course_id).map(r=>r.digest),materialFingerprint=hash(materials);
  const previous=this.store.db.prepare("SELECT data FROM pilot_changes WHERE json_extract(data,'$.course_id')=? AND json_extract(data,'$.dataset_digest')=? AND json_extract(data,'$.material_fingerprint')=?").get(course_id,digest,materialFingerprint);if(previous)return JSON.parse(previous.data);
  const baseline=this.run({course_id}),failures=baseline.results.filter(r=>!r.pass);
  // Exactly one parameter change is chosen using development failures, never validation or holdout answers.
  const config={min_score:0.7},id='pilot-change-'+uid().slice(0,8),baseValidation=this.run({course_id,partition:'validation'}),newDev=this.run({course_id,config,version:id}),candidateValidation=this.run({course_id,partition:'validation',config,version:id});
  const regressions=baseValidation.results.filter(r=>r.pass&&!candidateValidation.results.find(n=>n.id===r.id)?.pass).map(r=>r.id);
  const passed=failures.length>0&&candidateValidation.passed>baseValidation.passed&&newDev.passed>=baseline.passed&&regressions.length===0&&candidateValidation.critical_failures===0;
  const output={id,course_id,data_version:DATA_VERSION,dataset_digest:digest,material_fingerprint:materialFingerprint,model:'LongCat-2.0',material_versions:materials,
   failure_evidence_ids:failures.map(r=>r.id),hypothesis:'开发区检索未命中可能与阈值有关；仅把最低 BM25 分数从 1.5 调为 0.7。',candidate_config:config,
   baseline_development:baseline,changed_development:newDev,baseline_validation:baseValidation,candidate_validation:candidateValidation,new_regressions:regressions,
   status:passed?'pending_human_review':'rejected',reason:!failures.length?'no_confirmed_development_failure':passed?'independent_gate_passed_human_review_required':'no_strict_independent_gain_or_regression',
   active_for_students:false,teacher_approved:false,real_model_comparison:false,created:new Date().toISOString()};
  this.store.db.prepare('INSERT INTO pilot_changes VALUES(?,?,?)').run(id,JSON.stringify(output),output.status);this.store.audit(actor.id,'pilot_candidate_evaluated',{id,status:output.status});return output;
 }
 release(id,actor,{fixture=false}={}){
  const row=this.store.db.prepare('SELECT * FROM pilot_changes WHERE id=?').get(id);if(!row||row.status!=='pending_human_review')failure('候选未通过独立验证',409);
  const c=JSON.parse(row.data);if(!fixture)failure('本轮只交付待人工审核包，尚无正式教师批准',409);
  const version=uid();this.store.db.prepare('INSERT INTO pilot_releases VALUES(?,?,?,?,?)').run(version,c.course_id,'baseline',JSON.stringify({fixture:true,actor:actor.id,candidate_id:id}),'fixture_only');return {version,fixture:true,active_for_students:false};
 }
 rollback(version){const row=this.store.db.prepare('SELECT * FROM pilot_releases WHERE id=?').get(version);if(!row||row.status!=='fixture_only')failure('仅可回退测试夹具版本',409);this.store.db.prepare("UPDATE pilot_releases SET status='rolled_back' WHERE id=?").run(version);return {version:'baseline',fixture:true};}
}
