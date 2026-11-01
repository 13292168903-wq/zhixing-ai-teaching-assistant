import {failure,uid} from './store.mjs';
import {validateClaims} from './claims.mjs';

export const TUTOR_CHAT_SCHEMA={type:'object',properties:{course_claims:{type:'array',maxItems:5,items:{type:'object',properties:{text:{type:'string'},citation_ids:{type:'array',minItems:1,maxItems:2,items:{type:'string'}}},required:['text','citation_ids'],additionalProperties:false}},model_explanation:{type:'string'},unresolved:{type:'array',maxItems:4,items:{type:'string'}}},required:['course_claims','model_explanation','unresolved'],additionalProperties:false};

export function socialIntent(query){
 const q=String(query).toLowerCase().replace(/[\s，。！？!?、；;：:～~]/g,'');
 if(/^(你好|您好|嗨|哈喽|hello|hi|早上好|下午好|晚上好|在吗|老师好)(呀|啊|吗)?$/.test(q))return 'greeting';
 if(/^(谢谢|谢谢你|感谢|多谢|thanks|thankyou)(啦|了)?$/.test(q))return 'thanks';
 if(/^(再见|拜拜|bye|goodbye)$/.test(q))return 'farewell';
 if(/^(你好|您好|hello|hi)?(你是谁|你叫什么名字|你能做什么|你可以做什么|介绍一下你自己|怎么使用|怎么使用这个平台|如何使用|有什么功能|帮助|help)$/.test(q))return 'help';
 return null;
}

export function questionArgs(store,input,actor){
 const {query,course_id}=input;
 if(typeof query!=='string'||!query.trim()||query.length>2000)failure('请输入 1-2000 字的问题');
 const answer_mode=input.answer_mode||'evidence';if(!['tutor','evidence'].includes(answer_mode))failure('回答模式不合法');
 if(input.conversation_id!==undefined&&(typeof input.conversation_id!=='string'||!/^[-\w]{8,80}$/.test(input.conversation_id)))failure('对话标识不合法');
 const conversation_id=input.conversation_id||uid(),history=[];
 const rows=store.db.prepare("SELECT question,result FROM chat WHERE user_id=? AND course_id=? AND json_extract(result,'$.conversation_id')=? ORDER BY rowid DESC LIMIT 3").all(actor.id,course_id,conversation_id);
 for(const row of rows.reverse()){
  const r=JSON.parse(row.result);if(r.model_output_error)continue;
  const entry={question:row.question.slice(0,300),answer:String(r.model_answer||r.answer||'').slice(0,800)};
  history.push(entry);while(Buffer.byteLength(JSON.stringify(history))>6000)history.shift();
 }
 return {course_id,query:query.trim(),answer_mode,conversation_id,conversation_history:history};
}

export function prepareQuestionResult(result,course,args){
 const intent=socialIntent(args.query),topics=course.concepts.map(x=>x.title);
 let output=result;
 if(intent){const answer=intent==='thanks'?'不客气！你可以继续追问，或者用一道练习检查理解。':intent==='farewell'?'再见！下次可以继续提问或练习。':`你好！我是知行助教。当前课程是「${course.title}」。你可以问我${topics.slice(0,3).join('、')}，也可以让我解释代码、比较概念，或在右侧开始练习。`;
  output={...result,answer,citations:[],concept_id:null,uncertainty:'not_applicable_to_social_reply',next_action:'await_question',response_kind:'conversation',conversation_intent:intent};}
 return {...output,answer_mode:args.answer_mode||'evidence',conversation_id:args.conversation_id,chat_context:{course_title:course.title,topics,history:args.conversation_history||[],history_scope:'same_learner_course_and_conversation; recent_3_turns; untrusted_dialogue_data'},...(args.answer_mode==='tutor'?{response_kind:intent?'conversation':'tutoring'}:{})};
}

export function validateTutorReply(parsed,result){
 if(!parsed||Object.keys(parsed).sort().join(',')!=='course_claims,model_explanation,unresolved'||!Array.isArray(parsed.course_claims)||parsed.course_claims.length>5||typeof parsed.model_explanation!=='string'||parsed.model_explanation.length>6000||!Array.isArray(parsed.unresolved)||parsed.unresolved.length>4||parsed.unresolved.some(x=>typeof x!=='string'||x.length>1000))throw Error('Invalid tutoring response');
 if(!parsed.course_claims.length&&!parsed.model_explanation.trim())throw Error('Empty tutoring response');
 if(result.response_kind==='conversation'&&parsed.course_claims.length)throw Error('Social replies cannot assert course evidence');
 const grounded=parsed.course_claims.length?validateClaims({answer_status:'supported',claims:parsed.course_claims,unresolved:[]},result.citations):{model_claims:[],model_citation_ids:[],model_evidence_quotes:[]};
 const courseText=grounded.model_claims.map(c=>c.text).join('\n'),supplement=parsed.model_explanation.trim();
 return {...grounded,model_answer:[courseText,supplement,parsed.unresolved.length?'待澄清：'+parsed.unresolved.join('；'):''].filter(Boolean).join('\n\n'),model_course_answer:courseText,model_supplement:supplement,model_answer_status:result.response_kind==='conversation'?'conversation':supplement?'supplemented':'supported',model_answer_review:result.response_kind==='conversation'?'not_applicable_to_social_reply':'pending_human_review',supplement_provenance:'model_general_knowledge_not_course_verified',unresolved_questions:parsed.unresolved,uncertainty:result.response_kind==='conversation'?'not_applicable_to_social_reply':supplement?'model_supplement_not_course_verified':'claim_entailment_pending_review'};
}
