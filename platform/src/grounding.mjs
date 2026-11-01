export function quoteSpans(id,text){
 const sentences=String(text).match(/[^。！？.!?\n]+[。！？.!?]?/g)||[String(text)];
 return sentences.map(s=>s.trim()).filter(s=>s.length>12&&!/^(See |Click |Read more)/i.test(s)).slice(0,3).map((s,i)=>({id:id+'-q'+(i+1),quote:s.slice(0,180)}));
}
export function selectedQuotes(parsed,citations){
 if(!Array.isArray(parsed.evidence_quote_ids))return parsed.evidence_quotes;
 return parsed.evidence_quote_ids.map(id=>{const c=citations.find(c=>c.quote_spans?.some(q=>q.id===id)),span=c?.quote_spans.find(q=>q.id===id);return span?{citation_id:c.id,quote:span.quote,quote_id:id}:{citation_id:'invalid',quote:''};});
}
export function attachServerExcerpts(parsed,citations){
 if(parsed.evidence_quotes!==undefined||parsed.evidence_quote_ids!==undefined)return parsed;
 const evidence_quotes=(parsed.citation_ids||[]).flatMap(id=>{const c=citations.find(c=>c.id===id),span=(c?.quote_spans||quoteSpans(id,c?.excerpt||''))[0];return span?[{citation_id:id,quote:span.quote,quote_id:span.id,selection:'server_representative_excerpt_for_review_not_model_claim'}]:[];});
 return {...parsed,evidence_quotes};
}
export function validateGrounding(parsed,citations){
 if(typeof parsed.answer!=='string'||!Array.isArray(parsed.citation_ids)||parsed.citation_ids.some(id=>!citations.some(c=>c.id===id))||(!parsed.citation_ids.length&&citations.length))return {valid:false,reason:'invalid_citation_ids'};
 const quotes=selectedQuotes(parsed,citations);if(!Array.isArray(quotes))return {valid:false,reason:'missing_quotes'};
 for(const q of quotes){const source=citations.find(c=>c.id===q.citation_id);if(typeof q.quote!=='string'||!q.quote.trim()||q.quote.length>240||!parsed.citation_ids.includes(q.citation_id)||!source?.excerpt.includes(q.quote))return {valid:false,reason:'quote_not_exact_continuous_source_span'};}
 if(parsed.citation_ids.some(id=>!quotes.some(q=>q.citation_id===id)))return {valid:false,reason:'citation_missing_quote'};
 return {valid:true,scope:'span_identity_only; entailment_pending_human_review'};
}
