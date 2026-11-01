import path from 'node:path';
import {readFileSync} from 'node:fs';
import {createApp} from '../src/server.mjs';
import {ROOT} from '../src/data.mjs';
import {seedPilots} from '../src/pilot.mjs';
import {setupV06} from '../src/v06.mjs';
process.env.TUTOR_ENABLE_REAL_MODEL='0';
const app=await createApp({port:0,defaultEngine:'local',...(process.env.TUTOR_V07_VAR?{varDir:path.resolve(process.env.TUTOR_V07_VAR)}:{})}),actor={id:'v07-course-bootstrap-not-human-approval',role:'teacher'};
try{
 await seedPilots(app.data,app.onboarding,app.materials,actor);await setupV06(app);
 for(const[course_id,filename,source_url,license]of [
 ['python_pilot','py_copy.html','https://docs.python.org/3.13/library/copy.html','PSF-2.0; examples 0BSD'],
 ['python_pilot','shallow-copy-guide.md','https://docs.python.org/3.13/library/copy.html','Project-authored adaptation CC-BY-4.0; based on Python PSF docs; pending review'],
 ['ai_literacy_pilot','reference-verification.md','https://developers.google.com/machine-learning/glossary#hallucination','Project-authored notes CC-BY-4.0; Google concepts CC-BY-4.0; pending review']])await app.materials.upload({course_id,filename,source_url,license,content_base64:readFileSync(path.resolve(ROOT,'../output/pilot-v0.5/materials',filename)).toString('base64')},actor);
 if(!app.store.get('v07_bootstrap')){app.pluginLab.setup(actor);app.store.set('v07_bootstrap','0.7.0');}
 console.log(JSON.stringify({courses:app.onboarding.list(),plugins:app.pluginLab.catalog(),formal_teacher_approval:false,model_calls:0}));
}finally{await app.close();}
