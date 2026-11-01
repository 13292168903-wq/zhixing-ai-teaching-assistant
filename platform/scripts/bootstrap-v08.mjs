import {DatabaseSync} from 'node:sqlite';
import {readFileSync,existsSync,copyFileSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {ROOT} from '../src/data.mjs';
import {buildV08} from './build-v08.mjs';
export async function bootstrapV08(app,{legacyDir=path.join(ROOT,'var')}={}){
 if(!app.pilot)throw Error('Pilot mode required');if(app.store.get('v08_content_imported'))return {already_imported:true};
 const {pack,out}=buildV08(),actor={id:'v08-content-import-not-teacher-approval',role:'admin'};
 for(const id of ['python_pilot','ai_literacy_pilot','statistics_pilot','programming_pilot']){const p=id==='python_pilot'?pack:JSON.parse(readFileSync(path.resolve(ROOT,'../output/pilot-v0.7/course-packs',id+'.json'),'utf8'));if(id==='statistics_pilot'&&!app.registry.plugins.has('numeric_check')){const {installExtension,EXTENSION_CATALOG}=await import('../src/extensions.mjs');const descriptor=installExtension(app.registry,EXTENSION_CATALOG.find(p=>p.id==='numeric_check'));app.store.db.prepare('INSERT INTO installed_extensions VALUES(?,?,?)').run(descriptor.id,JSON.stringify(descriptor),new Date().toISOString());app.data.capabilities.add(descriptor.id);}
 if(!app.data.courses.has(id))app.onboarding.importPack(p,actor);
 app.pluginLab.bind(id,['exercise_factory','student_simulator','teaching_policy'],actor);}
 const file=path.join(legacyDir,'platform.sqlite');let source;
 const report={course_status:'all_draft',formal_approvals:0,legacy_database_written:false,candidates:0,materials:0,legacyDir_available:existsSync(file)};
 if(existsSync(file)){source=new DatabaseSync(file,{readOnly:true});const rows=source.prepare("SELECT * FROM materials WHERE course_id IN ('python_pilot','ai_literacy_pilot','statistics_pilot','programming_pilot')").all();
 for(const row of rows){const columns=Object.keys(row).filter(k=>app.store.db.prepare('PRAGMA table_info(materials)').all().some(c=>c.name===k));const originalStatus=row.status;row.status='draft';app.store.db.prepare('INSERT OR IGNORE INTO materials('+columns.join(',')+') VALUES('+columns.map(()=>'?').join(',')+')').run(...columns.map(k=>row[k]));for(const c of source.prepare('SELECT * FROM material_chunks WHERE material_id=?').all(row.id))app.store.db.prepare('INSERT OR IGNORE INTO material_chunks VALUES(?,?,?,?,?)').run(c.id,c.material_id,c.course_id,c.text,c.locator);const original=path.join(legacyDir,'materials',row.id+'.source');if(existsSync(original))copyFileSync(original,path.join(app.varDir||app.pilot.varDir,'materials',row.id+'.source'));app.store.audit(actor.id,'legacy_material_imported',{id:row.id,original_status:originalStatus,new_status:'draft',human_approval_carried_forward:false});report.materials++;}
 source.close();}
 if(!report.materials){for(const id of ['python_pilot','ai_literacy_pilot','statistics_pilot','programming_pilot']){const course=app.data.courses.get(id);await app.materials.upload({course_id:id,filename:id+'-guide.md',source_url:course.evidence[0].locator,license:'Project-authored/adapted compilation; underlying source licenses retained; pending teacher review',content_base64:Buffer.from(course.evidence.map(e=>'# '+course.concepts.find(c=>c.id===e.concept_id).title+'\n'+e.text+'\nSource: '+e.locator+'\nLicense: '+e.license).join('\n\n')).toString('base64')},actor);report.materials++;}}
 const archived=readFileSync(path.resolve(ROOT,'../output/pilot-v0.7/datasets/generated-candidates.teacher.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 for(const [position,c]of archived.entries()){c.review_status='pending';c.review=null;c.record_origin='archived_v07_candidate_not_new_generation';app.store.db.prepare('INSERT OR IGNORE INTO generated_candidates VALUES(?,?,?,?,?,?,?,?,?)').run(c.id,'archive-v07',position,c.course_id,c.fingerprint,JSON.stringify(c),null,null,new Date().toISOString());report.candidates++;}
 const trajectories=readFileSync(path.resolve(ROOT,'../output/pilot-v0.7/datasets/simulation-trajectories.jsonl'),'utf8').trim().split('\n').map(JSON.parse);for(const c of trajectories){c.record_origin='archived_v07_actual_model_run_not_rerun';c.human_review='pending';app.store.db.prepare('INSERT OR IGNORE INTO simulation_runs VALUES(?,?,?,?,?)').run(c.id,c.id,c.course_id,JSON.stringify(c),new Date().toISOString());}
 report.quarantined=archived.filter(c=>c.validation.status.startsWith('quarantined')).length;report.simulations_preserved=trajectories.length;app.store.set('v08_content_imported','true');writeFileSync(path.join(out,'reports/content-import.json'),JSON.stringify(report,null,2));return report;
}

