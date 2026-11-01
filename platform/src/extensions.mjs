import {failure} from './store.mjs';

// Only trusted host handlers execute. Uploaded JSON selects a handler; it is never code.
export const EXTENSION_CATALOG=[{id:'numeric_check',version:'1.0.0',label:'数值容差核验',handler:'numeric_tolerance',
 description:'有限实数的绝对/相对容差核验，可跨统计、物理等课程复用；不处理公式、单位换算或代码。'}];
const numeric={
 validate(config){
  if(!config||!Number.isFinite(config.target)||!Number.isFinite(config.absolute_tolerance??0)||!Number.isFinite(config.relative_tolerance??0)||
    (config.absolute_tolerance??0)<0||(config.relative_tolerance??0)<0)failure('数值插件需要有限 target 和非负容差');
 },
 assess(answer,config){
  this.validate(config);
  const input=String(answer).trim();
  if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(input)||!Number.isFinite(Number(input)))return {correct:false,method:'numeric_tolerance',feedback:'请提交有限数值；当前插件不解析公式或单位。'};
  const tolerance=Math.max(config.absolute_tolerance??0,Math.abs(config.target)*(config.relative_tolerance??0));
  return {correct:Math.abs(Number(input)-config.target)<=tolerance,method:'numeric_tolerance'};
 }
};
export function installExtension(registry,descriptor){
 if(!descriptor||!/^[a-z][a-z0-9_]{1,47}$/.test(descriptor.id||'')||!/^\d+\.\d+\.\d+$/.test(descriptor.version||'')||
   typeof descriptor.label!=='string'||!descriptor.label.trim()||descriptor.label.length>80||descriptor.handler!=='numeric_tolerance')failure('插件声明无效：仅接受受信的 numeric_tolerance 处理器');
 if(registry.plugins.has(descriptor.id))failure('插件标识已安装或与内置能力冲突',409);
 const safe={id:descriptor.id,version:descriptor.version,label:descriptor.label,handler:descriptor.handler,
  description:String(descriptor.description||'').slice(0,500),kind:'assessment',permissions:['current_course','current_learner'],input_schema:'finite_numeric_answer',output_evidence:true};
 registry.register({...safe,execute:(_ctx,args)=>numeric.assess(args.answer,args.config)});
 registry.assessments.set(safe.id,numeric);return safe;
}
