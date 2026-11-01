import path from 'node:path';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {ROOT} from '../src/data.mjs';
const output=path.resolve(ROOT,'../output/benchmark-v0.1/reports'),directory=JSON.parse(readFileSync(path.join(output,'clean-directory.json'),'utf8')).directory;
const workspace=path.resolve(ROOT,'../../..'),relative=path.relative(path.join(workspace,'work'),directory);if(relative.startsWith('..')||path.isAbsolute(relative)||!path.basename(directory).startsWith('benchmark-clean-'))throw Error('Unexpected clean path');
const load=name=>import(pathToFileURL(path.join(directory,name)).href);
delete process.env.HARNESS_ROOT;process.env.TUTOR_ENABLE_REAL_MODEL='0';process.env.TUTOR_LONGCAT_BUDGET=path.join(directory,'platform/var/clean-budget.sqlite');
const {restoreRuntime}=await load('platform/scripts/restore-runtime-links.mjs');const restored=restoreRuntime(path.join(directory,'platform/runtime/dsh'));
const {preflight}=await load('platform/scripts/preflight-v08.mjs');const pre=preflight({verify:true});
if(!pre.ok)throw Error('Clean startup preflight failed: '+JSON.stringify(pre));
const {startWorkspace}=await load('platform/scripts/serve-workspace.mjs');const app=await startWorkspace({port:0,varDir:path.join(directory,'platform/var/clean-check')});
try{const status=await fetch(app.origin+'/api/status').then(r=>r.json()),auth=await fetch(app.origin+'/api/auth/status').then(r=>r.json()),page=await fetch(app.origin+'/').then(r=>r.status),module=await fetch(app.origin+'/plugin-lab.js').then(r=>r.text());
 const report={status:'passed',directory,preflight:pre,restored_links:restored.restored_links,login_page:page,initialized:auth.initialized,new_plugin_registered:status.capabilities.some(p=>p.id==='evaluation_factory'),new_ui_export:module.includes('export async function renderEvaluationLab'),harness_within_clean_directory:path.resolve(app.harness.root).startsWith(path.resolve(directory)+path.sep),model_calls:0,second_device_test:false};
 if(!report.new_plugin_registered||!report.new_ui_export||!report.harness_within_clean_directory||auth.initialized)throw Error('Clean portable checks failed');writeFileSync(path.join(output,'portable-start.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await app.close();}
