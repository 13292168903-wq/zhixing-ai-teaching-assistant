import {readFileSync,existsSync,readdirSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
mkdirSync(path.join(ROOT,'var'),{recursive:true});
export const BOOTSTRAP=path.resolve(ROOT,'../output/bootstrap-v0.1');
export const readJSON=p=>JSON.parse(readFileSync(p,'utf8'));
export const readJSONL=p=>readFileSync(p,'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
export function loadData(base=BOOTSTRAP) {
 const inputs=readJSONL(path.join(base,'public/learning_inputs.jsonl'));
 const refs=new Map(readJSONL(path.join(base,'public/learning_references.jsonl')).map(x=>[x.id,x]));
 const courses=new Map();
 for(const id of readdirSync(path.join(base,'courses')).filter(id=>existsSync(path.join(base,'courses',id,'manifest.json')))) {
  const manifest=readJSON(path.join(base,'courses',id,'manifest.json'));
  const cards=readJSON(path.join(ROOT,'courses',id+'.json'));
  if(manifest.concepts.some(c=>!cards.concepts[c.id]))throw new Error('Missing teaching resource for '+id);
  courses.set(id,{...manifest,cards,evidence:readJSON(path.join(base,'courses',id,'evidence.json'))});
 }
 const items=new Map(inputs.map(x=>[x.id,{...x,assessment_mode:x.task_type==='external_function_task'?'external_code':x.task_type==='concept_explanation'?'open':'exact',reference:refs.get(x.id).reference,checks:refs.get(x.id).checks}]));
 return {base,courses,items};
}
export function importCourse(data,pack,{allowEmpty=false}={}){
 const {manifest,cards,evidence,items}=pack||{};
 const reject=message=>{throw Object.assign(new Error(message),{status:400});};
 if(!manifest||!/^[a-z][a-z0-9_]{1,47}$/.test(manifest.course_id||'')||!manifest.version||typeof manifest.title!=='string')reject('课程标识、名称或版本不合法');
 const id=manifest.course_id;if(data.courses.has(id))reject('课程标识已存在，请使用新的课程标识');
 if(manifest.retrieval_terms!==undefined&&(!manifest.retrieval_terms||typeof manifest.retrieval_terms!=='object'||Array.isArray(manifest.retrieval_terms)||Object.keys(manifest.retrieval_terms).length>100||Object.entries(manifest.retrieval_terms).some(([k,v])=>!k.trim()||k.length>100||!Array.isArray(v)||v.length>20||v.some(t=>typeof t!=='string'||!t.trim()||t.length>100))))reject('课程检索术语映射格式无效');
 if(!Array.isArray(manifest.concepts)||(!allowEmpty&&!manifest.concepts.length)||manifest.concepts.length>30)reject('课程需包含 1-30 个知识点');
 const capabilities=data.capabilities||new Set(['retrieve_evidence','generate_task','verify_submission']);
 if(!Array.isArray(manifest.required_capabilities||[])||(manifest.required_capabilities||[]).some(x=>!capabilities.has(x)))reject('课包依赖尚未安装的能力');
 if(!cards?.concepts||!Array.isArray(evidence)||!Array.isArray(items)||(!allowEmpty&&!items.length)||items.length>200)reject('缺少课程卡片、证据或练习');
 const conceptIds=new Set(manifest.concepts.map(c=>c.id));if(conceptIds.size!==manifest.concepts.length)reject('知识点标识重复');
 for(const c of manifest.concepts){const card=cards.concepts[c.id];if(!card||typeof card.summary!=='string'||['aliases','support','contradictions'].some(k=>!Array.isArray(card[k])||card[k].some(x=>typeof x!=='string'||!x.trim()||x.length>2000)))reject('知识点缺少教学卡片');card.rule_mode='literal';}
 for(const e of evidence){if(!e.id||!conceptIds.has(e.concept_id)||typeof e.text!=='string'||e.text.length>20000||!/^https?:\/\//.test(e.locator||''))reject('证据缺少定位或知识点');}
 const seen=new Set();for(const item of items){
  if(!item.id||data.items.has(item.id)||seen.has(item.id)||!conceptIds.has(item.concept_id))reject('练习标识冲突或知识点无效');seen.add(item.id);
  if(!['exact','open','external_code','plugin'].includes(item.assessment_mode)||typeof item.prompt!=='string'||!item.reference||typeof item.reference.answer!=='string'||!Array.isArray(item.reference.required_points))reject('练习缺少评阅方式或量规');
  if(item.assessment_mode==='plugin'){
   if(!data.assessmentRegistry?.has(item.assessment?.capability)||!(manifest.required_capabilities||[]).includes(item.assessment.capability))reject('练习评阅插件未安装或未声明依赖');
   data.assessmentRegistry.get(item.assessment.capability).validate(item.assessment.config);
  }
  if(item.reference.point_groups!==undefined&&(!Array.isArray(item.reference.point_groups)||item.reference.point_groups.length>20||item.reference.point_groups.some(g=>typeof g.label!=='string'||!g.label.trim()||!Array.isArray(g.acceptable)||!g.acceptable.length||g.acceptable.length>20||g.acceptable.some(x=>typeof x!=='string'||!x.trim()||x.length>2000))))reject('单题要点与可接受表述格式无效');
  item.course_id=id;item.hints=Array.isArray(item.hints)?item.hints:['先说明依据，再尝试作答。'];item.checks={human_review:'not_reviewed',answer:'imported_not_verified'};
 }
 data.courses.set(id,{...manifest,review_status:'draft_not_teacher_approved',cards,evidence});for(const item of items)data.items.set(item.id,item);return id;
}
export function assertCourse(data,id){const c=data.courses.get(id);if(!c)throw Object.assign(new Error('课程不存在'),{status:404});return c;}
export function publicItem(item){const keys=['schema_version','id','kind','course_id','course_version','concept_id','assessment_mode','task_type','language','prompt','original_prompt','function_signature','public_tests','test_imports','options','hints'];const input=Object.fromEntries(keys.filter(k=>k in item).map(k=>[k,item[k]]));return {...input,review_status:item.checks?.human_review||'not_reviewed',external_execution_pending:item.task_type==='external_function_task'};}
export function availableHarness(){const bundled=path.join(ROOT,'runtime/dsh');return process.env.HARNESS_ROOT || (existsSync(path.join(bundled,'apps/cli/lib/bin.js'))?bundled:existsSync('D:/项目/deepseek-harness/apps/cli/lib/bin.js')?'D:/项目/deepseek-harness':null);}
