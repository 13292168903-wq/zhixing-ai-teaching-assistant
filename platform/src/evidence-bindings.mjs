import {createHash} from 'node:crypto';
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function evidenceDigest(source){return digest({id:source.id,text:source.text,version:source.version||null,locator:source.locator||null});}
export function buildEvidenceCatalog(sources){
 if(new Set(sources.map(s=>s.id)).size!==sources.length)throw Error('Duplicate source IDs');
 return sources.map((s,i)=>({handle:'E'+(i+1),source_id:s.id,source_digest:evidenceDigest(s),version:s.version||null,locator:s.locator||{},text:s.text.slice(0,1000),start:0,end:Math.min(1000,s.text.length),offset_unit:'utf16_code_unit',excerpt_truncated:s.text.length>1000}));
}
export function publicEvidenceCatalog(catalog){return catalog.map(({handle,text,version,locator,excerpt_truncated})=>({handle,text,version,locator,excerpt_truncated}));}
export function resolveEvidence(handles,catalog){
 if(!Array.isArray(handles)||new Set(handles).size!==handles.length)throw Error('Evidence handles must be unique');
 return handles.map(handle=>{const e=catalog.find(e=>e.handle===handle);if(!e)throw Error('Unknown evidence handle');return structuredClone(e);});
}
export function candidateSpans(text){
 if(!text.trim())return [];
 const spans=[{id:'S0',start:0,end:text.length,text,offset_unit:'utf16_code_unit'}];
 for(const m of text.matchAll(/[^\n。！？]+[。！？]?/gu)){const value=m[0].trim();if(!value||value===text)continue;const start=m.index+m[0].indexOf(value);spans.push({id:'S'+spans.length,start,end:start+value.length,text:value,offset_unit:'utf16_code_unit'});if(spans.length===9)break;}
 return spans;
}
export function resolveCandidateSpan(id,spans,text){
 if(id==='NONE')return null;
 const span=spans.find(s=>s.id===id);if(!span||text.slice(span.start,span.end)!==span.text)throw Error('Candidate span does not match original text');return structuredClone(span);
}
export function evidenceStillMatches(binding,snapshot){const source=snapshot.sources.find(s=>s.id===binding.source_id);return !!source&&evidenceDigest(source)===binding.source_digest&&source.text.slice(binding.start,binding.end)===binding.text;}
