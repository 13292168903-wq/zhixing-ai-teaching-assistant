const TERMS={列表:['list','lists'],浅拷贝:['copy','shallow'],循环:['range','loop'],边界:['range','stop'],默认参数:['default','argument'],返回值:['return','None'],输出:['print'],训练:['training'],推理:['inference'],验证集:['validation'],测试集:['test'],数据划分:['dataset','split'],过拟合:['overfitting'],泛化:['generalization'],幻觉:['hallucination'],事实核验:['hallucination','factual'],模型:['model']};
export function tokens(text){const s=text.toLowerCase();const out=s.match(/[a-z_][a-z_0-9]*|\d+(?:\.\d+)?/g)||[];for(const run of s.match(/[\u3400-\u9fff]+/g)||[]){if(run.length===1)out.push(run);else for(let i=0;i<run.length-1;i++)out.push(run.slice(i,i+2));}return out;}
export function searchChunks(rows,query,{min_score=1.5,extra_terms={}}={}){
 const expanded=[query,...Object.entries({...TERMS,...extra_terms}).filter(([key])=>query.toLowerCase().includes(key.toLowerCase())).flatMap(([,words])=>words)].join(' ');
 const terms=[...new Set(tokens(expanded))];if(!terms.length)return [];
 const docs=rows.map(row=>{const list=tokens(row.text);const counts=new Map();for(const t of list)counts.set(t,(counts.get(t)||0)+1);return {row,counts,length:list.length};});
 const avg=docs.reduce((n,d)=>n+d.length,0)/Math.max(1,docs.length)||1;
 const df=new Map(terms.map(t=>[t,docs.filter(d=>d.counts.has(t)).length]));
 return docs.map(d=>({...d.row,score:terms.reduce((sum,t)=>{const f=d.counts.get(t)||0;if(!f)return sum;const idf=Math.log(1+(docs.length-df.get(t)+0.5)/(df.get(t)+0.5));return sum+idf*f*2.2/(f+1.2*(0.25+0.75*d.length/avg));},0)})).filter(d=>d.score>=min_score).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).slice(0,4);
}
export function retrieveMaterials(data,store,courseId,query,{preview=false,config={}}={}){
 const rows=store.db.prepare(`SELECT c.id,c.text,c.locator,m.id AS material_id,m.source_url,m.version,m.status FROM material_chunks c JOIN materials m ON m.id=c.material_id WHERE c.course_id=? AND m.id NOT IN (SELECT old_id FROM material_supersessions) AND m.status ${preview?"!= 'rejected'":"= 'approved'"}`).all(courseId);
 const hits=searchChunks(rows,query,config),course=data.courses.get(courseId);
 const concept=course.concepts.find(c=>course.cards.concepts[c.id].aliases.some(a=>query.toLowerCase().includes(a.toLowerCase())));
 return {query,answer:hits.length?'课程资料中找到以下相关片段，请结合原文及适用条件核对：\n'+hits.map(h=>h.text.slice(0,350)).join('\n\n'):'当前课程资料不足以支持回答。请补充资料、限定问题或请教师核对。',
  citations:hits.map(h=>{const locator=JSON.parse(h.locator),url=new URL(h.source_url);if(locator.anchor)url.hash=locator.anchor;return {id:h.id,url:url.href,excerpt:h.text,locator,material_id:h.material_id,material_version:h.version,review_status:h.status};}),concept_id:concept?.id||null,
  uncertainty:hits.length?'retrieval_candidates_not_verified_entailment':'insufficient_evidence',next_action:hits.length?'assign_diagnostic':'ask_clarification',retrieval_method:'course_scoped_bm25',
  material_scope:preview?'teacher_draft_preview':'approved_materials',source_content_is_untrusted_data:true};
}
