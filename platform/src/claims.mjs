import {attachServerExcerpts,validateGrounding} from './grounding.mjs';
export function validateClaims(parsed,citations){
 if(!['supported','partial','insufficient'].includes(parsed.answer_status)||!Array.isArray(parsed.claims)||!Array.isArray(parsed.unresolved)||parsed.unresolved.some(x=>typeof x!=='string'||x.length>2000))throw new Error('Invalid claim response');
 if(parsed.answer_status==='insufficient'){
  if(parsed.claims.length)throw new Error('Insufficient answer cannot assert facts');
  return {model_answer:'当前课程资料不足以支持可靠回答。请补充原始资料、限定问题或请教师核对。',model_answer_status:'insufficient',model_claims:[],model_citation_ids:[],model_evidence_quotes:[],uncertainty:'insufficient_evidence_after_review',model_answer_review:'abstention_enforced_or_requested'};
 }
 if(!parsed.claims.length||parsed.claims.length>8||(parsed.answer_status==='partial'&&!parsed.unresolved.length))throw new Error('Supported or partial answer needs claims and explicit gaps');
 const claims=parsed.claims.map((claim,index)=>{
  if(typeof claim.text!=='string'||!claim.text.trim()||claim.text.length>2000||!Array.isArray(claim.citation_ids)||!claim.citation_ids.length||new Set(claim.citation_ids).size!==claim.citation_ids.length)throw new Error('Uncited or invalid claim');
  const grounded=attachServerExcerpts({answer:claim.text,citation_ids:claim.citation_ids},citations);if(!validateGrounding(grounded,citations).valid)throw new Error('Claim references invalid evidence');
  return {index,text:claim.text,citation_ids:claim.citation_ids,source_excerpts:grounded.evidence_quotes,semantic_support:'pending_human_review'};
 });
 return {model_answer:claims.map(c=>c.text).join('\n')+(parsed.unresolved.length?'\n待核实：'+parsed.unresolved.join('；'):''),model_answer_status:parsed.answer_status,model_claims:claims,model_citation_ids:[...new Set(claims.flatMap(c=>c.citation_ids))],model_evidence_quotes:claims.flatMap(c=>c.source_excerpts),unresolved_questions:parsed.unresolved,claim_integrity:'current_turn_source_identifiers_verified; semantic_entailment_not_automatically_proven',excerpt_selection:'server_representative_excerpts_not_model_verbatim_claims',model_answer_review:'pending_human_entailment_review'};
}
