// Shared, versioned vocabulary used by retrieval and concept alignment.
export const VOCABULARY_VERSION='teaching-vocabulary-0.5.0';
export const TERMS={
 列表:['list','lists'],浅拷贝:['shallow copy','copy'],深拷贝:['deep copy','deepcopy'],赋值:['assignment','reference'],引用:['reference'],嵌套:['nested','compound'],
 循环:['range','loop'],边界:['range','stop'],默认参数:['default argument','default parameter'],可变:['mutable'],返回值:['return','None'],输出:['print'],
 训练:['training'],推理:['inference'],验证集:['validation set'],测试集:['test set'],数据划分:['dataset','split'],过拟合:['overfitting'],泛化:['generalization','overfitting','unseen'],
 幻觉:['hallucination'],事实核验:['hallucination','factual'],参考文献:['hallucination','citation','reference verification'],文献:['citation','hallucination'],生成式:['generative','hallucination'],模型:['model'],
 调参:['validation set'],留出:['test set'],死记:['overfitting'],权重:['training','parameter'],预报:['inference'],预估:['inference'],样本分区:['training set','validation set','test set'],复制一层:['shallow copy'],缺省:['default argument'],终止值:['range'],交还:['return'],
 copy:['list.copy','shallow copy','assignment','list'],两个名字:['assignment','reference','list'],容器:['list'],遍历:['range','loop'],等差整数:['range'],停止位置:['range'],省略实参:['default argument'],现成系统:['inference'],新问题:['inference'],挑选配置:['validation set'],最后留用:['test set'],记住旧样本:['overfitting'],未见样本:['generalization','overfitting']
};
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function phraseMatch(text,phrase){
 const value=String(phrase).toLowerCase().trim();if(!value)return false;
 return /[a-z]/i.test(value)?new RegExp('(?<![a-z0-9_])'+escape(value)+'(?![a-z0-9_])','i').test(String(text)):String(text).toLowerCase().includes(value);
}
export function tokens(text){const s=String(text).toLowerCase();const out=(s.match(/[a-z_][a-z_0-9]*|\d+(?:\.\d+)?/g)||[]).filter(t=>t.length>1&&!['python','ai'].includes(t));
 for(const run of s.match(/[\u3400-\u9fff]+/g)||[]){if(run.length===1)out.push(run);else for(let i=0;i<run.length-1;i++)out.push(run.slice(i,i+2));}return out;}
export function expansions(query,extra={}){return [...new Set(Object.entries({...TERMS,...extra}).filter(([key])=>phraseMatch(query,key)).flatMap(([,v])=>v))];}
export function sectionText(row){try{return (typeof row.locator==='string'?JSON.parse(row.locator):row.locator)?.section||'';}catch{return '';}}
export function conceptCandidates(course,chunks){
 const precise={defaults:['default argument','default parameter','默认参数','默认实参'],returns:['return','return value','Defining Functions','返回值'],lists:['list','lists','shallow copy','copy()','copy.copy','列表','浅拷贝'],range:['range(','range()','break','continue','loop','循环']};
 return course.concepts.map(c=>{const card=course.cards.concepts[c.id],aliases=precise[c.id]||[...new Set([...card.aliases,...card.aliases.flatMap(a=>expansions(a))])];
  const ranked=chunks.map(x=>{const body=String(x.text).replace(/Copy button/gi,''),title=sectionText(x);return {id:x.id,score:aliases.reduce((n,a)=>n+(phraseMatch(title,a)?10:0)+(phraseMatch(body,a)?Math.min(a.length,8):0),0)};}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
  return {concept_id:c.id,title:c.title,objective:c.learning_objective||'',summary:card.summary,evidence_chunk_ids:ranked.slice(0,4).map(x=>x.id),origin:'ranked_concept_alignment_pending_review',vocabulary_version:VOCABULARY_VERSION};
 }).filter(c=>c.evidence_chunk_ids.length);
}
