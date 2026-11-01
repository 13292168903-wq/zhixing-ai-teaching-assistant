import path from 'node:path';
import os from 'node:os';
import {mkdtempSync,readFileSync} from 'node:fs';
import {createApp} from '../src/server.mjs';
import {ROOT} from '../src/data.mjs';
import {chunkSegments} from '../src/materials.mjs';
export const BENCH_PASSWORD='isolated-benchmark-only-2026';
export async function benchmarkFixture({port=0,mode='offline',directory}={}){
 const varDir=directory||mkdtempSync(path.join(os.tmpdir(),'zhixing-benchmark-'));
 const oldBudget=process.env.TUTOR_LONGCAT_BUDGET;process.env.TUTOR_LONGCAT_BUDGET=path.join(varDir,'experiment-longcat-budget.sqlite');
 let app;try{app=await createApp({mode:'pilot',port,varDir,defaultEngine:mode==='longcat'?'harness':'local'});}finally{if(oldBudget===undefined)delete process.env.TUTOR_LONGCAT_BUDGET;else process.env.TUTOR_LONGCAT_BUDGET=oldBudget;}
 const users={};
 for(const [name,role]of [['admin','admin'],['teacher','teacher'],['other','teacher'],['student','student']])users[name]=app.pilot.identity.addUser({username:'benchmark-'+name,name:'合成验收-'+name,password:BENCH_PASSWORD,role});
 for(const [course,file]of [['python_pilot','pilot-v0.8'],['ai_literacy_pilot','pilot-v0.6']]){
  const pack=JSON.parse(readFileSync(path.resolve(ROOT,'../output',file,'course-packs',course+'.json'),'utf8'));app.onboarding.importPack(pack,users.admin);
  app.store.db.prepare('INSERT INTO pilot_teachers VALUES(?,?)').run(course,users.teacher.id);app.pluginLab.bind(course,['exercise_factory','student_simulator','teaching_policy','evaluation_factory'],users.admin);
  const mid='mat-benchmark-'+course;app.store.db.prepare('INSERT INTO materials(id,course_id,digest,filename,version,source_url,license,status,warnings,created) VALUES(?,?,?,?,?,?,?,?,?,?)').run(mid,course,'fixture-'+course,'研究课程卡片.md','fixture-1','https://example.org/research-snapshot','Project-authored candidate; teacher review pending','pending','[]',new Date().toISOString());
  const chunks=chunkSegments(pack.evidence.map(e=>({text:e.text,locator:{section:pack.manifest.concepts.find(c=>c.id===e.concept_id)?.title||e.concept_id,source:e.locator}})));
  for(const [index,c]of chunks.entries())app.store.db.prepare('INSERT INTO material_chunks VALUES(?,?,?,?,?)').run(mid+'-'+index,mid,course,c.text,JSON.stringify(c.locator));
 }
 return {app,users,varDir,scope:'synthetic_fixture_no_real_teacher_approval'};
}
export async function waitBenchmark(app,id,{timeout=900000}={}){const end=Date.now()+timeout;while(Date.now()<end){const j=app.pluginLab.jobs.get(id);if(!['queued','running'].includes(j.status))return j;await new Promise(r=>setTimeout(r,100));}throw Error('评测任务等待超时；请检查任务记录，不自动重放');}
if(process.argv.includes('--serve')){
 const {app,varDir}=await benchmarkFixture({port:Number(process.env.PORT||4183)});console.log(JSON.stringify({origin:app.origin,varDir,scope:'isolated_browser_fixture'}));
 process.on('SIGINT',async()=>{await app.close();process.exit(0);});
}
