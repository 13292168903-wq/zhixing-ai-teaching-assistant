import path from 'node:path';
import {readFileSync,existsSync,writeFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {ROOT} from '../src/data.mjs';
import {hash} from '../src/store.mjs';
const out=path.resolve(ROOT,'../output/benchmark-v0.1'),sourceName=process.argv.find(a=>a.startsWith('--source='))?.slice(9)||'longcat-release',sourceFolder=path.join(out,sourceName),summary=JSON.parse(readFileSync(path.join(sourceFolder,'summary.json'),'utf8'));
if(!['longcat-release','evidence-binding-v0.1.1'].includes(sourceName))throw Error('研究归档目录未授权');
if(summary.status!=='completed')throw Error('只允许归档已完成且固定版本的真实研究轮次');
const workspace=path.resolve(ROOT,'var/workspace-v1'),target=path.join(ROOT,'var/benchmark-v0.1',hash(workspace).slice(0,12),'benchmark.sqlite'),source=path.join(sourceFolder,'private-runtime/benchmark-v0.1/benchmark.sqlite');
if(!existsSync(target))throw Error('请先启动正式工作空间以建立独立研究库；不写入正式教学数据库');
const src=new DatabaseSync(source,{readOnly:true}),dst=new DatabaseSync(target),formal=new DatabaseSync(path.join(workspace,'platform.sqlite'),{readOnly:true});
const report={source:'isolated_public_material_synthetic_learner_experiment',formal_database_written:false,synthetic_accounts_imported:false,teacher_approvals_created:false,datasets:0,cases:0,runs:0,created:new Date().toISOString()};
try{
 const rows=src.prepare('SELECT * FROM benchmark_datasets').all();
 for(const row of rows){const d=JSON.parse(row.data);if(!formal.prepare('SELECT 1 FROM course_catalog WHERE course_id=?').get(d.course_id))throw Error('未找到研究对应课程，禁止跨课程归档');if(d.status!=='frozen'||d.frozen.teacher_approved)throw Error('研究快照状态与未教师批准条件不符');}
 for(const row of src.prepare('SELECT data FROM benchmark_cases').all()){if(JSON.parse(row.data).review?.status==='approved')throw Error('研究归档不得导入模拟教师批准');}
 dst.exec('BEGIN IMMEDIATE');
 try{
  for(const row of rows){const d=JSON.parse(row.data);d.title=(sourceName==='longcat-release'?'[真实研究归档] ':'[证据绑定验证归档] ')+d.title;d.record_origin='isolated_real_research_not_current_course_run';d.archive_notes='公开资料与合成学员的独立研究快照；来源版本可能不同于当前课程。只读归档，不用于学生作业或当前课程发布，也不计入学生统计。';d.actor='research-archive-no-formal-account';dst.prepare('INSERT OR IGNORE INTO benchmark_datasets VALUES(?,?,?,?)').run(d.id,d.course_id,d.actor,JSON.stringify(d));report.datasets++;}
  for(const table of ['benchmark_cases','benchmark_runs','benchmark_experiments']){const values=src.prepare('SELECT * FROM '+table).all();for(const row of values){const cols=Object.keys(row);dst.prepare('INSERT OR IGNORE INTO '+table+'('+cols.join(',')+') VALUES('+cols.map(()=>'?').join(',')+')').run(...cols.map(k=>row[k]));}if(table==='benchmark_cases')report.cases=values.length;if(table==='benchmark_runs')report.runs=values.length;}
  dst.exec('COMMIT');
 }catch(e){dst.exec('ROLLBACK');throw e;}
 writeFileSync(path.join(out,'reports/'+(sourceName==='longcat-release'?'research-archive-import.json':'research-archive-import-'+sourceName+'.json')),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{src.close();dst.close();formal.close();}
