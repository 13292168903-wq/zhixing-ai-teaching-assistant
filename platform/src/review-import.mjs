import {hash,uid,failure} from './store.mjs';
export function importProjectReview(app,document,{commit=false}={}){
 if(document.review_scope!=='project_group_preliminary_review_v0.4'||!Array.isArray(document.rows)||document.rows.length!==56)failure('初审文件结构不正确');
 const db=app.store.db;db.exec('CREATE TABLE IF NOT EXISTS project_reviews(id TEXT PRIMARY KEY,source_digest TEXT,record_type TEXT,course_id TEXT,record_id TEXT,resolved_id TEXT,source_status TEXT,notes TEXT,scope TEXT,created TEXT)');
 const digest=hash(document),rows=document.rows.map(row=>{
  if(!['exercise','material','real_model_scenario'].includes(row.record_type)||!['approved','needs_revision','pending'].includes(row.review_status)||!row.review_notes?.trim()||!['python_pilot','ai_literacy_pilot'].includes(row.course_id))failure('初审记录类型、课程或状态无效');
  let target=row.record_id;
  if(row.record_type==='exercise'&&app.data.items.get(target)?.course_id!==row.course_id)failure('初审题目不存在或跨课：'+target);
  if(row.record_type==='material'){
   const old=db.prepare('SELECT * FROM materials WHERE id=? AND course_id=?').get(target,row.course_id),filename=old?.filename||row.review_notes.match(/\b(?:py_intro|py_control|py_data|ai_glossary|ai_split|ai_overfit)\.html\b/)?.[0];
   const active=app.materials.list(row.course_id).filter(m=>m.filename===filename);if(active.length!==1)failure('资料版本无法唯一定位：'+target);target=active[0].id;
  }
  return {...row,resolved_id:target};
 });
 const repeated=db.prepare('SELECT COUNT(*) n FROM project_reviews WHERE source_digest=?').get(digest).n;
 const report={source_digest:digest,rows:rows.length,counts:Object.fromEntries(['approved','needs_revision','pending'].map(s=>[s,rows.filter(r=>r.review_status===s).length])),formal_teacher_approval:false,scope:'v0.4_project_review_only; v0.5 revisions require re-review',repeated:Boolean(repeated),mappings:rows.map(({review_notes,...r})=>r),committed:false};
 if(!commit||repeated)return report;
 db.exec('BEGIN IMMEDIATE');try{
  for(const r of rows){db.prepare('INSERT INTO project_reviews VALUES(?,?,?,?,?,?,?,?,?,?)').run(uid(),digest,r.record_type,r.course_id,r.record_id,r.resolved_id,r.review_status,r.review_notes,'project_group_preliminary',new Date().toISOString());
   // Initial review is not a teacher release. Pending revisions stay pending in live material state.
   if(r.record_type==='material'){db.prepare('INSERT INTO material_reviews VALUES(?,?,?,?,?,?)').run(uid(),r.resolved_id,'project-group',r.review_status==='needs_revision'?'pending':r.review_status,r.review_notes,new Date().toISOString());db.prepare('UPDATE materials SET status=? WHERE id=?').run('pending',r.resolved_id);}
   if(r.record_type==='exercise'&&r.review_status==='needs_revision')db.prepare('INSERT INTO reviews VALUES(?,?,?,?,?) ON CONFLICT(item_id) DO UPDATE SET status=excluded.status,reviewer=excluded.reviewer,notes=excluded.notes,updated=excluded.updated').run(r.resolved_id,'rejected','project-group',r.review_notes,new Date().toISOString());
  }
  app.store.audit('project-group','project_review_imported',{digest,total:rows.length,formal_teacher_approval:false});db.exec('COMMIT');return {...report,committed:true};
 }catch(e){db.exec('ROLLBACK');throw e;}
}
