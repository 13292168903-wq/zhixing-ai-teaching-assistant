import {hash,failure} from './store.mjs';
export const stable=x=>x===null||typeof x!=='object'?JSON.stringify(x):Array.isArray(x)?'['+x.map(stable).join(',')+']':'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+stable(x[k])).join(',')+'}';
export const fingerprint=x=>hash(stable(x));
export const TRUSTED_PLUGINS=[
 {id:'evaluation_factory',version:'0.1.0',title:'课程质量检查',dependencies:['retrieve_evidence','generate_task','verify_submission'],capabilities:['evaluation_factory'],operations:['generate','verify'],entry:'plugins/evaluation-factory/index.mjs'},
 {id:'exercise_factory',version:'0.7.0',title:'教学数据生成',dependencies:['retrieve_evidence'],capabilities:['exercise_factory'],operations:['generate','generate_program','independent'],entry:'plugins/exercise-factory/index.mjs'},
 {id:'student_simulator',version:'0.7.0',title:'学生模拟',dependencies:['generate_task','verify_submission','teaching_policy'],capabilities:['student_simulator'],operations:['utterance'],entry:'plugins/student-simulator/index.mjs'},
 {id:'teaching_policy',version:'0.7.0',title:'教学策略',dependencies:['retrieve_evidence','generate_task','verify_submission'],capabilities:['teaching_policy'],operations:['plan'],entry:'plugins/teaching-policy/index.mjs'}
].map(m=>({...m,sdk_version:'1',trusted:true,configuration:{mode:['offline','longcat'],course_binding_required:true}}));
export const PERSONAS=['independent','contradictory_reason','hint_dependency','uncertain'];
export const STRATEGIES=['baseline','socratic','example_first','scaffolded','transfer'];
export function checkJob(input){
 if(!TRUSTED_PLUGINS.some(p=>p.id===input.plugin_id)||typeof input.course_id!=='string'||!['offline','longcat'].includes(input.mode||'offline'))failure('插件、课程或运行模式无效');
 if(typeof input.idempotency_key!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(input.idempotency_key))failure('请提供稳定的任务幂等编号');
 if(input.plugin_id==='exercise_factory'&&(!Number.isInteger(input.count||1)||(input.count||1)<1||(input.count||1)>20))failure('每个生成任务需 1-20 条候选');
 if(input.plugin_id==='evaluation_factory'&&(!['generate','run','experiment'].includes(input.action)||typeof input.dataset_id!=='string'))failure('评测任务操作或数据集无效');
 if(input.plugin_id==='student_simulator'&&(!PERSONAS.includes(input.persona)||!Number.isInteger(input.max_turns??3)||(input.max_turns??3)<1||(input.max_turns??3)>8))failure('学生行为或有限轮数无效');
 if(input.strategy&&!STRATEGIES.includes(input.strategy))failure('未知教学策略');
 return {...input,mode:input.mode||'offline',seed:input.seed??42};
}
export function datasetCandidate(candidate){const technical=candidate.validation.status==='technical_checks_passed';return {id:candidate.id,source:'teaching_course_pack',family:candidate.family_id,instruction:candidate.prompt,referenceAnswer:candidate.reference,spec:{course_id:candidate.course_id,concept_id:candidate.concept_id,purpose:'development_only',language:candidate.language||null,teaching_review_status:candidate.review_status},fingerprint:candidate.fingerprint,group:candidate.family_id,split:'generated',sourceRefs:candidate.source_refs,license:candidate.license,generator:candidate.generator,validation:{valid:technical||candidate.validation.status==='pending_semantic_review',reasons:candidate.validation.reason?[candidate.validation.reason]:[],structural:true,semantic:technical?'programmatically_verified':'review_required',verifier:'teaching_adapter_v0.7_technical_only'}};}
export function studentCandidate(c){return {id:c.id,course_id:c.course_id,concept_id:c.concept_id,family_id:c.family_id,prompt:c.prompt,hints:c.hints,language:c.language||null,public_tests:c.program?.public_tests||[],review_status:c.review_status};}
