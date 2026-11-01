import path from 'node:path';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {backup} from 'node:sqlite';
import {createApp} from '../src/server.mjs';
import {ROOT} from '../src/data.mjs';
import {seedPilots} from '../src/pilot.mjs';
import {upgradePack,refreshConceptDrafts} from '../src/v05.mjs';
import {importProjectReview} from '../src/review-import.mjs';
const out=path.resolve(ROOT,'../output/pilot-v0.5');mkdirSync(path.join(out,'reports'),{recursive:true});
process.env.TUTOR_ENABLE_REAL_MODEL='0';
const varDir=process.env.TUTOR_V05_VAR||path.join(ROOT,'var'),app=await createApp({port:0,varDir,defaultEngine:'local'}),actor={id:'v05-content-revision',role:'teacher'};
try{
 mkdirSync(path.join(varDir,'backups'),{recursive:true});await backup(app.store.db,path.join(varDir,'backups/pre-v05-import-'+Date.now()+'.sqlite'));
 await seedPilots(app.data,app.onboarding,app.materials,actor);
 const document=JSON.parse(readFileSync(path.join(out,'project-review.json'),'utf8'));
 const preview=importProjectReview(app,document);writeFileSync(path.join(out,'reports/review-import-preview.json'),JSON.stringify(preview,null,2));
 const imported=importProjectReview(app,document,{commit:true});
 // Snapshot all old in-flight items before replacing any course content.
 app.previewService.pinExisting();const {TeachingService}=await import('../src/services.mjs');new TeachingService(app.data,app.store).pinExisting();
 const packs=[];mkdirSync(path.join(out,'course-packs'),{recursive:true});
 for(const course of ['python_pilot','ai_literacy_pilot']){const row=app.store.db.prepare('SELECT * FROM course_catalog WHERE course_id=?').get(course),old=JSON.parse(row.pack);let pack=old;
  if(old.manifest.version!=='0.5.0'){if(row.status!=='draft')throw new Error('Published course needs a separate version: '+course);pack=upgradePack(old);app.onboarding.replace(course,pack,actor);}
  writeFileSync(path.join(out,'course-packs',course+'.json'),JSON.stringify(pack,null,2));packs.push({course,version:pack.manifest.version,items:pack.items.length,status:'draft_requires_revision_review'});
 }
 const supplemental=[
  ['python_pilot','py_copy.html','https://docs.python.org/3.13/library/copy.html','PSF-2.0; examples 0BSD'],
  ['python_pilot','shallow-copy-guide.md','https://docs.python.org/3.13/library/copy.html','Project-authored Chinese adaptation and example, CC-BY-4.0; based on PSF docs; pending review'],
  ['ai_literacy_pilot','reference-verification.md','https://developers.google.com/machine-learning/glossary#hallucination','Project-authored Chinese teaching notes CC-BY-4.0; concepts adapted from Google CC-BY-4.0 glossary; pending review']
 ];
 for(const [course_id,filename,source_url,license]of supplemental){const file=path.join(out,'materials',filename);if(!existsSync(file))throw new Error('Missing new evidence: '+filename);await app.materials.upload({course_id,filename,source_url,license,content_base64:readFileSync(file).toString('base64')},actor);}
 const drafts=refreshConceptDrafts(app.materials);app.store.set('content_revision','0.5.0');
 writeFileSync(path.join(out,'reports/upgrade.json'),JSON.stringify({imported,packs,regenerated_automatic_concept_drafts:drafts,human_overlays_preserved:true,existing_assignments_snapshotted:true,formal_teacher_approval:false},null,2));
 console.log(JSON.stringify({imported:imported.counts,repeated:imported.repeated,packs,drafts}));
}finally{await app.close();}
