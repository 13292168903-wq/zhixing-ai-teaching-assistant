import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {ROOT} from './data.mjs';
import {installExtension,EXTENSION_CATALOG} from './extensions.mjs';
import {statisticsPack} from './statistics-pack.mjs';
export async function setupV06(app){const actor={id:'v06-setup-not-human-approval',role:'teacher'},out=path.resolve(ROOT,'../output/pilot-v0.6');
 if(!app.registry.plugins.has('numeric_check')){const descriptor=installExtension(app.registry,EXTENSION_CATALOG.find(x=>x.id==='numeric_check'));app.store.db.prepare('INSERT INTO installed_extensions VALUES(?,?,?)').run(descriptor.id,JSON.stringify(descriptor),new Date().toISOString());app.data.capabilities.add(descriptor.id);app.store.audit(actor.id,'trusted_existing_plugin_enabled',{id:descriptor.id});}
 const pack=statisticsPack();if(!app.data.courses.has(pack.manifest.course_id))app.onboarding.importPack(pack,actor);
 const filename='statistics-guide.md',file=path.join(out,'materials',filename);await app.materials.upload({course_id:'statistics_pilot',filename,source_url:'https://docs.python.org/3.13/library/statistics.html',license:'Project-authored Chinese notes and fixed examples CC-BY-4.0; based on Python docs PSF-2.0; pending human review',content_base64:readFileSync(file).toString('base64')},actor);
 for(const row of app.previewStore.db.prepare('SELECT course_id,question,result FROM chat').all()){const result=JSON.parse(row.result);if(result.runtime?.model_mode==='real')app.workbench.capture(row.course_id,row.question,result);}
 for(const row of app.previewStore.db.prepare('SELECT course_id,item_id,result FROM submissions').all()){const result=JSON.parse(row.result);if(result.runtime?.model_mode==='real')app.workbench.capture(row.course_id,result.teaching_context?.item_prompt||row.item_id,result);}
 const archive=path.join(out,'reports/longcat-validation.json');if(existsSync(archive))for(const scenario of JSON.parse(readFileSync(archive,'utf8')).scenarios||[]){const result=scenario.result;if(result?.runtime?.model_mode==='real'&&app.data.courses.has(scenario.course_id))app.workbench.capture(scenario.course_id,result.query||result.teaching_context?.item_prompt||result.item_id||scenario.name,{...result,record_origin:'archived_real_validation_report_not_a_new_call'});}
 app.store.set('content_revision','0.6.0');return {third_course:pack.manifest.course_id,items:pack.items.length,course_status:'draft',trusted_plugin:'numeric_check@1.0.0',course_specific_kernel_changes:0,formal_teacher_approval:false,calls_total_limit:null,cost_total_limit:null,real_model_calls:0};
}
