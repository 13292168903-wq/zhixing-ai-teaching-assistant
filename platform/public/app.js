import {renderOnboarding} from './onboarding.js';
import {renderPilot} from './pilot.js';
import {renderWorkbench} from './workbench.js';
import {renderPluginLab} from './plugin-lab.js';
import {consumeChat,explanationPrefix} from './chat-stream.mjs';
const root=document.querySelector('#app');
const state={user:null,status:null,courses:[],course:'python',engine:'harness',view:'学习工作台',messages:[],answerMode:'tutor',conversationId:crypto.randomUUID(),tasks:[],taskIndex:0,result:null,hint:null,concept:'',busy:false,drafts:{}};
const labels={student:'学生',teacher:'教师',admin:'管理员',unconfirmed:'待确认',needs_review:'需要复查',supported:'局部证据支持',practicing:'正在巩固',pending:'待验证',validated:'验证通过',rejected:'未通过',published:'已发布',approved:'审核通过'};
function el(tag,attrs={},...children){const n=document.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(k==='class')n.className=v;else if(k.startsWith('on'))n.addEventListener(k.slice(2).toLowerCase(),v);else if(k==='text')n.textContent=v;else if(k==='value')n.value=v;else if(k==='checked')n.checked=v;else n.setAttribute(k,v);}for(const child of children.flat()){if(child!==null&&child!==undefined)n.append(child instanceof Node?child:document.createTextNode(String(child)));}return n;}
const p=(text,cls='')=>el('p',{class:cls},text);
const tag=(text,kind='')=>el('span',{class:'tag '+kind},text);
function toast(text){const n=document.querySelector('#toast');n.textContent=text;n.style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>n.style.display='none',6000);}
async function api(url,body){const r=await fetch(url,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Object.assign(new Error(data.error||'请求失败'),{status:r.status});return data;}
async function action(button,fn){if(state.busy)return;state.busy=true;if(button)button.disabled=true;try{await fn();}catch(e){toast(e.message);}finally{state.busy=false;if(button)button.disabled=false;document.querySelectorAll('[aria-label="当前课程"],[aria-label="执行引擎"]').forEach(n=>n.disabled=false);}}
const button=(text,handler,cls='')=>el('button',{class:cls,onClick:event=>action(event.currentTarget,handler)},text);
function panel(title,...children){return el('section',{class:'panel'},el('div',{class:'panel-header'},el('h2',{},title)),...children);}
function stat(label,value,note){return el('div',{class:'stat'},el('div',{class:'label'},label),el('div',{class:'value'},value),el('div',{class:'fine'},note));}
function promptNode(text){const box=el('div',{class:'task-prompt'});text.split(/```(?:python)?\n?/).forEach((part,i)=>box.append(i%2?el('pre',{},part):el('div',{},part)));return box;}
const currentCourse=()=>state.courses.find(x=>x.id===state.course);
function answerParts(r){
 if(r.model_output_error)return [el('div',{class:'notice'},'本次模型返回未通过格式或引用核验，结果未采纳。请重新提问。'),el('details',{},el('summary',{},'查看检索导读（非模型回答）'),el('div',{class:'answer'},r.answer||'未检索到课程资料。'))];
 if(r.model_supplement!==undefined)return [...(r.model_course_answer?[p('本轮课程资料依据','fine'),el('div',{class:'answer'},r.model_course_answer)]:[]),...(r.model_supplement?[r.response_kind==='conversation'?null:el('div',{class:'tag warn'},'模型补充 · 未经课程资料核验'),el('div',{class:'answer'},r.model_supplement)]:[]),...(r.unresolved_questions?.length?[p('待澄清：'+r.unresolved_questions.join('；'),'fine')]:[])].filter(Boolean);
 return [el('div',{class:'answer'},r.model_answer||r.answer)];
}

async function refreshCourses(){state.courses=await api('/api/courses');if(!state.courses.some(c=>c.id===state.course)){state.course=state.courses[0]?.id||'';state.concept='';state.tasks=[];state.messages=[];state.result=null;state.hint=null;}}
async function login(role){state.user=await api('/api/demo-login',{role});await refreshCourses();state.view=role==='student'?'学习工作台':role==='teacher'?'课程管理':'质量总览';await render();}
function loginScreen(){root.replaceChildren(el('div',{class:'login'},el('div',{class:'login-story'},el('div',{class:'eyebrow'},'ZHIXING / TEACHING STUDIO'),el('h1',{},'让每一次反馈，',el('br'),'都有下一步。'),p('从课程资料到学习证据，从针对性练习到持续质量改进。\n一个可以装配课程与能力的教学工作空间。'),el('div',{class:'orbital'},el('span',{},'课程包接入'),el('span',{},'证据驱动教学'),el('span',{},'验证后发布'))),el('div',{class:'login-form'},el('div',{class:'brand'},el('span',{class:'logo'},'知'),el('div',{},el('strong',{},'知行'),el('small',{},'PLUGGABLE AI TUTOR'))),el('h2',{},'选择一个演示工作空间'),p('本地原型 · 使用合成身份与示范课程','muted'),el('div',{class:'role-buttons'},...[
 ['student','学生学习','提问、练习、查看反馈与下一步建议'],['teacher','教师工作台','接入课程、审核题目、查看学习证据'],['admin','质量与版本','运行规则评测、验证候选、发布与回退']].map(([role,title,desc])=>button(el('div',{},el('strong',{},title+'  →'),el('small',{},desc)),()=>login(role)))),p((state.status?.harness?.mode==='real_model_explicit'?'当前 DS-H 已连接真实模型，模型操作会产生请求；插件可单独选择离线模式。':'当前采用离线规则与脚本模型，不产生付费模型调用。')+'演示登录仅用于本机体验，不是正式身份认证。','fine'))));}
function navigation(){return state.user.role==='student'?['学习工作台','我的学情','学习记录']:state.user.role==='teacher'?['课程管理','插件实验室','资料与试点','课程接入中心','审核与评测','题目审核','学情概览']:['质量总览','插件实验室','资料与试点','课程接入中心','审核与评测','题目审核','评测实验','配置与经验'];}
async function render(){
 if(!state.user)return loginScreen();
 const nav=navigation(),courseSelect=el('select',{'aria-label':'当前课程',onChange:async e=>{state.course=e.target.value;state.concept='';state.messages=[];state.conversationId=crypto.randomUUID();state.tasks=[];state.result=null;state.hint=null;await render();}},...state.courses.map(c=>el('option',{value:c.id},c.title.replace('示范课包',''))));courseSelect.value=state.course;
 courseSelect.disabled=state.busy;
 const engineSelect=el('select',{'aria-label':'执行引擎',onChange:async e=>{state.engine=e.target.value;await render();}},el('option',{value:'harness'},state.status.harness.mode==='real_model_explicit'?'DS-H · 真实模型已开启':'DS-H · 离线脚本'),el('option',{value:'local'},'本地规则直连'));engineSelect.value=state.engine;engineSelect.disabled=state.busy;
 const content=el('main',{class:'workspace',id:'content'});
 root.replaceChildren(el('div',{class:'shell'},el('aside',{class:'sidebar'},el('div',{class:'brand'},el('span',{class:'logo'},'知'),el('div',{},el('strong',{},'知行'),el('small',{},'TEACHING STUDIO'))),el('nav',{class:'nav'},...nav.map((name,i)=>button(el('span',{},el('span',{class:'num'},'0'+(i+1)),name),async()=>{state.view=name;await render();},state.view===name?'active':''))),el('div',{class:'sidebar-bottom'},el('span',{class:'dot'}),'课程能力已装配',el('div',{class:'fine'},'检索 · 选题组卷 · 作答核验'),el('div',{class:'fine'},'v0.7 / 本地演示平台'))),el('div',{},el('header',{class:'topbar'},el('div',{class:'controls'},courseSelect,engineSelect),el('div',{class:'user'},el('span',{class:'avatar'},state.user.name[0]),el('span',{class:'name'},state.user.name),tag(labels[state.user.role]),button('切换角色',async()=>{await api('/api/logout',{});state.user=null;state.messages=[];state.tasks=[];await render();},'small'))),content)));
 content.append(el('div',{class:'intro'},el('div',{},el('div',{class:'eyebrow'},state.user.role==='student'?'YOUR LEARNING SPACE':'TEACHING OPERATIONS'),el('h1',{},state.view==='学习工作台'?'今天，从一个问题开始。':state.view),p('课程有边界，反馈有依据，进展可追溯。')),tag(state.engine==='harness'?'DS-H 工具执行':'本地规则模式','purple')));
 if(state.view==='课程接入中心')return renderOnboarding(content,{el,p,tag,panel,button,api,table,toast,user:state.user,refresh:async()=>{await refreshCourses();await render();},review:async id=>{state.course=id;state.view='题目审核';await render();}});
 if(state.view==='审核与评测')return renderWorkbench(content,{el,p,tag,panel,button,api,table,toast,courses:state.courses,course:state.course,refresh:async()=>{await refreshCourses();await render();}});
 if(state.view==='插件实验室')return renderPluginLab(content,{el,p,tag,panel,button,api,table,toast,courses:state.courses,course:state.course,user:state.user,refresh:async()=>{await refreshCourses();await render();}});
 if(state.view==='资料与试点')return renderPilot(content,{el,p,tag,panel,button,api,table,toast,answerParts,courses:state.courses,engine:state.engine,refresh:async()=>{await refreshCourses();await render();}});
 if(state.user.role==='student')await studentView(content);else if(state.user.role==='teacher'||state.view==='题目审核')await teacherView(content);else await adminView(content);
}
async function studentView(content){
 const states=await api('/api/state?course='+state.course),history=await api('/api/history?course='+state.course);
 if(state.view==='我的学情'){
  content.append(el('div',{class:'notice'},'这里显示作答证据与提示依赖，不把单次正确当成全面掌握。开放解释仍需教师确认。'));
  for(const concept of currentCourse().concepts){const s=states.find(x=>x.concept_id===concept.id);content.append(panel(concept.title,p(concept.objective,'muted'),el('div',{class:'row'},tag(labels[s?.status]||'尚无作答证据'),tag('版本 '+(s?.version||0))),p('独立客观正确证据：'+(s?.independent_correct||0)+' 条；已记录作答：'+(s?.evidence.length||0)+' 次。'),button('练习这个知识点',async()=>{state.concept=concept.id;state.view='学习工作台';await startPractice();},'primary')));}return;
 }
 if(state.view==='学习记录'){
  content.append(history.length?panel('当前课程最近的作答',table(['时间','题目','输出核验','下一步'],history.map(x=>[new Date(x.created).toLocaleString(),x.item_id,x.result.correct===null?'待复核':x.result.correct?'正确':'待订正',actionLabel(x.result.next_action)]))):el('div',{class:'empty'},'完成一次练习后，这里会保留作答证据。'));return;
 }
 content.append(el('div',{class:'cards'},stat('课程知识点',currentCourse().concepts.length,'可通过课程包扩展'),stat('已完成练习',history.length,'仅统计当前课程'),stat('已形成证据',states.reduce((n,x)=>n+x.evidence.length,0),'状态更新由内核统一处理')));
 const chat=panel('课程问答与连续辅导'),practice=panel('诊断 · 练习 · 再学习');content.append(el('div',{class:'columns'},chat,practice));
 const answerMode=el('select',{'aria-label':'问答模式',onChange:e=>state.answerMode=e.target.value},el('option',{value:'tutor'},'连续辅导 · 允许标明模型补充'),el('option',{value:'evidence'},'严格资料问答 · 仅依据本轮资料'));answerMode.value=state.answerMode;chat.append(el('div',{class:'row'},answerMode,button('开始新对话',async()=>{state.messages=[];state.conversationId=crypto.randomUUID();await render();},'small')));
 const conv=el('div',{class:'conversation'});
 if(!state.messages.length){chat.append(el('div',{class:'welcome-card'},el('div',{class:'symbol'},'↗'),el('h3',{},'先说说，你卡在哪里？'),p('从课程证据开始，再用一道小题检查理解。真实模型支持连续追问、代码解释和跨语言比较；课程依据与模型补充分别标注。本地规则模式仅提供资料导读。','fine')));const topics=currentCourse().concepts.slice(0,3);chat.append(el('div',{class:'suggestions'},...topics.map(c=>button('理解「'+c.title+'」 →',async()=>ask(c.title)))));}
 for(const m of state.messages){if(m.role==='user')conv.append(el('div',{class:'message user'},m.text));else conv.append(el('div',{class:'message'},el('strong',{},m.data.model_output_error?'知行 / 本次模型结果未采纳':m.data.runtime?.model_mode==='real'?'知行 / 模型辅导（请核对）':'知行 / 课程资料导读'),...answerParts(m.data),m.data.teaching_plan&&m.data.teaching_plan.strategy!=='baseline'?p('下一步：'+m.data.teaching_plan.question,'hint'):null,m.data.citations.length?el('div',{class:'citations'},...m.data.citations.map(c=>el('a',{href:c.url,target:'_blank',rel:'noopener noreferrer'},c.id+' · 查看原始出处 ↗'))):(!['conversation','tutoring'].includes(m.data.response_kind)&&!m.data.model_output_error?p('缺少课程证据：已保留不确定性','fine'):null),el('div',{class:'meta'},runtimeLabel(m.data.runtime))));}
 chat.append(conv);const query=el('textarea',{rows:2,placeholder:'例如：切片和浅拷贝有什么区别？','aria-label':'课程问题'});
 const send=button('发送 ↗',()=>ask(query.value),'primary');let composing=false;
 query.addEventListener('compositionstart',()=>{composing=true;});query.addEventListener('compositionend',()=>{composing=false;});
 query.addEventListener('keydown',event=>{if(event.key!=='Enter'||event.shiftKey||event.isComposing||composing||event.keyCode===229)return;event.preventDefault();if(!event.repeat&&!state.busy&&query.value.trim())send.click();});
 chat.append(el('div',{class:'askbox'},query,send),p('Enter 发送 · Shift＋Enter 换行。课程引用和模型补充分开标注。连续辅导会使用本对话最近的上下文；严格资料模式保留资料边界。','fine'));
 const topic=el('select',{'aria-label':'练习知识点'},el('option',{value:''},'全部知识点'),...currentCourse().concepts.map(c=>el('option',{value:c.id},c.title)));topic.value=state.concept;
 const count=el('select',{'aria-label':'组卷题数'},...[1,3,5].map(n=>el('option',{value:n},n+' 道题')));
 practice.append(el('div',{class:'row'},topic,count,button('开始练习',async()=>{state.concept=topic.value;await startPractice(Number(count.value));},'primary')));
 const task=state.tasks[state.taskIndex];
 if(!task){practice.append(el('div',{class:'empty'},'选择知识点，开始一段短练习。',el('br'),'把答案和理由分开写，反馈会更有针对性。'));return;}
 practice.append(el('div',{class:'row spread'},p('第 '+(state.taskIndex+1)+' / '+state.tasks.length+' 题 · '+task.id,'fine'),tag('草稿量规 · 练习反馈','warn')),promptNode(task.prompt));
 const draft=state.drafts[task.assignment_id]||(state.drafts[task.assignment_id]={answer:'',explanation:''});
 const answer=el('textarea',{rows:2,value:draft.answer,onInput:e=>draft.answer=e.target.value,placeholder:task.assessment_mode==='exact'?'填写输出或选项字母':'填写你的判断与理由','aria-label':'作答答案'});
 const explanation=el('textarea',{rows:3,value:draft.explanation,onInput:e=>draft.explanation=e.target.value,placeholder:'解释为什么这样，而不只复述答案。','aria-label':'作答解释'});
 practice.append(el('label',{},'你的答案'),answer,el('label',{},'你的解释'),explanation);
 if(state.hint)practice.append(el('div',{class:'hint'},state.hint));
 practice.append(el('div',{class:'row'},button('给我一点提示',async()=>{const r=await api('/api/hint',{assignment_id:task.assignment_id});state.hint=r.hint;await render();}),button('提交并获取反馈',async()=>{
  try{state.result=await api('/api/submit',{assignment_id:task.assignment_id,event_id:crypto.randomUUID(),answer:answer.value,explanation:explanation.value,expected_version:task.state_version,engine:state.engine});task.state_version=state.result.state.version;await render();}
  catch(e){if(e.status===409){const latest=await api('/api/state?course='+state.course);task.state_version=latest.find(s=>s.concept_id===task.concept_id)?.version||0;}throw e;}
 },'primary')));
 if(state.result){const r=state.result;practice.append(el('div',{class:'result '+r.state_status},el('strong',{},r.correct===null?'开放判断 · 待复核':r.correct?'输出核验正确':'输出需要订正'),p(r.feedback),el('div',{class:'state'},'下一步：'+actionLabel(r.next_action)+' · '+labels[r.state_status]+' · 提示 '+r.hints_used+' 次'),el('div',{class:'fine'},runtimeLabel(r.runtime))));practice.append(el('div',{class:'row'},button('查看完整解析',async()=>{const h=await api('/api/hint',{assignment_id:task.assignment_id,full:true});state.hint='参考输出：'+h.answer+'\n'+h.hint;await render();}),button('继续下一题',async()=>{if(state.taskIndex+1<state.tasks.length){state.taskIndex++;const next=state.tasks[state.taskIndex];if(next.concept_id===task.concept_id)next.state_version=r.state.version;state.result=null;state.hint=null;await render();}else{state.concept=task.concept_id;await startPractice();}},'primary')));}
}
async function ask(query){
 if(!query.trim())return toast('请输入课程问题');
 state.messages.push({role:'user',text:query});await render();
 const conv=document.querySelector('.conversation'),draft=el('div',{class:'message'},el('strong',{},'知行 / 正在生成 · 待格式与引用核验'),p('正在准备课程上下文……','fine'),el('div',{class:'answer'}));conv?.append(draft);if(conv)conv.scrollTop=conv.scrollHeight;
 let raw='';const started=performance.now();
 try{const response=await fetch('/api/ask/stream',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({course_id:state.course,query,engine:state.engine,answer_mode:state.answerMode,conversation_id:state.conversationId})});
 const r=await consumeChat(response,e=>{if(e.type==='status')draft.querySelector('p').textContent=e.text;if(e.type==='delta'){raw+=e.text;const text=explanationPrefix(raw);draft.querySelector('p').textContent='模型正在生成；此处是待核验预览';if(text)draft.querySelector('.answer').textContent=text;if(conv)conv.scrollTop=conv.scrollHeight;}});
 r.runtime.client_total_ms=Math.round(performance.now()-started);state.messages.push({role:'assistant',data:r});await render();const current=document.querySelector('.conversation');if(current)current.scrollTop=current.scrollHeight;
 }catch(e){draft.replaceChildren(el('strong',{},'本次回答未完成'),p(e.message));throw e;}
}
async function startPractice(count=1){const r=await api('/api/practice',{course_id:state.course,concept_id:state.concept||undefined,count,engine:state.engine});state.tasks=r.items;state.taskIndex=0;state.result=null;state.hint=null;await render();}
const actionLabel=id=>({probe_contradiction:'核查解释矛盾',give_local_hint:'局部提示',assign_transfer:'新题复查',ask_justification:'补充解释',acknowledge_progress:'记录进展',teacher_review:'教师复核'})[id]||id;
const runtimeLabel=r=>r?.engine==='local_conversation'?'本地问候响应 · 无模型调用 · '+r.duration_ms+' ms':r?.engine==='ds-h'?'经 DS-H 工具执行 · '+(r.model_mode==='real'?'真实模型 · '+r.real_model_calls+' 次调用':'离线脚本模型')+' · '+(r.total_ms??r.duration_ms)+' ms': '本地规则执行 · 无付费模型调用';
function table(headers,rows){return el('div',{class:'table-wrap'},el('table',{},el('thead',{},el('tr',{},...headers.map(h=>el('th',{},h)))),el('tbody',{},...rows.map(row=>el('tr',{},...row.map(v=>el('td',{},v??'—')))))));}
async function teacherView(content){
 if(state.view==='学情概览'){const a=await api('/api/teacher/analytics');content.append(panel('课程作答概览',table(['课程','作答次数'],a.courses.map(x=>[x.course_id,x.submissions]))),panel('知识点证据覆盖',table(['课程','知识点','学习者'],a.states.map(x=>[x.course_id,x.concept_id,x.learners]))));return;}
 if(state.view==='课程管理'){
  content.append(el('div',{class:'notice'},'课程包与量规尚待教师审核。导入只接受声明式数据，不安装任意代码插件。'));
  content.append(button('进入课程接入中心 →',async()=>{state.view='课程接入中心';await render();},'primary'));
  for(const c of state.courses)content.append(panel(c.title,el('div',{class:'row'},tag(c.version),tag(c.onboarding_status==='published'?'已审核发布':c.onboarding_status==='draft'?'接入草稿 · 学生不可见':'示范课包 · 待教师确认',c.onboarding_status==='published'?'':'warn')),p(c.concepts.map(x=>x.title).join(' / ')||'待补充课程知识点'),p(c.item_count+' 条练习，复用检索、选题与核验能力。','fine')));
  const file=el('input',{type:'file',accept:'.json,application/json','aria-label':'导入课程包文件'});content.append(panel('接入一门新课程',p('上传包含 manifest、cards、evidence、items 的 JSON 课程包；数据格式和可导入样例见项目 examples 目录。','muted'),file,el('div',{class:'row'},button('校验并导入',async()=>{if(!file.files[0])return toast('请先选择课程包 JSON');const pack=JSON.parse(await file.files[0].text());const r=await api('/api/teacher/import',pack);state.courses=await api('/api/courses');state.course=r.course_id;state.view='课程接入中心';await render();toast('课包已保存为草稿，请在接入中心审核发布。');},'primary'))));return;
 }
 const items=await api('/api/teacher/items?course='+state.course);const box=panel('题目与评分依据审核');content.append(box);
 for(const item of items){const notes=el('input',{placeholder:'填写审核依据或修改建议','aria-label':'审核理由 '+item.id});box.append(el('article',{class:'review-item'},el('div',{class:'row spread'},el('h3',{},item.id),tag(item.review.status==='pending'?'待审核':labels[item.review.status]||'待审核',item.review.status==='approved'?'':'warn')),promptNode(item.prompt),el('details',{},el('summary',{},'查看参考答案与量规'),el('pre',{},JSON.stringify(item.reference,null,2))),el('div',{class:'review-controls'},notes,button('通过',async()=>{await api('/api/teacher/review',{item_id:item.id,expected_digest:item.content_digest,status:'approved',notes:notes.value});await render();}),button('退回',async()=>{await api('/api/teacher/review',{item_id:item.id,expected_digest:item.content_digest,status:'rejected',notes:notes.value});await render();},'danger')),item.review.notes?p(item.review.notes,'fine'):null));}
}
async function adminView(content){
 const overview=await api('/api/overview'),runs=await api('/api/runs');
 content.append(el('div',{class:'notice'},'当前是离线规则与工具条件回归。通过数只反映已实现的动作契约检查，不代表模型教学能力或真实学习收益。'));
 content.append(el('div',{class:'cards'},stat('当前策略版本',overview.published.version,'学生使用已发布配置'),stat('评测运行',runs.length,'开发、验证与封存测试分开'),stat('条件化经验',overview.experiences.filter(x=>x.status==='verified_enabled').length,'验证 + 本地教师动作后生效')));
 if(state.view==='配置与经验'){
  content.append(panel('已发布配置',el('pre',{},JSON.stringify(overview.published.config,null,2)),button('回退到父版本',async()=>{await api('/api/rollback',{});await render();},'danger')),
   panel('经验生命周期',overview.experiences.length?table(['经验','状态','适用条件'],overview.experiences.map(x=>[x.id,x.status,JSON.stringify(x.conditions)])):el('div',{class:'empty'},'尚无已验证发布的经验。日志与反思不会自动成为经验。')),
   panel('操作审计',table(['时间','操作者','动作'],overview.audit.map(x=>[new Date(x.created).toLocaleString(),x.actor,x.action]))));return;
 }
 const tools=await api('/api/plugins');content.append(panel('已装配能力',el('div',{class:'row'},...tools.map(x=>tag(x.label+' · '+x.version)))));
 content.append(panel('运行与发现',el('div',{class:'row'},button('运行开发区评测',async()=>{await api('/api/evaluations',{partition:'dev'});await render();},'primary'),button('生成失败定向变式',async()=>{const r=await api('/api/adaptive',{});await render();toast('构建 '+r.variants.length+' 条开发任务、'+r.new_generator_shapes+' 种受信程序结构；独立新家族记为 0。');}),button('提出候选配置',async()=>{await api('/api/candidates',{});await render();})),p('受信模板构建后核验输出，保持父家族归属。候选只修改解释筛查与迁移策略。','fine')));
 const candidates=panel('候选配置与独立验证');content.append(candidates);
 if(!overview.candidates.length)candidates.append(el('div',{class:'empty'},'先运行开发区，再提出一项最小策略改动。'));
 for(const c of overview.candidates)candidates.append(el('div',{class:'review-item'},el('div',{class:'row spread'},el('h3',{},c.id),tag(labels[c.status]||c.status)),p(c.reason.hypothesis),c.validation?p('验证通过数：'+c.validation.baseline.passed+' → '+c.validation.candidate.passed+'；新增回归错误：'+c.validation.new_regressions.length,'fine'):p('尚未执行独立验证。','fine'),el('div',{class:'row'},button('独立验证',async()=>{await api('/api/candidates/'+c.id+'/validate',{});await render();}),c.status==='validated'?button('演示审核并发布',async()=>{await api('/api/candidates/'+c.id+'/publish',{});await render();},'primary'):null)));
 content.append(panel('评测运行记录',runs.length?table(['时间','分区','版本','通过 / 总数'],runs.map(x=>[new Date(x.created).toLocaleString(),x.partition,x.version,x.passed+' / '+x.total])):el('div',{class:'empty'},'尚未运行评测。')));
 if(state.view==='评测实验'){
  const frozen=el('input',{type:'checkbox',id:'frozen'});content.append(panel('封存测试',el('div',{class:'row'},frozen,el('label',{for:'frozen'},'确认本轮版本与比较方案已冻结')),button('运行当前版本最终测试',async()=>{if(!frozen.checked)return toast('请先确认版本冻结');await api('/api/evaluations',{partition:'test',frozen:true});await render();},'primary'),p('开启后关闭本数据版本的配置优化；只返回汇总，不将答案或明细反馈提供给优化器。重复请求返回缓存结果。','fine')));
 }
}
try{state.status=await api('/api/status');state.engine=state.status.default_engine;try{state.user=await api('/api/me');state.courses=await api('/api/courses');state.view=navigation()[0];}catch{}await render();}catch(e){root.replaceChildren(p('无法连接本地服务：'+e.message));}
