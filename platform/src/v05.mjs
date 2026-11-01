import {conceptCandidates} from './language.mjs';
import {uid} from './store.mjs';
const EXPLANATIONS={
 '001':'这是推理：模型已经训练完成，使用已有参数对新邮件进行预测。题干没有给出计算损失并更新参数的过程。',
 '002':'这是训练：带标签样本产生损失，再据此更新模型参数。产生输出本身不能区分训练与推理，关键是是否进行参数学习。',
 '003':'不能。补充资料属于上下文输入，模型可以利用上下文回答，但这不等于已执行权重更新，也不证明信息被永久保存。',
 '004':'不能。输入上下文、生成随机性或部署版本变化都可能改变输出。需要训练记录或模型版本证据才能确认重新训练。',
 '005':'不是。处理数量不决定是否训练；题干明确权重不变，因此仍是批量推理。',
 '009':'应参考验证集选择学习率。最终测试留在配置冻结之后评价，反复用它挑配置会使它参与开发选择。',
 '010':'不能。测试结果已经影响提示词选择，同一测试不再是未见评价，需要新的独立测试并记录此前选择过程。',
 '011':'同一个人的相关记录可能共享特征，逐行随机划分会导致相关样本泄漏。应按人或相关组划分，再检查分布和任务需求。',
 '012':'训练集用于拟合参数，验证集用于比较和选择配置，最终测试集用于方案冻结后的最终评价。三者角色不能在反复调优时混用。',
 '013':'不能。只换变量名仍属于同一模板或题目家族的近重复，不能独立证明新题型泛化；应按家族隔离评价。',
 '017':'值得排查：训练与独立验证差距较大是过拟合线索，但并非唯一诊断，还需检查分布变化、标签质量和划分方式。',
 '018':'训练分数可能反映对训练样本细节的记忆；泛化需要在未参与拟合与选择的适当独立数据上检验。',
 '019':'早停通常依据验证表现的变化选择停止时点。最终测试不应反复参与早停选择，否则会破坏最终评价的独立性。',
 '020':'不能。来源学校与目标学校的数据分布可能不同，需要在目标分布和适用条件下验证，不能无条件外推。',
 '021':'不保证。更复杂的模型可能更贴合训练细节，也可能过拟合，应比较独立验证表现并控制数据和训练条件。',
 '024':'不足。需要核对原始来源及作者、标题、年份、DOI等元数据，进一步检查原文是否支持具体结论；规范格式本身不是存在性证据。',
 '025':'不能。自信语气是表达特征，不是事实证据；应找到独立来源并核验相关断言。',
 '026':'不能保证。检索可能返回无关或过时资料，生成阶段也可能产生无据内容，仍需核对原文是否支持结论。',
 '027':'说明当前资料不足，不能编造日期；请求课程通知等资料，或建议向任课教师及指定教务渠道核实。',
 '028':'不能。网页存在只说明链接可访问，应进一步核对原文、版本及适用范围是否支持回答中的具体结论。'
};
const ALIASES={
 '不能':['不能','不足','不可以','不保证'], '不是':['不是','仍是推理'],
 '推理':['推理','预测阶段'], '训练':['训练','学习阶段'],
 '使用已训练模型对新输入作预测':['使用已训练模型对新输入作预测','已有参数对新邮件进行预测','固定参数预测','已训练的模型进行预测'],
 '依据数据和损失更新参数':['依据数据和损失更新参数','损失更新模型参数','损失更新权重'],
 '上下文使用不等于权重更新':['上下文使用不等于权重更新','上下文输入','不等于已执行权重更新'],
 '验证表现':['验证表现','验证集表现','验证集的变化'], '验证集':['验证集','验证数据'],
 '最终测试不用于反复选择':['最终测试不用于反复选择','最终测试不应反复参与早停选择','不根据测试集选择'],
 '最终测试不参与选择':['最终测试不参与选择','最终测试留在配置冻结之后评价','不使用测试集调参'],
 '训练分数可能记忆样本':['训练分数可能记忆样本','训练样本细节的记忆','记住训练数据'],
 '需要独立数据':['需要独立数据','独立数据上检验','独立验证'],
 '需要目标分布验证':['需要目标分布验证','目标分布和适用条件下验证'],
 '拟合参数':['拟合参数','学习参数'],'选择配置':['选择配置','调参'],'冻结后最终评价':['冻结后最终评价','冻结后的最终评价']
};
export function upgradePack(original){
 const pack=structuredClone(original);pack.manifest.version='0.5.0';pack.manifest.schema_version='0.5.0';
 for(const [id,aliases]of Object.entries({splits:['training set','validation set','test set','dataset','split','leakage'],overfit:['overfitting','generalization','regularization'],hallucination:['hallucination','citation','reference verification']}))
  pack.cards.concepts[id]&&(pack.cards.concepts[id].aliases=[...new Set([...pack.cards.concepts[id].aliases,...aliases])]);
 for(const item of pack.items){item.course_version='0.5.0';
  if(item.course_id.startsWith('ai_literacy'))item.reference.explanation=EXPLANATIONS[item.id.slice(-3)]||item.reference.explanation;
  if(item.id.endsWith('python-021'))item.prompt=item.prompt.replace('有人声称：屏幕上打印出的值一定就是函数返回给调用者的值。请结合下面程序给出实际输出并纠正这一说法。','阅读程序，写出输出，并说明 return 如何把结果交给调用者以及结束当前函数执行。');
  item.reference.point_groups=item.reference.required_points.map(point=>({label:point,acceptable:[point,...(ALIASES[point]||[])]}));
  // Whole reference explanations are accepted only as a complete, item-specific expression.
  for(const group of item.reference.point_groups)group.acceptable.push(item.reference.explanation);
  item.diagnostic_probe=item.course_id.startsWith('python')?'请只针对本题代码，逐行跟踪相关对象、控制流或返回值，并核对你的解释。':'请针对本题情境说明判断依据，并区分已有证据和仍待确认的事项。';
  item.checks={...item.checks,human_review:'pending_after_revision',answer:'reference_regression_required'};
 }
 // Equivalent expressions for the reported Python failures, grouped by necessary facts.
 const groups={
 '004':[['值相等',['值相等','内容相同']],['身份与值不同',['不是同一对象','不同对象','值相等与对象相同是不同的判断']]],
 '005':[['重复引用',['重复','乘法']],['内层共享',['共享','内层对象引用','同一内层对象']]],
 '010':[['起终点相同',['起终点相同','起点等于终点','起点和终点相同']],['空序列',['空序列','没有元素','不会执行']]],
 '012':[['跳过当前轮',['continue','跳过当前轮','跳过本轮']]],
 '018':[['每次新建',['每次调用时发生','每次调用新建','每次调用都创建','每次执行创建']]]};
 for(const item of pack.items.filter(i=>i.course_id.startsWith('python'))){const g=groups[item.id.slice(-3)];if(g)item.reference.point_groups=g.map(([label,acceptable])=>({label,acceptable:[...acceptable,item.reference.explanation]}));}
 return pack;
}
export function refreshConceptDrafts(materials){
 let updated=0;for(const course of materials.data.courses.values())if(course.material_retrieval)for(const material of materials.list(course.course_id)){
  const details=materials.get(material.id),human=new Set(details.concept_candidates.filter(c=>c.origin==='human_revision').map(c=>c.concept_id));
  materials.store.db.prepare("DELETE FROM concept_drafts WHERE material_id=? AND json_extract(data,'$.origin')!='human_revision'").run(material.id);
  for(const draft of conceptCandidates(course,details.chunks)){if(human.has(draft.concept_id))continue;
   materials.store.db.prepare("DELETE FROM concept_drafts WHERE material_id=? AND json_extract(data,'$.concept_id')=? AND json_extract(data,'$.origin')!='human_revision'").run(material.id,draft.concept_id);
   materials.store.db.prepare('INSERT INTO concept_drafts VALUES(?,?,?,?,?)').run(uid(),course.course_id,material.id,JSON.stringify(draft),'pending');updated++;
  }
 }return updated;
}
