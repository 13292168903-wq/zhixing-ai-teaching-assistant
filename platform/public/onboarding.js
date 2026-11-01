import {parseCourseCSV,BATCH_CSV} from './onboarding-shared.mjs';

export async function renderOnboarding(content,ui){
 const {el,p,tag,panel,button,api,table,toast,refresh,user}=ui;
 const info=await api('/api/teacher/onboarding');
 const download=(name,text,type='application/json')=>{const url=URL.createObjectURL(new Blob([text],{type})),a=el('a',{href:url,download:name});a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 const field=(label,node)=>el('label',{class:'field'},el('span',{},label),node);
 const input=(label,placeholder='')=>el('input',{'aria-label':label,placeholder});
 const area=(label,rows=3)=>el('textarea',{'aria-label':label,rows});
 content.append(el('div',{class:'notice'},'三种方式共用课程包接口。新课程默认是草稿；补齐资料、审核题目并发布后，才向学生开放。课程清单中的班级文字不等于学生授权；请在班级与作业中建班并通过邀请加入。本机尚未对接学校选课与身份系统。'));
 content.append(el('div',{class:'cards'},...[
  ['01 模板开课','选择教学模板，填写内容与量规'],['02 院系批量接入','导入课程清单，预检后整批创建'],['03 插件扩展','安装能力，同一插件跨课程绑定']
 ].map(([title,note])=>el('a',{class:'access-card',href:'#'+['01','02','03'].indexOf(title.slice(0,2))},el('h3',{},title),p(note,'fine')))));
 const draftCourses=info.courses.filter(c=>c.status==='draft');
 const target=el('select',{'aria-label':'模板目标课程'},el('option',{value:''},'创建新课程'),...draftCourses.map(c=>el('option',{value:c.course_id},'补齐草稿：'+c.title)));
 const template=el('select',{'aria-label':'课程模板'},...info.templates.map(t=>el('option',{value:t.id},t.title)));
 const id=input('课程标识','例如 statistics_intro'),title=input('课程名称'),department=input('所属院系'),teacher=input('负责教师'),classes=input('教学班','多个班级用 | 分隔');
 const topicId=input('知识点标识','例如 mean'),topicTitle=input('知识点名称'),objective=area('学习目标',2),summary=area('教学摘要'),sourceUrl=input('资料出处 URL','https://...'),sourceText=area('资料原文或自建摘要');
 const prompt=area('练习题目'),answer=area('参考答案',2),points=area('必答要点与支持短语',2),contradictions=area('矛盾短语',2),hint=input('练习提示'),numericTarget=input('数值参考值'),absolute=input('绝对容差','默认 0'),relative=input('相对容差','默认 0');
 const numericBox=el('div',{class:'form-grid',hidden:true},field('数值参考值',numericTarget),field('绝对容差',absolute),field('相对容差',relative));
 template.addEventListener('change',()=>{numericBox.hidden=template.value!=='numeric';});
 target.addEventListener('change',()=>{const course=draftCourses.find(c=>c.course_id===target.value);id.disabled=Boolean(course);if(course){id.value=course.course_id;title.value=course.title;department.value=course.department;teacher.value=course.teacher;classes.value=course.classes.join('|');template.value=course.template_id;numericBox.hidden=template.value!=='numeric';}});
 const form=panel('01 · 模板开课',p('首个知识点用于快速试制。更多知识点可通过完整 JSON 课包补充。选择“补齐草稿”会替换该草稿全部内容，并清除旧题审核记录。','muted'),
  el('div',{class:'form-grid'},field('操作目标',target),field('教学模板',template),field('课程标识',id),field('课程名称',title),field('所属院系',department),field('负责教师',teacher),field('教学班（| 分隔）',classes)),
  el('details',{open:true},el('summary',{},'首个知识点与练习'),el('div',{class:'form-grid'},field('知识点标识',topicId),field('知识点名称',topicTitle),field('学习目标',objective),field('教学摘要',summary),field('资料出处 URL',sourceUrl),field('资料原文或自建摘要',sourceText),field('练习题目',prompt),field('参考答案',answer),field('必答要点与支持短语（每行一条）',points),field('矛盾短语（可选，每行一条）',contradictions),field('练习提示（可选）',hint)),numericBox),
  button('保存模板课程草稿',async()=>{
   const required=points.value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
   const row={course_id:id.value.trim(),title:title.value,template_id:template.value,department:department.value,teacher:teacher.value,classes:classes.value.split('|').map(s=>s.trim()).filter(Boolean),
    topics:[{id:topicId.value.trim(),title:topicTitle.value,objective:objective.value,summary:summary.value,support:required,contradictions:contradictions.value.split(/\r?\n/).filter(Boolean),
     source:{url:sourceUrl.value.trim(),text:sourceText.value},question:{prompt:prompt.value,answer:answer.value,required_points:required,hint:hint.value,
      ...(template.value==='numeric'?{numeric:{target:numericTarget.value.trim()===''?null:Number(numericTarget.value),absolute_tolerance:Number(absolute.value||0),relative_tolerance:Number(relative.value||0)}}:{})}}]};
   await api(target.value?'/api/teacher/onboarding/'+target.value+'/template':'/api/teacher/onboarding/template',row);await refresh();toast('课程草稿已保存，请继续审核后发布。');
  },'primary'));form.id='0';content.append(form);

 const file=el('input',{type:'file',accept:'.json,.csv','aria-label':'批量课程清单'}),report=el('div'),commit=button('确认整批创建',async()=>{if(!preview?.valid)return toast('请先完成预检');await api('/api/teacher/onboarding/batch',{rows,digest:preview.digest});await refresh();toast('整批课程已创建为草稿。');},'primary');commit.disabled=true;let rows,preview;
 file.addEventListener('change',()=>{rows=null;preview=null;commit.disabled=true;report.replaceChildren();});
 const bulk=panel('02 · 院系批量接入',p('CSV 可批量创建课程空间和教学班；JSON 可同时携带 topics 内容。每批最多 50 门，任意一行不通过时整批不写入。','muted'),
  el('div',{class:'row'},button('下载 CSV 清单模板',()=>download('courses.csv','\uFEFF'+BATCH_CSV,'text/csv;charset=utf-8')),button('下载 JSON 清单模板',()=>download('courses.json',JSON.stringify({rows:parseCourseCSV(BATCH_CSV)},null,2)))),
  file,el('div',{class:'row'},button('预检课程清单',async()=>{
   preview=null;rows=null;commit.disabled=true;
   if(!file.files[0])return toast('请选择 CSV 或 JSON 清单');if(file.files[0].size>900000)throw new Error('清单过大，请拆分后导入');
   const text=await file.files[0].text();if(file.files[0].name.toLowerCase().endsWith('.csv'))rows=parseCourseCSV(text);else{const parsed=JSON.parse(text.replace(/^\uFEFF/,''));rows=Array.isArray(parsed)?parsed:parsed.rows;}
   preview=await api('/api/teacher/onboarding/preview',{rows});report.replaceChildren(table(['行','课程','检查','练习 / 班级','说明'],preview.rows.map(r=>[r.row,r.course_id,r.valid?'通过':'未通过',r.valid?r.items+' / '+r.classes:'—',r.error||r.note])));commit.disabled=!preview.valid;
  }),commit),report);bulk.id='1';content.append(bulk);

 const installedIds=new Set(info.plugins.map(p=>p.id));
 const ext=panel('03 · 插件安装与课程绑定',p('管理员安装声明式能力，教师按课程绑定。当前提供可复用的数值容差核验处理器；课程数据和浏览器均不执行上传的插件代码。','muted'),
  table(['能力','版本','状态'],info.plugins.map(p=>[p.label,p.version,'已安装'])),
  ...info.catalog.map(plugin=>el('div',{class:'review-item'},el('h3',{},plugin.label),p(plugin.description,'fine'),installedIds.has(plugin.id)?tag('已安装'):user.role==='admin'?button('安装 '+plugin.id,async()=>{await api('/api/admin/plugins/install',{plugin_id:plugin.id});await refresh();toast('插件已安装，可供多个课程复用。');},'primary'):p('请切换管理员，在课程接入中心安装此插件。','fine'))));
 const bindCourse=el('select',{'aria-label':'插件绑定课程'},...draftCourses.map(c=>el('option',{value:c.course_id},c.title))),bindPlugin=el('select',{'aria-label':'待绑定插件'},...info.plugins.filter(p=>p.kind==='assessment').map(p=>el('option',{value:p.id},p.label)));
 ext.append(el('div',{class:'row'},bindCourse,bindPlugin,button('绑定到课程',async()=>{if(!bindCourse.value||!bindPlugin.value)return toast('请选择草稿课程和已安装评阅插件');await api('/api/teacher/onboarding/'+bindCourse.value+'/plugins',{capabilities:[bindPlugin.value]});toast('课程插件依赖已保存。题目仍需声明对应评阅方式。');},'primary')));
 if(user.role==='admin'){
  const descriptor=el('input',{type:'file',accept:'.json','aria-label':'插件声明文件'});
  ext.append(el('details',{},el('summary',{},'导入自定义插件声明'),p('支持为受信 numeric_tolerance 处理器注册新的能力标识；新增处理算法需开发者实现服务端处理器并测试。','fine'),descriptor,button('安装插件声明',async()=>{if(!descriptor.files[0])return toast('请选择插件声明 JSON');await api('/api/admin/plugins/install',{descriptor:JSON.parse(await descriptor.files[0].text())});await refresh();})));
 }ext.id='2';content.append(ext);

 const courseBox=panel('课程空间与发布');content.append(courseBox);
 if(!info.courses.length)courseBox.append(el('div',{class:'empty'},'从模板开课，或先批量建立课程空间。'));
 for(const course of info.courses){
  const notes=input('发布说明 '+course.course_id,'填写资料、量规和课程内容的审核结论'),packFile=el('input',{type:'file',accept:'.json','aria-label':'补充课程包 '+course.course_id});
  courseBox.append(el('article',{class:'review-item'},el('div',{class:'row spread'},el('h3',{},course.title),tag(course.status==='published'?'已发布':'草稿 · 学生不可见',course.status==='draft'?'warn':'')),
   p(course.department+' · '+course.teacher+' · '+course.item_count+' 条练习','fine'),p('教学班：'+(course.classes.join(' / ')||'暂未配置'),'fine'),
   el('div',{class:'row'},button('下载完整课包',async()=>download(course.course_id+'.json',JSON.stringify(await api('/api/teacher/onboarding/'+course.course_id+'/pack'),null,2))),
    course.status==='draft'?button('审核本课程题目',async()=>ui.review(course.course_id)):null),
   course.status==='draft'?el('details',{},el('summary',{},'补充完整课包与发布'),p('可上传包含多个知识点的完整课包，替换本草稿全部内容。课程标识须一致，替换后需重新审核。','fine'),packFile,
    button('校验并替换草稿内容',async()=>{if(!packFile.files[0])return toast('请选择完整课包');await api('/api/teacher/onboarding/'+course.course_id+'/content',JSON.parse(await packFile.files[0].text()));await refresh();toast('草稿内容已更新，旧审核记录已清除。');}),
    el('div',{class:'row'},notes,button('提交发布申请',async()=>{await api('/api/teacher/onboarding/'+course.course_id+'/publish',{notes:notes.value});await refresh();toast('已提交发布申请，待管理员审批。');},'primary'))):p('当前版本已冻结，避免直接覆盖影响在途练习。后续版本升级需走单独的版本流程。','fine')));
 }
}
