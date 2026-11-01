import {readFileSync} from 'node:fs';
import path from 'node:path';
import {ROOT} from './data.mjs';
import {hash} from './store.mjs';
import {assessExplanation} from './pedagogy.mjs';
export function validateRubricCandidate(app,candidate){
 const rows=readFileSync(path.resolve(ROOT,'../output/pilot-v0.8/datasets/diagnostics.teacher.jsonl'),'utf8').trim().split('\n').map(JSON.parse).filter(c=>c.course_id===candidate.course_id&&c.partition!=='sealed');
 const reference=JSON.parse(candidate.reference),base=app.data.items.get(candidate.item_id);
 const confirmed=rows.flatMap(c=>{const item=app.data.items.get(c.item_id);if(!item||c.content_digest!==hash({prompt:item.prompt,reference:item.reference}))return [];const labels=app.db.prepare("SELECT l.* FROM pilot_labels l JOIN pilot_users u ON u.id=l.actor WHERE l.case_id=? AND u.role='teacher' AND u.disabled=0").all(c.id);return labels.length>=2&&new Set(labels.map(l=>l.label)).size===1?[{...c,label:labels[0].label}]:[];});
 const devFamilies=new Set(confirmed.filter(c=>c.partition==='development').map(c=>c.family_id)),valFamilies=new Set(confirmed.filter(c=>c.partition==='validation').map(c=>c.family_id));
 const report={eligible:false,status:'pending_independent_labels',confirmed_cases:confirmed.length,development_families:devFamilies.size,validation_families:valFamilies.size,family_overlap:[...devFamilies].filter(f=>valFamilies.has(f)),sealed_read:false,quality_scope:'teacher-labeled explanation screen; not learning outcomes'};
 if(!devFamilies.size||!valFamilies.size)return report;
 if(rows.some(c=>c.item_id===base.id&&c.partition==='validation'))return {...report,status:'candidate_source_in_validation'};
 const evaluate=changed=>confirmed.map(c=>{const item=app.data.items.get(c.item_id);if(!item)return null;let ref=item.reference;if(changed&&item.concept_id===base.concept_id){const groups=(ref.point_groups||[]).map(g=>{const patch=reference.point_groups.find(n=>n.label===g.label);return patch?{...g,acceptable:patch.acceptable}:g;});ref={...ref,rubric_version:2,point_groups:groups,unacceptable:reference.unacceptable||ref.unacceptable};}const status=assessExplanation(app.data.courses.get(c.course_id).cards.concepts[item.concept_id],c.student_explanation,{},ref).status;return {...c,status,recognized:status==='provisional_support',pass:c.label==='supported'?status==='provisional_support':c.label==='contradiction'?status==='contradiction':status!=='provisional_support'};}).filter(Boolean);
 const summary=items=>Object.fromEntries(['development','validation'].map(part=>{const rs=items.filter(c=>c.partition===part);return [part,{total:rs.length,passed:rs.filter(c=>c.pass).length,correct_missed:rs.filter(c=>c.label==='supported'&&!c.recognized).length,false_accepts:rs.filter(c=>c.label!=='supported'&&c.recognized).length}];}));
 const before=summary(evaluate(false)),after=summary(evaluate(true));return {...report,status:'compared',before,after,eligible:after.validation.passed>before.validation.passed&&after.development.passed>=before.development.passed&&after.validation.false_accepts<=before.validation.false_accepts&&after.development.false_accepts<=before.development.false_accepts&&report.family_overlap.length===0};
}

