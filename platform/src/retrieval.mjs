import {tokens,expansions,phraseMatch,sectionText,VOCABULARY_VERSION} from './language.mjs';
import {quoteSpans} from './grounding.mjs';
export {tokens} from './language.mjs';
export function searchChunks(rows,query,{min_score=1.5,extra_terms={}}={}){
 const phrases=expansions(query,extra_terms),expanded=[query,...phrases].join(' ');
 const terms=[...new Set(tokens(expanded))];if(!terms.length)return [];
 const docs=rows.map(row=>{const list=tokens(row.text);const counts=new Map();for(const t of list)counts.set(t,(counts.get(t)||0)+1);return {row,counts,length:list.length};});
 const avg=docs.reduce((n,d)=>n+d.length,0)/Math.max(1,docs.length)||1;
 const df=new Map(terms.map(t=>[t,docs.filter(d=>d.counts.has(t)).length]));
 const ranked=docs.map(d=>{const title=sectionText(d.row),titleMatches=phrases.filter(p=>phraseMatch(title,p)),penalty=/^(exercises?|page summary|notes)$/i.test(title.trim())?0.5:1;
  const lexical=terms.reduce((sum,t)=>{const f=d.counts.get(t)||0;if(!f)return sum;const idf=Math.log(1+(docs.length-df.get(t)+0.5)/(df.get(t)+0.5));return sum+idf*f*2.2/(f+1.2*(0.25+0.75*d.length/avg));},0);
  return {...d.row,score:(lexical+titleMatches.length*8)*penalty,title_matches:titleMatches};
 }).filter(d=>d.score>=min_score).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
 // Comparison queries need coverage of each requested definition, not four side entries.
 const anchors=phrases.map(p=>ranked.find(r=>sectionText(r).trim().toLowerCase()===p.toLowerCase())).filter(Boolean);
 const sections=new Map();return [...new Map([...anchors,...ranked].map(r=>[r.id,r])).values()].filter(r=>{const key=(r.material_id||'')+'/'+sectionText(r),n=sections.get(key)||0;sections.set(key,n+1);return n<2;}).slice(0,4);
}
export function retrieveMaterials(data,store,courseId,query,{preview=false,config={}}={}){
 const rows=store.db.prepare(`SELECT c.id,c.text,c.locator,m.id AS material_id,m.source_url,m.version,m.status,m.filename,m.license FROM material_chunks c JOIN materials m ON m.id=c.material_id WHERE c.course_id=? AND m.id NOT IN (SELECT old_id FROM material_supersessions) AND m.status ${preview?"!= 'rejected'":"= 'approved'"}`).all(courseId);
 const administrative=/(教室|监考|考试.{0,8}(日期|时间|安排)|明天.{0,8}考|选课名单)/.test(query);
 const hasAdministrativeEvidence=rows.some(r=>/(教室|监考|考试安排|考试日期|exam schedule)/i.test(r.text));
 const partial=administrative&&!hasAdministrativeEvidence?query.split(/[；;。]|另外|同时|以及|并且/).filter(q=>!/(教室|监考|考试|选课名单)/.test(q)&&q.trim()).join(' '):'';
 const course=data.courses.get(courseId),hits=administrative&&!hasAdministrativeEvidence&&!partial?[]:searchChunks(rows,partial||query,{...config,extra_terms:{...course.retrieval_terms,...config.extra_terms}});
 const concept=course.concepts.find(c=>course.cards.concepts[c.id].aliases.some(a=>phraseMatch(query,a)));
 return {query,answer:hits.length?'课程资料中找到以下相关片段，请结合原文及适用条件核对：\n'+hits.map(h=>h.text.slice(0,350)).join('\n\n'):'当前课程资料不足以支持回答。请补充资料、限定问题或请教师核对。',
  citations:hits.map(h=>{const locator=JSON.parse(h.locator),url=new URL(h.source_url);if(locator.anchor)url.hash=locator.anchor;return {id:h.id,url:url.href,excerpt:h.text,locator,material_id:h.material_id,material_version:h.version,review_status:h.status,material_filename:h.filename,content_origin:h.license?.includes('Project-authored')?'project_authored_adaptation_pending_review':'source_snapshot',quote_spans:quoteSpans(h.id,h.text)};}),concept_id:concept?.id||null,
  evidence_scope:{administrative_source_available:hasAdministrativeEvidence,unsupported_administrative_request:administrative&&!hasAdministrativeEvidence,partial_answer_only:Boolean(partial)},vocabulary_version:VOCABULARY_VERSION,
  uncertainty:hits.length?'retrieval_candidates_not_verified_entailment':'insufficient_evidence',next_action:hits.length?'assign_diagnostic':'ask_clarification',retrieval_method:'course_scoped_bm25',
  material_scope:preview?'teacher_draft_preview':'approved_materials',source_content_is_untrusted_data:true};
}
