import {createPilotFixture} from './pilot08-fixture.mjs';
const {app,users}=await createPilotFixture({port:4182});
const id='ui_draft_fixture',row={course_id:id,title:'隔离界面测试课程',department:'测试院系',teacher:'合成教师',template_id:'objective',topics:[{id:'lists',title:'共享列表',objective:'说明赋值',summary:'赋值不复制列表',source:{url:'https://docs.python.org/3.13/tutorial/introduction.html#lists',text:'赋值不复制列表，两个变量可以引用同一列表对象。'},question:{prompt:'a=[1];b=a;b.append(2);print(a)',answer:'[1, 2]',required_points:['赋值不复制列表']}}]};
app.onboarding.commit([row],app.onboarding.preview([row]).digest,users.teacher);app.store.db.prepare('INSERT INTO pilot_teachers VALUES(?,?)').run(id,users.teacher.id);
const mat=await app.materials.upload({course_id:id,filename:'fixture.txt',source_url:row.topics[0].source.url,content_base64:Buffer.from('这是隔离界面测试资料，不代表真实教学审核。变量赋值不复制列表，两个变量可以引用同一列表对象。').toString('base64')},users.teacher);app.materials.review(mat.id,{status:'approved',notes:'SYNTHETIC UI FIXTURE ONLY'},users.teacher);
for(const i of app.data.items.values())if(i.course_id===id)app.workbench.review(i.id,{expected_digest:app.workbench.item(i.id).digest,status:'approved',notes:'SYNTHETIC UI FIXTURE ONLY'},users.teacher);
console.log('隔离界面夹具 '+app.origin);process.on('SIGINT',async()=>{await app.close();process.exit(0);});
