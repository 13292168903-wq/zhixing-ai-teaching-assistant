import {readFileSync} from 'node:fs';
import path from 'node:path';
import {BOOTSTRAP} from './data.mjs';
import {hash} from './store.mjs';
import {upgradePack} from './v05.mjs';
export const PILOTS=['python_pilot','ai_literacy_pilot'];
const SUPPORT={lists:['同一列表','同一对象','浅拷贝','原地','外层','共享'],range:['不包含终点','步长','break','索引'],defaults:['定义时','共享','None','重新绑定'],returns:['返回','None','调用者','原地'],train_infer:['更新参数','固定','训练','推理','不能'],splits:['验证','冻结','独立','家族','泄漏'],overfit:['不保证','可能','过拟合','分布'],hallucination:['核对','证据','原文','不足','不能']};
const CONTRADICTIONS={lists:['切片总是与原列表是同一对象','浅拷贝会递归复制每一层'],range:['range一定包含终点'],defaults:['默认列表每次调用重新创建'],returns:['打印就是返回值'],train_infer:['修改提示词必然更新模型权重'],splits:['随机改数字就保证独立'],overfit:['训练高分保证泛化'],hallucination:['有引用链接就证明结论正确']};
export function pilotPack(data,base){
 const old=data.courses.get(base),id=base+'_pilot';const pack={manifest:{schema_version:'0.4.0',course_id:id,version:'0.4.0',title:old.title.replace('示范课包','')+' · 教学试点',concepts:structuredClone(old.concepts),required_capabilities:['retrieve_evidence','generate_task','verify_submission'],material_retrieval:true},cards:structuredClone(old.cards),evidence:structuredClone(old.evidence),items:[]};
 for(const [concept,c]of Object.entries(pack.cards.concepts)){c.support=SUPPORT[concept];c.contradictions=CONTRADICTIONS[concept];c.rule_mode='literal';}
 for(const concept of old.concepts){const selected=[...data.items.values()].filter(x=>x.course_id===base&&x.concept_id===concept.id&&x.assessment_mode!=='external_code').slice(0,5);
  for(const x of selected){const item=structuredClone(x);item.id='P04-'+x.id;item.course_id=id;item.course_version='0.4.0';item.provenance={original_item_id:x.id,kind:'reused_candidate_not_teacher_approved'};pack.items.push(item);}}
 return upgradePack(pack);
}
export async function seedPilots(data,onboarding,materials,actor){
 const manifest=JSON.parse(readFileSync(path.join(BOOTSTRAP,'sources/manifest.json'),'utf8')),results=[];
 for(const base of ['python','ai_literacy']){
  const pack=pilotPack(data,base),id=pack.manifest.course_id;
  if(!data.courses.has(id))onboarding.importPack(pack,actor);
  const sources=manifest.sources.filter(s=>(base==='python'?['py_intro','py_control','py_data']:['ai_glossary','ai_split','ai_overfit']).includes(s.id));
  for(const source of sources){const filename=source.id+'.html',content=readFileSync(path.join(BOOTSTRAP,source.path));
   await materials.upload({course_id:id,filename,content_base64:content.toString('base64'),source_url:source.url,license:source.license,version:source.sha256.slice(0,12)},actor);}
  results.push({course_id:id,items:pack.items.length,materials:materials.list(id).length,status:'draft_pending_human_review',content_digest:hash(pack)});
 }return {courses:results,human_review:'pending',real_student_data:false};
}
