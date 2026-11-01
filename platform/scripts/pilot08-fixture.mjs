import {createApp} from '../src/server.mjs';
import {buildV08} from './build-v08.mjs';
import {mkdtempSync} from 'node:fs';
import path from 'node:path';
import {ROOT} from '../src/data.mjs';
export const FIXTURE_PASSWORD='fixture-only-password-2026';
export async function createPilotFixture({port=0,real=false}={}){
 const dir=mkdtempSync(path.join(ROOT,'var/v08-isolated-'));const app=await createApp({mode:'pilot',port,varDir:dir,defaultEngine:'local'});
 const id=app.pilot.identity,users={};for(const [key,role]of [['admin','admin'],['teacher','teacher'],['student','student'],['student2','student']])users[key]=id.addUser({username:'fixture-'+key,name:'测试夹具-'+key,password:FIXTURE_PASSWORD,role});
 const {pack}=buildV08();app.onboarding.importPack(pack,users.admin);app.store.db.prepare('INSERT INTO pilot_teachers VALUES(?,?)').run('python_pilot',users.teacher.id);
 app.store.db.prepare('INSERT INTO materials(id,course_id,digest,filename,version,source_url,license,status,warnings,created) VALUES(?,?,?,?,?,?,?,?,?,?)').run('mat-fixture','python_pilot','fixture','TEST-FIXTURE.txt','fixture','https://docs.python.org/3.13/tutorial/','TEST FIXTURE ONLY','approved','[]',new Date().toISOString());
 for(const item of pack.items)app.workbench.review(item.id,{expected_digest:app.workbench.item(item.id).digest,status:'approved',notes:'SYNTHETIC TEST FIXTURE ONLY; not actual teacher approval'},users.admin);app.onboarding.publish('python_pilot','SYNTHETIC TEST FIXTURE ONLY',users.admin);
 const cls=id.createClass(users.teacher,{course_id:'python_pilot',title:'合成测试教学班'});for(const u of [users.student,users.student2])app.store.db.prepare('INSERT INTO pilot_members VALUES(?,?)').run(cls.id,u.id);app.pluginLab.bind('python_pilot',['exercise_factory','student_simulator','teaching_policy'],users.admin);
 return {app,users,cls,dir,scope:'isolated_fixture_not_actual_teacher_or_student'};
}
if(process.argv.includes('--serve')){let app;if(process.env.TUTOR_FIXTURE_DIR){const dir=path.resolve(process.env.TUTOR_FIXTURE_DIR),base=path.resolve(ROOT,'var');if(!dir.startsWith(base+path.sep)||!path.basename(dir).startsWith('v08-isolated-'))throw Error('Only isolated fixture directories allowed');app=await createApp({mode:'pilot',port:3812,varDir:dir,defaultEngine:'local'});if(app.store.db.prepare("SELECT 1 FROM pilot_users WHERE username NOT LIKE 'fixture-%'").get()){await app.close();throw Error('Not a fixture database');}}else app=(await createPilotFixture({port:3812})).app;console.log('仅验收夹具 '+app.origin+'；账号 fixture-teacher / fixture-student；非真实审核或学习结果');process.on('SIGINT',async()=>{await app.close();process.exit(0);});}

