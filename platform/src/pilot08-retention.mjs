import {backup} from 'node:sqlite';
import {existsSync,mkdirSync,rmSync,readdirSync,lstatSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {hash,uid,failure} from './store.mjs';
export function retentionPreview(app,days=90){if(!Number.isInteger(days)||days<1||days>3650)failure('保留天数需为1—3650');const cutoff=new Date(Date.now()-days*86400000).toISOString(),tables=['chat','submissions','pilot_model_tasks',...(app.db.prepare("SELECT 1 FROM sqlite_master WHERE name='guide_messages'").get()?['guide_messages']:[])],counts=Object.fromEntries(tables.map(t=>[t,app.db.prepare('SELECT COUNT(*) n FROM '+t+' WHERE created<?').get(cutoff).n])),ids=app.db.prepare('SELECT id FROM submissions WHERE created<? ORDER BY id').all(cutoff).map(x=>x.id);return {days,cutoff,counts,expected_digest:hash({cutoff:cutoff.slice(0,10),counts,ids}),scope:'active_pilot_records_and_task_logs; backups_are_separate_admin_assets'};}
export async function retentionPurge(app,actor,b){const current=retentionPreview(app,b.days??90);if(current.expected_digest!==b.expected_digest||b.confirm!=='清理活动试点记录')failure('请先预览清理数量，再明确确认',409);if(app.queue.active||app.pluginLab.jobs.active)failure('请等待在途任务结束后清理',409);mkdirSync(path.join(app.varDir,'backups'),{recursive:true});const name='pre-retention-'+uid()+'.sqlite';await backup(app.db,path.join(app.varDir,'backups',name));const runs=app.db.prepare('SELECT run_id FROM pilot_model_tasks WHERE created<? AND run_id IS NOT NULL').all(current.cutoff);
 app.db.exec('BEGIN IMMEDIATE');try{const affected=app.db.prepare('SELECT DISTINCT user_id,course_id FROM submissions WHERE created<?').all(current.cutoff);app.db.prepare('DELETE FROM pilot_review_events WHERE submission_id IN (SELECT id FROM submissions WHERE created<?)').run(current.cutoff);app.db.prepare('DELETE FROM pilot_review_requests WHERE submission_id IN (SELECT id FROM submissions WHERE created<?)').run(current.cutoff);app.db.prepare('DELETE FROM pilot_retests WHERE source_event IN (SELECT id FROM submissions WHERE created<?)').run(current.cutoff);
 app.db.prepare("DELETE FROM settings WHERE key IN (SELECT 'explanation_advice:'||id FROM submissions WHERE created<?)").run(current.cutoff);
 app.db.prepare('DELETE FROM answer_review_events WHERE answer_id IN (SELECT id FROM answer_reviews WHERE created<?)').run(current.cutoff);
 app.db.prepare('DELETE FROM answer_reviews WHERE created<?').run(current.cutoff);
 for(const t of ['chat','submissions','pilot_model_tasks'])app.db.prepare('DELETE FROM '+t+' WHERE created<?').run(current.cutoff);
 app.db.prepare('DELETE FROM pilot_conversations WHERE updated<?').run(current.cutoff);
 for(const a of affected)app.db.prepare('DELETE FROM states WHERE user_id=? AND course_id=?').run(a.user_id,a.course_id);
 if(app.db.prepare("SELECT 1 FROM sqlite_master WHERE name='guide_messages'").get())app.db.prepare('DELETE FROM guide_messages WHERE created<?').run(current.cutoff);
 app.store.audit(actor.id,'pilot_retention_cleanup',{...current,backup:name});app.db.exec('COMMIT');}catch(e){app.db.exec('ROLLBACK');throw e;}
 const root=path.resolve(app.varDir,'harness');for(const r of runs){if(!/^[a-f0-9]{32}$/.test(r.run_id))continue;const target=path.resolve(root,r.run_id);if(target.startsWith(root+path.sep)&&existsSync(target))rmSync(target,{recursive:true});}
 const cache=path.resolve(app.varDir,'harness-home');const cleanCache=dir=>{if(!dir.startsWith(cache+path.sep)&&dir!==cache)throw Error('Invalid cache path');for(const e of readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,e.name),stat=lstatSync(file);if(stat.isSymbolicLink())continue;if(e.isDirectory())cleanCache(file);else if(stat.mtimeMs<Date.parse(current.cutoff)&&(/session/i.test(file)||file.endsWith('.zstd')))unlinkSync(file);}};if(existsSync(cache))cleanCache(cache);
 return {...current,cleaned:true,recovery_backup:name,notice:'清理的是活动数据。恢复备份含历史数据，需管理员另按备份保留政策管理；剩余学情需新作答重建。'};
}

