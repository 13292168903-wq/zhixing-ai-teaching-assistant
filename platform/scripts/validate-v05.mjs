import path from 'node:path';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createApp} from '../src/server.mjs';
import {ROOT} from '../src/data.mjs';
import {grade} from '../src/pedagogy.mjs';
import {retrieveMaterials} from '../src/retrieval.mjs';
import {retrieveMaterials as previousRetrieve} from '../../output/pilot-v0.5/baseline/src/retrieval.mjs';
import {spawnSync} from 'node:child_process';
import {pythonBinary} from '../src/materials.mjs';
process.env.TUTOR_ENABLE_REAL_MODEL='0';
const out=path.resolve(ROOT,'../output/pilot-v0.5'),app=await createApp({port:0,defaultEngine:'local'});
try{
 const queries=[
  ['python_pilot','b = a 和 b = a.copy() 有什么区别？'],['python_pilot','浅拷贝会复制嵌套列表吗？'],['python_pilot','为什么不建议使用可变对象作为默认参数？'],['python_pilot','本校明天 Python 考试在哪个教室？'],
  ['ai_literacy_pilot','训练与推理有什么区别？'],['ai_literacy_pilot','验证集与测试集分别有什么用途？'],['ai_literacy_pilot','训练准确率高，是否意味着泛化能力好？'],['ai_literacy_pilot','生成式 AI 给出的参考文献能否直接使用？']
 ];
 const oldRuns=JSON.parse(readFileSync(path.resolve(ROOT,'../output/pilot-v0.4/reports/controlled-improvement.json'),'utf8'));
 const oldInputs=readFileSync(path.resolve(ROOT,'../output/pilot-v0.4/datasets/inputs.jsonl'),'utf8').trim().split(/\r?\n/).map(JSON.parse);
 for(const run of oldRuns)for(const phase of ['baseline_development','baseline_validation'])for(const fail of run[phase].results.filter(r=>!r.pass&&r.kind==='retrieval')){const c=oldInputs.find(c=>c.id===fail.id);queries.push([c.course_id,c.input.query,c.id]);}
 const retrieval=queries.map(([course,query,exposed_case])=>{const before=previousRetrieve(app.data,app.store,course,query,{preview:true}),after=retrieveMaterials(app.data,app.store,course,query,{preview:true});return {course,query,exposed_case,partition:'development_regression_known_reviewed_queries',before:before.citations.map(c=>({id:c.id,section:c.locator.section,url:c.url})),after:after.citations.map(c=>({id:c.id,section:c.locator.section,url:c.url,excerpt:c.excerpt})),scope:after.evidence_scope,semantic_relevance:'pending_human_review',baseline_note:'old retrieval algorithm over current corpus; not exact v0.4 corpus comparison'};});
 const targets=[[['Assignment and reference'],['Shallow copy','copy —']],[['Shallow copy','copy —']],[['Default Argument']],[],[['training'],['inference']],[['validation set'],['test set']],[['overfitting'],['generalization']],[['hallucination','reference verification']],[['Assignment and reference']],[['range()']],[['Default Argument']],[['training'],['inference']],[['validation set'],['test set']],[['overfitting']]];
 retrieval.forEach((r,i)=>{const expected=targets[i];r.section_coverage_check={expected_groups:expected,passed:expected.length?expected.every(group=>group.some(key=>r.after.some(c=>c.section?.toLowerCase().includes(key.toLowerCase())))):r.after.length===0,scope:'known-development-section-coverage-only; no semantic or generalization claim'};});
 const references=[...app.data.items.values()].filter(i=>i.course_id.endsWith('_pilot')).map(item=>{const result=grade(app.data,item,{answer:item.reference.answer,explanation:item.reference.explanation},{check_explanation:true});return {id:item.id,explanation_status:result.explanation_status,passed:result.explanation_status==='provisional_support',open_score_stays_null:item.assessment_mode!=='open'||result.score===null};});
 writeFileSync(path.join(out,'reports/development-regression.json'),JSON.stringify({retrieval,references,v04_holdout_read:false,real_calls:0},null,2));
 const codeChecks=[...app.data.items.values()].filter(i=>i.course_id==='python_pilot').map(item=>{const code=item.prompt.match(/```python\s*\n([\s\S]*?)```/)?.[1];if(!code)throw new Error('Missing authored program');const r=spawnSync(pythonBinary(),['-I','-c',code],{encoding:'utf8',windowsHide:true,timeout:3000});return {id:item.id,passed:r.status===0&&(r.stdout||'').replace(/\r/g,'').trim()===item.reference.answer,expected:item.reference.answer,observed:(r.stdout||'').trim(),scope:'fixed_project_authored_programs_only'};});
 writeFileSync(path.join(out,'reports/python-reference-checks.json'),JSON.stringify(codeChecks,null,2));if(codeChecks.some(r=>!r.passed))throw new Error('Authored Python reference check failed');
 // New candidate families. No v0.4 holdout references are read, no final test is opened.
 const families={python:[
 ['名字与对象的绑定',['两个变量指向一个列表时，修改元素会怎样？','赋给第二个名字之后为什么双方都能看到列表变化？']],
 ['外层与内层',['复制列表后修改里面的小列表会影响原对象吗？','仅复制外层容器是否让每个子对象都独立？']],
 ['默认值的生命周期',['缺省列表是定义函数时创建还是调用时创建？','省略实参连续调用，列表内容为什么会累积？']],
 ['返回结果的用途',['函数交还的结果可以参与加法吗？','return 的结果怎样传给调用代码？']],
 ['终止边界',['range 的终止值为何不输出？','循环序列的右边界是否包含？']],
 ['共享与重新绑定',['重新给变量赋新列表会改变旧列表吗？','改变量绑定与改对象元素如何区分？']],
 ['None 哨兵',['怎样避免省略列表参数时共享对象？','使用 None 默认值后在哪里创建列表？']],
 ['局部创建',['函数体里新建列表为何每次独立？','列表创建语句每次执行会得到什么？']],
 ['循环跳过',['continue 会跳过本轮哪些语句？','continue 和 break 对循环的影响相同吗？']],
 ['无数据源',['本校明天 Python 考试在哪个教室？','Python 考试的监考老师是谁？']],
 ['列表复制方法',['list.copy() 建立了哪一层的副本？','完整切片是否递归复制子列表？']],
 ['负步长',['负步长的序列在何时停止？','倒序 range 怎样判断终止？']],
 ['函数结束',['执行 return 后还会执行函数内后续语句吗？','没有显式 return 的函数返回什么？']],
 ['打印与返回',['屏幕输出和交给调用者的值如何区分？','print 返回的值是否等于它显示的内容？']],
 ['课程隔离',['训练集用于调整模型参数吗？','验证集是否参与模型选择？']],
 ['字面输出核验',['输出正确但解释说浅拷贝递归复制，是否需复查？','学生预测值正确但理由错误，该如何反馈？']],
 ['提示证据',['提示后完成能直接证明独立掌握吗？','使用完整解析后应怎样复查？']],
 ['有效引文',['片段来自官方文档就一定支持结论吗？','引用了错误章节能否接受回答？']],
 ['资料缺失',['Python 课程本周出勤名单有哪些？','这门课下次课堂在哪栋楼？']],
 ['混合请求',['解释默认参数；另外告诉我明天考试教室。','说明浅拷贝；同时给出监考人姓名。']]
 ],ai_literacy:[
 ['训练推理边界',['学习模型参数与应用已有参数有何区别？','计算损失并更新权重属于哪个阶段？']],
 ['验证用途',['调参时该看哪份留出数据？','挑学习率为什么不能一直用最终测验？']],
 ['泛化证据',['训练样本上高分为何不保证新样本也高分？','死记训练记录为何不代表泛化？']],
 ['文献真实性',['生成的论文题目如何核实是否存在？','模型列的 DOI 与作者能直接相信吗？']],
 ['上下文变化',['添加课件能证明更新权重吗？','回答变好是否足以证明重新训练？']],
 ['数据相关性',['同一人的相关记录应分组吗？','模板变体放进不同分区有何风险？']],
 ['过拟合诊断',['训练和验证表现差距大需要检查什么？','训练好而验证差是否只有一个原因？']],
 ['表达可靠性',['自信语气是不是事实证据？','措辞肯定是否等于结论有依据？']],
 ['检索局限',['检索增强会彻底消除生成错误吗？','引用片段不相关时该怎样处理？']],
 ['校务边界',['AI 通识考试明天在哪间教室？','本校 AI 通识课监考人是谁？']],
 ['批量推理',['权重不变批量预测是否成为训练？','新数据很多但不学习参数是什么过程？']],
 ['冻结评价',['何时进行最终测试才保留独立性？','看到最终测试后继续调参有何影响？']],
 ['早停选择',['早停的判断应看验证还是测试表现？','用测试分数挑训练轮数会怎样？']],
 ['分布外推',['一个学校的效果能外推所有学校吗？','目标学校分布不同应怎样验证？']],
 ['课程隔离',['Python 可变默认参数何时求值？','列表浅拷贝会递归复制吗？']],
 ['理由核查',['答对训练却声称提示必改权重，应如何处理？','答案正确但解释矛盾能否证明掌握？']],
 ['提示掌握',['用提示后答对应该记录什么？','开放题初筛支持能否当正式成绩？']],
 ['证据支持',['链接可访问就证明原文支持结论吗？','找到论文后还要核对什么？']],
 ['校内缺失',['AI 通识本周出勤记录有哪些？','这门课下次课堂在哪栋楼？']],
 ['混合问题',['说明训练与推理；另外给出明天考试教室。','解释过拟合；同时告诉我监考人姓名。']]
 ]};
 const records=[];for(const [course,list]of Object.entries(families))list.forEach(([name,questions],i)=>questions.forEach((query,j)=>records.push({id:`P05-${course}-${String(i+1).padStart(2,'0')}-${j+1}`,course_id:course+'_pilot',family_id:`P05-${course}-family-${i+1}`,family_name:name,partition:i<10?'dev':i<15?'validation':'test',input:{query},kind:'retrieval_or_teaching_policy_candidate',provenance:'project_authored_synthetic_candidate_not_teacher_independent_test',review_status:'pending',reference:{review_dimensions:['evidence_relevance','evidence_sufficiency','course_scope','state_and_feedback_consistency'],expected_boundary:[9,14,18].includes(i)?'insufficient_course_evidence':'human_adjudication_required'}})));
 // Merge the known copy-recursion paraphrases into one leakage group. Move the
 // distinct continue family to validation to retain course-level 20/10/10 counts.
 for(const r of records){r.authored_family_id=r.family_id;
  if(r.course_id==='python_pilot'&&r.family_id==='P05-python-family-11'){r.family_id='P05-python-family-2';r.partition='dev';}
  if(r.course_id==='python_pilot'&&r.family_id==='P05-python-family-9')r.partition='validation';
  r.reference.expected_concept=r.family_name;r.reference.required_behavior=r.reference.expected_boundary==='insufficient_course_evidence'?'说明当前课程资料不足，不编造校务信息或跨课事实。':'依据课程资料回答该任务家族的问题；区分观察、判断和适用条件；引用必须支持具体结论。';
 }
 const dir=path.join(out,'datasets');for(const sub of ['dev','validation','evaluator_private/holdout'])mkdirSync(path.join(dir,sub),{recursive:true});
 const inputs=records.map(({reference,...r})=>r);writeFileSync(path.join(dir,'inputs.jsonl'),inputs.map(JSON.stringify).join('\n')+'\n');
 for(const partition of ['dev','validation','test'])writeFileSync(path.join(dir,partition==='test'?'evaluator_private/holdout/references.jsonl':partition+'/references.jsonl'),records.filter(c=>c.partition===partition).map(c=>JSON.stringify({id:c.id,reference:c.reference})).join('\n')+'\n');
 const overlap=records.some(r=>records.some(q=>q.family_id===r.family_id&&q.partition!==r.partition));
 writeFileSync(path.join(dir,'quality.json'),JSON.stringify({total:records.length,counts:Object.fromEntries(['dev','validation','test'].map(p=>[p,records.filter(r=>r.partition===p).length])),authored_families:40,leakage_groups:39,known_paraphrase_groups_merged:1,family_cross_partition:Number(overlap),sha256:createHash('sha256').update(JSON.stringify(records)).digest('hex'),reference_status:'human_adjudication_required; qualitative rubrics, no fabricated objective scores',semantic_near_duplicate_review:'pending; shared concepts do not by themselves establish independent transfer',final_test_opened:false,v04_holdout_read:false},null,2));
 const inputCandidates=inputs.filter(c=>c.partition!=='test').map(c=>({id:c.id,partition:c.partition,query:c.input.query,...retrieveMaterials(app.data,app.store,c.course_id,c.input.query,{preview:true}),semantic_judgment:'pending_human_review'}));
 writeFileSync(path.join(out,'reports/new-candidate-retrieval.json'),JSON.stringify(inputCandidates,null,2));
 console.log(JSON.stringify({reference_screen_passed:references.filter(r=>r.passed).length,total_references:references.length,reviewed_query_regressions:retrieval.length,new_candidates:records.length,holdout_opened:false}));
 if(references.some(r=>!r.passed||!r.open_score_stays_null)||overlap)process.exitCode=1;
}finally{await app.close();}
