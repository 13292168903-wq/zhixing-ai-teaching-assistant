// Presentation-only triage: no scores, reviews or learning state are changed here.
export function evaluationOverview(dataset,report={}){
 const cases=dataset.cases||[],runs=dataset.runs||[],confirmed=report.failures||runs.filter(r=>r.confirmed_failure),confirmedIds=new Set(confirmed.map(r=>r.case_id));
 const review=cases.filter(c=>c.validation.status==='passed'&&!['approved','rejected'].includes(c.review.status));
 const quarantined=cases.filter(c=>c.validation.status==='quarantined'),pending=cases.filter(c=>c.validation.status==='pending');
 const signals=runs.filter(r=>!confirmedIds.has(r.case_id)&&(r.stable===false||(r.checks||[]).some(c=>!c.passed)));
 const issues=[];
 const add=(id,title,owner,description,action,ids)=>{if(ids.length)issues.push({id,title,owner,description,action,case_ids:[...new Set(ids)],count:new Set(ids).size});};
 add('confirmed','已复现的助教行为问题','joint','同一客观检查在两个独立状态中均未通过。','教师核对教学含义，维护者定位原因；修复后用新版本复查。',confirmed.map(r=>r.case_id));
 add('signals','需要核对的运行信号','joint','有单次检查失败或两次结果不一致，尚不能认定为可复现错误。','结合题目与回答复核，维护者检查运行差异。',signals.map(r=>r.case_id));
 add('quarantined','生成候选被隔离','maintainer','候选未通过来源、答案或辅助核验，已停止进入后续运行。','维护者检查引用关联和核验原因；涉及学科歧义时请教师协助。',quarantined.map(c=>c.id));
 add('pending','技术核验尚未完成','maintainer','候选缺少可用的技术核验结果。','维护者检查沙箱及依赖，完成核验后再交教师审核。',pending.map(c=>c.id));
 add('review','待教师审核的教学内容','teacher','技术检查通过，来源、参考及开放反馈仍需学科判断。',dataset.status==='frozen'?'导出教师审核表，离线填写意见；有修改需求时另建检查。':'核对来源、参考和反馈，填写审核结论与依据。',review.map(c=>c.id));
 return {issues,candidates:cases.length,review_count:review.length,quarantined:quarantined.length,pending:pending.length,runs:runs.length,confirmed:confirmed.length,archive:dataset.record_origin==='isolated_real_research_not_current_course_run',frozen:dataset.status==='frozen',teacher_approved:false};
}

export async function renderEvaluationLab(root,ui){
 const {el,p,panel,button,api,table,toast,course}=ui,base='/api/teacher/evaluation-datasets';
 const state=renderEvaluationLab.state||(renderEvaluationLab.state={}),refresh=()=>{root.replaceChildren();return renderEvaluationLab(root,ui);};
 const statuses={draft:'尚未开始',queued:'排队中',running:'检查中',generating:'生成与核验中',generated:'检查记录已生成',completed:'已完成',cancelled:'已取消',interrupted:'已中断',failed:'失败',frozen:'只读研究快照',passed:'技术检查通过',pending:'待审核',quarantined:'已隔离',needs_revision:'需修订',approved:'已审核',rejected:'已拒绝'};
 const scenarios={contradiction:'答案与理由矛盾',ambiguous:'解释含糊',hint_dependency:'提示依赖',wrong_answer:'客观答案错误',duplicate:'重复提交',conflict:'状态冲突',insufficient:'资料不足',tool_failure:'工具异常',transfer:'同概念补练',paraphrase:'同义表达候选',false_premise:'错误前提',cross_course:'跨课边界'};
 const courseInfo=ui.courses.find(c=>c.id===course),names=Object.fromEntries((courseInfo?.concepts||[]).map(c=>[c.id,c.title]));
 const who={teacher:'教师',maintainer:'平台维护者',joint:'教师与维护者'};
 const input=(label,value,type='text')=>el('input',{'aria-label':label,type,value}),field=(label,node)=>el('label',{class:'field'},el('span',{},label),node);
 const select=(label,values,value)=>{const s=el('select',{'aria-label':label},values.map(([v,t])=>el('option',{value:v},t)));s.value=value;return s;};
 const fold=(title,...nodes)=>el('details',{},el('summary',{},title),...nodes);
 const downloadText=(name,text,type='application/json')=>{const u=URL.createObjectURL(new Blob([text],{type})),a=el('a',{href:u,download:name});a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};
 const download=(name,data)=>downloadText(name,JSON.stringify(data,null,2));
 const disable=(b,reason)=>{b.disabled=true;b.title=reason;return b;};
 const settings=await api('/api/teacher/plugin-lab'),plugin=settings.plugins.find(x=>x.id==='evaluation_factory'),bound=plugin?.bindings.includes(course);
 root.append(panel('课程质量检查',p('查看检查结论，处理需要教师确认的事项；技术问题交由平台维护者排查。学生继续使用原有学习流程。'),p('检查记录用于质量复核。技术通过、未发现客观失败均不等于教学效果已验证。','fine')));
 if(!plugin){root.append(panel('需要更新服务',p('当前服务尚未加载课程质量检查，请联系维护者更新。')));return;}
 if(!bound||!plugin.enabled){root.append(panel('准备检查能力',p(!plugin.enabled?'插件已禁用，请管理员在教学能力中启用。':'首次使用需要为本课程启用检查能力。'),...(plugin.enabled?[button('为本课程启用质量检查',async()=>{await api('/api/teacher/plugin-bindings',{course_id:course,plugin_ids:settings.plugins.filter(x=>x.bindings.includes(course)).map(x=>x.id).concat('evaluation_factory')});await refresh();},'primary')]:[])));return;}
 const datasets=await api(base+'?course='+encodeURIComponent(course)),experiments=await api('/api/teacher/evaluation-experiments?course='+encodeURIComponent(course));
 if(!datasets.some(d=>d.id===state.selected))state.selected=(datasets.find(d=>d.status==='generating')||datasets.find(d=>!d.record_origin&&d.counts.candidates>0)||datasets.find(d=>d.counts.candidates>0)||datasets[0])?.id;
 const d=state.selected?await api(base+'/'+state.selected):null,report=d?await api(base+'/'+d.id+'/report'):null,overview=d?evaluationOverview(d,report):null;
 const jobs=d?(await api('/api/teacher/plugin-jobs')).filter(j=>j.plugin_id==='evaluation_factory'&&(j.input.dataset_id===d.id||experiments.some(e=>e.id===j.input.experiment_id&&e.dataset_ids.includes(d.id)))):[];
 const active=jobs.filter(j=>['queued','running'].includes(j.status));
 const creation=fold('新建课程检查');creation.open=!d;
 const record=select('查看检查记录',datasets.map(x=>[x.id,x.title+' · '+(statuses[x.status]||x.status)]),state.selected||'');record.addEventListener('change',async()=>{state.selected=record.value;state.caseIds=null;await refresh();});
 const newButton=button('新建检查',async()=>{creation.open=true;creation.scrollIntoView({block:'start'});creation.querySelector('select')?.focus();});
 const overviewPanel=panel('本课检查概览',...(d?[field('查看检查记录',record),p(d.title),p('记录状态：'+(statuses[d.status]||d.status)),p('检查方式：'+(d.mode==='longcat'?'LongCat 真实模型':'离线流程检查'),'fine'),...(overview.archive?[p('这是公开资料与合成学员的独立研究归档，资料版本可能不同于当前课程。当前课程的质量需另建检查确认。','notice')]:[]),p(!overview.runs?'当前记录尚无已完成的助教运行，暂不能给出行为检查结论。':overview.confirmed?'发现已复现的客观检查问题，请优先处理下方事项。':'已完成的运行中未发现两次复现的客观失败；开放教学质量仍待教师审核。'),el('div',{class:'live-stats'},[['检查候选',overview.candidates],['已运行案例',overview.runs],['待教师审核',overview.review_count],['被隔离候选',overview.quarantined]].map(([label,value])=>el('div',{class:'fx-stat'},p(label),el('strong',{},String(value))))),p('被隔离候选交由维护者检查；待教师审核只统计技术通过且尚未批准或拒绝的内容。','fine')]:[p('本课程还没有检查记录。先新建一小批检查，再查看结果和待办事项。')]),el('div',{class:'row'},newButton,button('刷新结果',refresh)));
 root.append(overviewPanel);
 // New checks stay finite and explicit; a real-model mode never starts automatically.
 const materials=await api('/api/teacher/materials?course='+encodeURIComponent(course));
 const mode=select('运行模式',[['offline','离线流程检查'],['longcat','LongCat 真实生成与实测']],state.mode||'offline');
 const concept=select('知识点',[['','全部知识点'],...(courseInfo?.concepts||[]).map(c=>[c.id,c.title])],''),material=select('资料版本',[['','当前全部可用资料'],...materials.map(m=>[m.id,m.filename+' · '+m.version])],'');
 const arm=select('生成方式',[['C','反馈选题'],['B','固定覆盖选题'],['A','受信模板']],state.arm||'C'),count=input('候选数量',state.count||10,'number'),seed=input('随机种子',state.seed||42,'number');count.min=2;count.max=100;count.step=2;
 const scenario=select('检查类型',[['','全部检查类型'],...Object.entries(scenarios)],'');
 creation.append(field('运行模式',mode),field('资料版本',material),field('知识点',concept),fold('高级设置：检查范围与生成参数',field('检查类型',scenario),field('生成方式',arm),field('候选数量（偶数）',count),field('随机种子',seed)),p('先创建记录，再明确点击“开始检查”。LongCat模式会产生真实调用；离线模式验证流程。','fine'),button('创建检查',async()=>{state.mode=mode.value;state.arm=arm.value;state.count=Number(count.value);state.seed=Number(seed.value);const created=await api(base,{course_id:course,mode:mode.value,arm:arm.value,count:Number(count.value),seed:Number(seed.value),...(material.value?{material_ids:[material.value]}:{}),...(concept.value?{concept_ids:[concept.value]}:{}),...(scenario.value?{scenarios:[scenario.value]}:{})});state.selected=created.id;state.caseIds=null;await refresh();},'primary'));
 root.append(creation);
 if(!d)return;
 const start=button('开始检查',async()=>{await api(base+'/'+d.id+'/generate',{idempotency_key:'generate-'+d.id});toast('检查已排队，请稍后刷新结果。');await refresh();},'primary');
 if(overview.frozen||active.length)disable(start,overview.frozen?'归档为只读；请新建检查':'检查已在执行');
 if(!overview.candidates&&!overview.frozen)overviewPanel.append(p(active.length?'检查正在排队或运行，请稍后刷新结果。':'记录已创建，点击“开始检查”运行这一批。'),start);
 if(active.length){overviewPanel.append(p('检查正在排队或运行。无需保持页面打开；返回后可刷新查看进度。'));for(const j of active)overviewPanel.append(button('取消当前检查',async()=>{await api('/api/teacher/plugin-jobs/'+j.id+'/cancel',{});await refresh();}));}
 if(jobs.some(j=>['failed','interrupted','cancelled'].includes(j.status)))overviewPanel.append(p('此记录有失败、取消或中断任务。请维护者查看高级详情，核对已完成步骤后显式恢复。','notice'));
 const reviewPacket=()=>{
  const cells=v=>{let s=String(v??'');if(/^\s*[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  const rows=[['案例编号','知识点','检查类型','题目','模拟学生答案','模拟学生理由','参考答案','参考解析','助教反馈','资料原文','当前审核状态','审核意见']];
  for(const c of d.cases.filter(c=>c.validation.status==='passed'&&!['approved','rejected'].includes(c.review.status))){const r=d.runs.find(r=>r.case_id===c.id),res=r?.trials[0]?.result||{},ref=c.oracle.item.reference||{};rows.push([c.id,names[c.concept_id]||c.concept_id,scenarios[c.scenario]||c.scenario,c.public.item.prompt,c.public.answer,c.public.explanation,ref.answer,ref.explanation,res.model_feedback||res.model_answer||res.feedback||'',(d.sources||[]).filter(s=>[...c.source_refs,...(c.advisory?.source_ids||[])].includes(s.id)).map(s=>s.text).join('\n\n'),statuses[c.review.status]||c.review.status,'']);}
  downloadText('教师审核表.csv','\ufeff'+rows.map(r=>r.map(cells).join(',')).join('\r\n'),'text/csv;charset=utf-8');
 };
 const exportSummary=()=>download('课程检查摘要.json',{课程:courseInfo?.title||course,记录:d.title,状态:statuses[d.status]||d.status,记录性质:overview.archive?'独立研究归档':'本课检查',检查结论:overview.runs?(overview.confirmed?'有已复现客观问题':'未发现两次复现客观失败，开放语义待审核'):'尚无完成运行',数量:{候选:overview.candidates,已运行:overview.runs,待教师审核:overview.review_count,隔离:overview.quarantined},处理事项:overview.issues.map(i=>({事项:i.title,建议处理人:who[i.owner],涉及案例数:i.count,建议:i.action})),教学效果:'尚未验证'});
 const casesPanel=fold('案例与教学审核'),caseBody=el('div',{}),caseSearch=input('搜索案例','','search');let pageIndex=0;
 const caseFilter=select('案例范围',[['review','待教师审核'],['quarantined','被隔离候选'],['all','全部案例'],['issue','选中事项关联案例']],state.caseIds?'issue':'review');
 const focusCases=ids=>{state.caseIds=ids;caseFilter.value='issue';caseSearch.value='';pageIndex=0;renderCases();casesPanel.open=true;casesPanel.scrollIntoView({block:'start'});};
 const scope=select('事项范围',[['teacher','教师相关事项'],['all','全部事项']],state.scope||(ui.user?.role==='admin'?'all':'teacher'));
 const issueBody=el('div',{}),issuePanel=panel('需要处理的事项',p('以下是建议分工，不会自动派单、批准内容或修改学生状态。','fine'),field('事项范围',scope),issueBody);
 const renderIssues=()=>{issueBody.replaceChildren();const issues=overview.issues.filter(i=>scope.value==='all'||i.owner!=='maintainer');
  if(!issues.length)issueBody.append(p(scope.value==='teacher'?'当前没有教师相关待办。技术问题可切换到“全部事项”查看。':'暂无待办；尚未运行或尚未覆盖的场景仍需检查。'));
  for(const i of issues)issueBody.append(el('section',{class:'notice'},el('h3',{},i.title+' · '+i.count+' 条'),p('建议处理人：'+who[i.owner]),p(i.description),p('建议动作：'+i.action),button('查看相关案例',async()=>focusCases(i.case_ids))));
 };
 scope.addEventListener('change',()=>{state.scope=scope.value;renderIssues();});renderIssues();root.append(issuePanel);
 root.append(panel('建议下一步',p(overview.frozen?'先查看或导出需要审核的内容。归档保持只读；修订或检查当前课程时，请另建记录。':overview.review_count?'优先核对资料、参考和反馈，再填写审核结论。技术故障由维护者处理。':!overview.runs?'开始一小批检查，完成后再判断需要处理的事项。':'按事项建议复核或扩展未覆盖场景；准备新版本时再安排回归。'),el('div',{class:'row'},button('查看待审核内容',async()=>focusCases(d.cases.filter(c=>c.validation.status==='passed'&&!['approved','rejected'].includes(c.review.status)).map(c=>c.id))),button('导出教师审核表',async()=>reviewPacket()),button('导出检查摘要',async()=>exportSummary())),p('审核表供离线填写，不会自动写入批准；试点发布仍执行原有审核门槛。','fine')));
 const explanationLabels={contradiction:'解释出现矛盾',provisional_support:'规则初筛支持，仍待复核',uncertain:'规则尚未识别',missing:'未填写理由',supported:'解释有支持依据'};
 const actionLabels={probe_contradiction:'追问解释中的矛盾',acknowledge_progress:'确认局部进展，继续新结构练习',request_explanation:'请学生补充理由',request_clarification:'进一步澄清',provide_hint:'提供提示'};
 const plainResult=(res={})=>el('div',{},p('助教回答／反馈：'+(res.model_answer||res.model_feedback||res.feedback||res.answer||'本案例暂无可展示回答。')),p('解释判断：'+(explanationLabels[res.explanation_status]||'请结合反馈复核')+'；独立掌握证据：'+(res.independent_evidence===true?'本次记为独立证据（不等于整体掌握）':res.independent_evidence===false?'本次不计入':'本场景不适用或未记录')),p('后续动作：'+(actionLabels[res.next_action]||res.teaching_plan?.question||'请结合案例复核')));
 const renderCases=()=>{caseBody.replaceChildren();let selected=d.cases;
  if(caseFilter.value==='issue')selected=selected.filter(c=>(state.caseIds||[]).includes(c.id));
  if(caseFilter.value==='review')selected=selected.filter(c=>c.validation.status==='passed'&&!['approved','rejected'].includes(c.review.status));
  if(caseFilter.value==='quarantined')selected=selected.filter(c=>c.validation.status==='quarantined');
  const query=caseSearch.value.trim().toLowerCase();if(query)selected=selected.filter(c=>[c.id,names[c.concept_id],scenarios[c.scenario],c.public.item.prompt,c.public.answer,c.public.explanation,c.public.query].join(' ').toLowerCase().includes(query));
  const pages=Math.max(1,Math.ceil(selected.length/8));pageIndex=Math.min(pageIndex,pages-1);caseBody.append(p('共 '+selected.length+' 条，第 '+(pageIndex+1)+' / '+pages+' 页，每页最多8条。','fine'));
  if(!selected.length)caseBody.append(p('当前范围暂无案例。可切换范围查看其他记录。'));
  for(const c of selected.slice(pageIndex*8,pageIndex*8+8)){
   const run=d.runs.find(r=>r.case_id===c.id),ref=c.oracle.item.reference||{};
   const entry=fold((names[c.concept_id]||c.concept_id)+' · '+(scenarios[c.scenario]||c.scenario)+' · '+(c.variant==='normal'?'正常对照':'异常场景')+' · '+(statuses[c.review.status]||c.review.status),p('题目：'+c.public.item.prompt),p('模拟学生答案：'+c.public.answer),p('模拟学生理由：'+c.public.explanation),...(c.public.query?[p('模拟学生提问：'+c.public.query)]:[]),p('参考答案：'+(ref.answer??'见来源与量规')),p('参考解析：'+(ref.explanation||'待教师核对来源与量规')),run?plainResult(run.trials[0]?.result):p('尚无助教运行记录；被隔离或待核验的候选需先处理核验问题。'),fold('查看来源与定位',...(d.sources||[]).filter(s=>[...c.source_refs,...(c.advisory?.source_ids||[])].includes(s.id)).map(s=>el('div',{},p(Object.entries(s.locator||{}).map(([k,v])=>k+'：'+(typeof v==='object'?JSON.stringify(v):v)).join('；')),p(s.text)))));
   if(!overview.frozen){const notes=input('审核依据 '+c.id,''),status=select('审核结论 '+c.id,[['needs_revision','需修订'],['approved','批准当前参考'],['rejected','拒绝']],'needs_revision');
    const save=button('保存审核',async()=>{await api(base+'/'+d.id+'/cases/'+c.id+'/review',{expected_digest:c.digest,notes:notes.value,status:status.value});await refresh();});
    const query=input('修订问题 '+c.id,c.public.query),explanation=el('textarea',{'aria-label':'修订解释 '+c.id,rows:3},c.public.explanation);
    entry.append(field('审核依据',notes),field('审核结论',status),save,fold('修订候选',field('修订问题',query),field('修订解释',explanation),button('保存新修订',async()=>{await api(base+'/'+d.id+'/cases/'+c.id+'/revise',{expected_digest:c.digest,query:query.value,explanation:explanation.value});await refresh();}),button('重新核验',async()=>{await api(base+'/'+d.id+'/cases/'+c.id+'/verify',{});await refresh();})));
   }else entry.append(p('只读研究快照：可导出审核表填写意见；修改需另建检查。','fine'));
   entry.append(fold('高级详情：核验、量规与运行轨迹',el('pre',{},JSON.stringify({case_id:c.id,source_refs:c.source_refs,validation:c.validation,advisory:c.advisory,expected:c.oracle.expectation,reference:ref,trials:run?.trials||[]},null,2))));caseBody.append(entry);
  }
  if(pages>1){const prev=button('上一页案例',async()=>{pageIndex--;renderCases();}),next=button('下一页案例',async()=>{pageIndex++;renderCases();});if(pageIndex===0)disable(prev,'已到第一页');if(pageIndex===pages-1)disable(next,'已到最后一页');caseBody.append(el('div',{class:'row'},prev,next));}
 };
 caseFilter.addEventListener('change',()=>{pageIndex=0;renderCases();});caseSearch.addEventListener('input',()=>{pageIndex=0;renderCases();});casesPanel.append(field('案例范围',caseFilter),field('搜索题目、理由或知识点',caseSearch),caseBody);renderCases();root.append(casesPanel);
 const advanced=fold('高级详情（维护者与研究）',p('A/B/C对照、任务恢复和原始轨迹供维护与研发使用。日常教学只需处理上方摘要和审核事项。','fine'),p('当前工作空间用量与费用估算在“模型任务”查看；独立研究归档的费用见交付报告，归档不会导入该空间账本。下列 real_model_calls 只含助教调用，生成与核验另计。','fine'),table(['指标','结果'],Object.entries(report.metrics).map(([k,v])=>[k,v===null?'暂无':String(v)])));
 for(const j of jobs)advanced.append(el('section',{},p('任务 '+j.id.slice(0,8)+' · '+(statuses[j.status]||j.status)),...(j.error?[p(j.error)]:[]),fold('任务技术记录',el('pre',{},JSON.stringify(j.progress,null,2))),...(!overview.frozen&&['interrupted','cancelled','failed'].includes(j.status)?[button('显式恢复任务',async()=>{await api('/api/teacher/plugin-jobs/'+j.id+'/resume',{});await refresh();})]:[])));
 const rerun=button('重新运行已核验案例',async()=>{await api(base+'/'+d.id+'/run',{idempotency_key:crypto.randomUUID()});await refresh();}),freeze=button('冻结研究快照',async()=>{await api(base+'/'+d.id+'/freeze',{});await refresh();});
 if(overview.frozen){disable(rerun,'研究快照已冻结');disable(freeze,'已经冻结');}
 advanced.append(el('div',{class:'row'},rerun,freeze),p('冻结仅固定研究记录，不代表教师批准或课程发布。','fine'),fold('原始导出',button('导出公开输入',async()=>download('evaluation-inputs.json',await api(base+'/'+d.id+'/export'))),button('导出评测器参考与轨迹',async()=>download('evaluation-evaluator-private.json',await api(base+'/'+d.id+'/export?view=evaluator'))),button('导出六项指标报告',async()=>download('evaluation-report.json',report)),p('含参考的导出仅供授权评测人员，不进入学生资料。','fine')));
 advanced.append(fold('A/B/C研究对照',p('模板、固定覆盖和反馈选题的对照属于研发实验。三种子共270条候选名额，真实模式会产生相应调用。'),button('建立三组对照实验',async()=>{await api('/api/teacher/evaluation-experiments',{course_id:course,mode:state.mode||'offline'});toast('已建立，尚未执行。');await refresh();}),...experiments.map(e=>el('div',{},p('对照实验 '+e.id.slice(0,8)+' · '+(statuses[e.status]||e.status)),e.status==='completed'?p('已完成；新研究请另建实验。','fine'):button('运行对照实验',async()=>{await api('/api/teacher/evaluation-experiments/'+e.id+'/run',{idempotency_key:'experiment-'+e.id});await refresh();})))));
 advanced.append(fold('全部助教轨迹',...(d.runs||[]).map(r=>fold((names[r.concept_id]||r.concept_id)+' · '+(scenarios[r.scenario]||r.scenario)+' · '+(r.variant==='normal'?'正常对照':'异常场景'),plainResult(r.trials[0]?.result),fold('两次工具与状态记录',el('pre',{},JSON.stringify(r.trials,null,2)))))));
 root.append(advanced);
}
