import path from 'node:path';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {createApp} from '../src/server.mjs';
import {ROOT,BOOTSTRAP} from '../src/data.mjs';
import {seedPilots} from '../src/pilot.mjs';
import {writePilotDataset,PYTHON_CHECKS} from '../src/pilot-dataset.mjs';
import {PILOT_OUTPUT} from '../src/pilot-evaluation.mjs';
import {spawnSync} from 'node:child_process';
import {pythonBinary} from '../src/materials.mjs';
process.env.TUTOR_ENABLE_REAL_MODEL='0';mkdirSync(PILOT_OUTPUT,{recursive:true});
const quality=writePilotDataset(path.join(PILOT_OUTPUT,'datasets'));
const app=await createApp({port:0,varDir:path.join(ROOT,'var/pilot-build'),defaultEngine:'local'});
try{
 const seed=await seedPilots(app.data,app.onboarding,app.materials,{id:'bootstrap-author',name:'自动构建（未人工审核）',role:'teacher'});
 mkdirSync(path.join(PILOT_OUTPUT,'course-packs'),{recursive:true});mkdirSync(path.join(PILOT_OUTPUT,'reports'),{recursive:true});
 for(const row of app.store.db.prepare('SELECT course_id,pack FROM course_catalog').all())writeFileSync(path.join(PILOT_OUTPUT,'course-packs',row.course_id+'.json'),row.pack);
 const sourceManifest=JSON.parse(readFileSync(path.join(BOOTSTRAP,'sources/manifest.json'),'utf8'));writeFileSync(path.join(PILOT_OUTPUT,'sources.json'),JSON.stringify(sourceManifest,null,2));
 const referenceChecks=PYTHON_CHECKS.map(c=>{const result=spawnSync(pythonBinary(),['-I','-c',c.code],{encoding:'utf8',windowsHide:true,timeout:5000});return {concept:c.concept,code:c.code,expected:c.answer,observed:(result.stdout||'').trim(),passed:result.status===0&&(result.stdout||'').replace(/\r/g,'').trim()===c.answer,scope:'project_authored_fixed_code_only_not_student_code',environment:'Python -I; 5s timeout; CRLF normalized for comparison'};});
 const evidence=app.store.db.prepare('SELECT course_id,digest,source_digest,parser_version,source_url,license,status,warnings FROM materials WHERE id NOT IN (SELECT old_id FROM material_supersessions)').all();
 const frozen=existsSync(path.join(PILOT_OUTPUT,'datasets/finalizations.json'));
 const changes=frozen?JSON.parse(readFileSync(path.join(PILOT_OUTPUT,'reports/controlled-improvement.json'),'utf8')):[];
 if(!frozen)for(const id of ['python_pilot','ai_literacy_pilot'])changes.push(app.pilotEvaluator.improve(id,{id:'offline-evaluator'}));
 writeFileSync(path.join(PILOT_OUTPUT,'reports/dataset-quality.json'),JSON.stringify({...quality,reference_checks:referenceChecks,seed,materials:evidence},null,2));
 writeFileSync(path.join(PILOT_OUTPUT,'reports/controlled-improvement.json'),JSON.stringify(changes,null,2));
 const review={human_review:'pending',materials:evidence,exercise_review:'all_pending',open_answer_review:'pending',holdout_reference_location:'datasets/evaluator_private/holdout; not supplied to teaching tools'};
 writeFileSync(path.join(PILOT_OUTPUT,'review-package.json'),JSON.stringify(review,null,2));
 if(referenceChecks.some(r=>!r.passed)||quality.family_cross_partition)throw new Error('Dataset reference or partition verification failed');
 console.log(JSON.stringify({total:quality.total,partitions:quality.counts,python_reference_checks:referenceChecks.length,changes:changes.map(c=>({course:c.course_id,status:c.status,baseline:c.baseline_validation.passed,candidate:c.candidate_validation.passed})),human_review:'pending',paid_calls:0}));
}finally{await app.close();}
