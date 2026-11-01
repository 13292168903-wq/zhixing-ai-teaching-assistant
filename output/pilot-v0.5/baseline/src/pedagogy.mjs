import {assertCourse,publicItem} from './data.mjs';
import {retrieveMaterials} from './retrieval.mjs';
export class PluginRegistry {
 constructor(){this.plugins=new Map();this.assessments=new Map();}
 register(plugin){if(this.plugins.has(plugin.id))throw new Error('Duplicate plugin '+plugin.id);this.plugins.set(plugin.id,plugin);}
 async call(id,ctx,args){const plugin=this.plugins.get(id);if(!plugin)throw new Error('Missing capability '+id);return plugin.execute(ctx,args);}
 manifest(){return [...this.plugins.values()].map(({execute,...p})=>p);}
}
export function retrieve(data,courseId,query){
 const course=assertCourse(data,courseId);const q=query.toLowerCase();
 const concepts=Object.entries(course.cards.concepts).map(([id,card])=>({id,card,score:card.aliases.reduce((n,a)=>n+(q.includes(a.toLowerCase())?a.length:0),0)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
 if(!concepts.length)return {query,answer:'当前课程资料中没有找到能支持这个问题的明确内容。请补充知识点或请教师提供材料。',citations:[],concept_id:null,uncertainty:'insufficient_evidence',next_action:'ask_clarification'};
 const best=concepts[0];const evidence=course.evidence.filter(e=>e.concept_id===best.id).slice(0,2);
 return {query,answer:best.card.summary,citations:evidence.map(e=>({id:e.id,url:e.locator,excerpt:e.text.slice(0,800)})),concept_id:best.id,uncertainty:'curated_summary_not_freeform_reasoning',next_action:'assign_diagnostic',suggested_question:best.card.probe};
}
export const normalize=x=>String(x??'').trim().replace(/\r/g,'').replace(/[ \t]+/g,' ');
export function assessExplanation(card,text,config={}){
 const cleaned=String(text||'').trim();if(!cleaned)return {status:'missing',reason:'尚未提供解释，不能仅凭答案判断理解。'};
 // A contradiction rule is a transparent screening signal, not a semantic judge.
 const matches=p=>card.rule_mode==='literal'?cleaned.toLowerCase().includes(p.toLowerCase()):new RegExp(p,'i').test(cleaned);
 const bad=card.contradictions.find(matches);
 if(bad)return {status:'contradiction',reason:'解释命中待核查的概念矛盾规则。',rule:bad};
 if(config.flag_unqualified_absolutes&&/(必然|必定|绝对|一定|总是|所有|总不会)/.test(cleaned)&&!/(不能|不一定|不保证|不等于|不代表)/.test(cleaned))return {status:'contradiction',reason:'解释包含未加限定的绝对化表述，需要追问其适用条件。',rule:'unqualified_absolute_claim'};
 const support=card.support.filter(matches);
 return support.length?{status:'provisional_support',reason:'解释包含相关依据，仍是规则初筛，开放语义需复核。'}:{status:'uncertain',reason:'规则无法确认这段解释，建议补充理由或由教师复核。'};
}
export function grade(data,item,submission,config={check_explanation:true},hints={count:0,full:false},assessment=null){
 if(config.applicable_courses&&!config.applicable_courses.includes(item.course_id))config={...config,flag_unqualified_absolutes:false,require_transfer:false};
 const course=assertCourse(data,item.course_id);const card=course.cards.concepts[item.concept_id];
 if(item.external_execution_pending||item.assessment_mode==='external_code'||item.task_type==='external_function_task')return {correct:null,score:null,max_score:2,review_required:true,explanation_status:'unverified_code',state_status:'unconfirmed',independent_evidence:false,hints_used:hints.count,next_action:'teacher_review',feedback:'代码已提交，等待隔离执行与教师复核；本平台不会在宿主执行学生代码。',misconception:null};
 const explanation=assessExplanation(card,submission.explanation||submission.answer,config);
 const objective=item.assessment_mode==='exact'||assessment!==null;
 const correct=assessment?assessment.correct:objective?(normalize(submission.answer)===normalize(item.reference.answer)||Boolean(item.reference.choice&&normalize(submission.answer).toUpperCase()===item.reference.choice)):null;
 let action='give_local_hint',status='needs_review',feedback='请对照资料补充解释，再完成一道新题。';
 const contradiction=config.check_explanation&&explanation.status==='contradiction';
 if(contradiction){action='probe_contradiction';feedback='结果与解释需要分别核对。'+card.probe;}
 else if(objective&&correct===false){action='give_local_hint';feedback='输出与参考核验不一致。'+card.probe;}
 else if(hints.full){action='assign_transfer';status='practicing';feedback='当前作答使用过完整解析，已记录提示依赖。请用新题独立复查。';}
 else if(explanation.status==='missing'||explanation.status==='uncertain'){action='ask_justification';feedback=explanation.reason;}
 else {action=config.require_transfer?'assign_transfer':'acknowledge_progress';status='supported';feedback=objective?'输出正确，解释初筛有依据。已记录局部进展，下一步用新结构复查。':'解释包含相关概念依据，已形成待复核的学习证据；这不是正式自动判分。';}
 return {correct,score:objective?(correct?1:0):null,max_score:objective?1:null,review_required:true,
  ...(assessment?{assessment_method:assessment.method}:{}),explanation_status:explanation.status,state_status:status,independent_evidence:objective&&correct===true&&explanation.status==='provisional_support'&&!hints.count&&!hints.full,
  hints_used:hints.count,next_action:action,feedback,misconception:contradiction?'explanation_contradiction':null,
  diagnostic_evidence:{objective_match:correct,explanation_rule:explanation.rule||null,hint_level:hints.full?'full_solution':hints.count?'concept':'none'},
  evidence_ids:course.evidence.filter(e=>e.concept_id===item.concept_id).map(e=>e.id)};
}
export function registerCorePlugins(registry,services){
 for(const [id,label,execute] of [
  ['retrieve_evidence','课程证据检索',(_ctx,args)=>{services.access(args.actor,args.course_id);return services.data.materialStore&&services.data.courses.get(args.course_id).material_retrieval?retrieveMaterials(services.data,services.data.materialStore,args.course_id,args.query,{preview:services.preview===true}):retrieve(services.data,args.course_id,args.query);}],
  ['generate_task','按目标选题与组卷',(_ctx,args)=>services.assign(args)],
  ['verify_submission','作答核验与教学动作',(_ctx,args)=>services.submit(args)],
 ])registry.register({id,version:'0.2.0',label,input_schema:'structured_course_request',output_evidence:true,permissions:['current_course','current_learner'],execute});
}
