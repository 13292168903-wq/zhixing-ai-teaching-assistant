import {uid,hash,failure} from './store.mjs';
import {fingerprint} from './plugin-sdk.mjs';
export function reviseCandidate(app,actor,id,b){
 const c=app.pluginLab.factory.get(id);app.identity.course(actor,c.course_id);if(c.adopted_item_id)failure('已采用候选需在课程中另建修订',409);if(b.expected_digest!==c.fingerprint||!b.notes?.trim())failure('请刷新当前版本并填写修订依据',409);
 const old=structuredClone(c);for(const k of ['prompt','reference','hints','program','family_id','structure_tag','difficulty'])if(k in b)c[k]=structuredClone(b[k]);if(typeof c.prompt!=='string'||!c.prompt.trim()||c.prompt.length>12000||!c.reference||typeof c.reference.answer!=='string'||!Array.isArray(c.reference.required_points)||!Array.isArray(c.hints))failure('候选内容不完整');
 if(old.program&&!c.program)failure('程序候选不能移除程序核验结构');
 if(c.program){const verifier=app.data.assessmentRegistry.get('code_run');verifier.validate(c.program);}
 c.revision=(c.revision||0)+1;c.fingerprint=fingerprint({prompt:c.prompt,reference:c.reference,program:c.program,revision:c.revision});c.validation={status:c.program?'pending_sandbox':'pending_semantic_review',teacher_verified:false,reason:'content_changed_requires_reverification'};c.review_status='pending';c.review=null;c.revision_history=[...(c.revision_history||[]),{previous:old,actor:actor.id,notes:b.notes,created:new Date().toISOString()}];
 app.db.prepare('UPDATE generated_candidates SET fingerprint=?,data=?,review=NULL WHERE id=?').run(c.fingerprint,JSON.stringify(c),id);return app.pluginLab.factory.get(id);
}
export function reviewSimulation(app,actor,id,b){const row=app.db.prepare('SELECT data FROM simulation_runs WHERE id=?').get(id);if(!row)failure('模拟轨迹不存在',404);const run=JSON.parse(row.data);app.identity.course(actor,run.course_id);if(!['observed','not_observed','uncertain'].includes(b.verdict)||!b.notes?.trim())failure('请标注行为是否出现并说明依据');app.db.exec('CREATE TABLE IF NOT EXISTS pilot_simulation_reviews(id TEXT PRIMARY KEY,run_id TEXT,actor TEXT,verdict TEXT,notes TEXT,created TEXT)');app.db.prepare('INSERT INTO pilot_simulation_reviews VALUES(?,?,?,?,?,?)').run(uid(),id,actor.id,b.verdict,b.notes,new Date().toISOString());return {run_id:id,original_trajectory_unchanged:true,verdict:b.verdict};}

