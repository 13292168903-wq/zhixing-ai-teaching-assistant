import path from 'node:path';
import {readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {ROOT} from '../src/data.mjs';
const out=path.resolve(ROOT,'../output/benchmark-v0.1'),runs=[];
const json=file=>JSON.parse(readFileSync(file,'utf8'));
for(const entry of readdirSync(out,{withFileTypes:true}).filter(e=>e.isDirectory()&&e.name.startsWith('longcat'))){
 const directory=path.join(out,entry.name),runtime=path.join(directory,'private-runtime'),ledger=path.join(runtime,'experiment-longcat-budget.sqlite');if(!existsSync(ledger))continue;
 const db=new DatabaseSync(ledger,{readOnly:true}),rows=db.prepare('SELECT status,charged,usage FROM requests').all();db.close();
 const summaryFile=path.join(directory,'summary.json'),interrupted=path.join(directory,'interrupted.json'),record={directory:entry.name,status:existsSync(summaryFile)?json(summaryFile).status:existsSync(interrupted)?'interrupted':'running',scope:entry.name==='longcat-release'?'final_comparison':entry.name.includes('probe')?'protocol_probe_not_comparison':'engineering_history_not_comparison',requests:rows.length,completed:rows.filter(r=>r.status==='completed').length,failed:rows.filter(r=>r.status.startsWith('failed')).length,reserved:rows.filter(r=>r.status==='reserved').length,estimated_cny:rows.reduce((n,r)=>n+r.charged,0),input_tokens:0,output_tokens:0};
 for(const row of rows){if(!row.usage)continue;const usage=JSON.parse(row.usage);record.input_tokens+=usage.input_tokens||0;record.output_tokens+=usage.output_tokens||0;}
 if(existsSync(interrupted))record.reason=json(interrupted).reason;
 if(existsSync(summaryFile))record.datasets=json(summaryFile).reports.map(r=>({title:r.dataset.title,arm:r.dataset.arm,seed:r.dataset.seed,counts:r.metrics}));
 runs.push(record);
}
const final=runs.find(r=>r.directory==='longcat-release'),total={requests:runs.reduce((n,r)=>n+r.requests,0),completed:runs.reduce((n,r)=>n+r.completed,0),estimated_cny:runs.reduce((n,r)=>n+r.estimated_cny,0),reserved:runs.reduce((n,r)=>n+r.reserved,0)};
const report={status:final?.status||'protocol_validation',credential_reused_from_previous_user_authorization:true,credential_verified:runs.some(r=>r.completed>0),credential_stored_in_files:false,total,final_comparison:final||null,runs,pricing:'configured_token_estimator_not_invoice; reservations included conservatively',real_data_scope:'bundled public Python/Google course material and synthetic learners only',formal_workspace_used_for_experiment:false,teacher_review:'pending',learning_gain:null,updated:new Date().toISOString()};
report.total_scope='original_v0.1_cohorts_only';const followup=path.join(out,'evidence-binding-v0.1.1/usage.json');if(existsSync(followup))report.evidence_binding_followup={...json(followup),report:'evidence-binding-v0.1.1/验证报告.md',included_in_original_comparison:false};
writeFileSync(path.join(out,'LongCat调用与费用报告.json'),JSON.stringify(report,null,2));
const rows=runs.map(r=>`| ${r.directory} | ${r.scope} | ${r.status} | ${r.requests} | ${r.completed} | ${r.estimated_cny.toFixed(4)} |`).join('\n');
writeFileSync(path.join(out,'LongCat真实联调记录.md'),`# LongCat真实联调记录\n\n已复用用户先前提供并授权的API，成功请求证明凭据有效。凭据通过TTY隐藏输入进入进程环境，没有写入源码、命令行或配置。\n\n| 轮次 | 用途 | 状态 | 请求 | 已完成 | 费用估算／预留（元） |\n|---|---|---|---:|---:|---:|\n${rows}\n\n总请求 ${total.requests}，完成 ${total.completed}，估算／预留合计 ${total.estimated_cny.toFixed(4)} 元。费用按当前配置的token估算器计算，不作为账户账单。历史联调及协议探针不并入最终A/B/C发现收益。\n\n联调修复：检索重复索引导致请求过大；模型重复决定已授权工具；CLI历史任务上下文进入新请求；独立核验输出预算与客户端配置不一致；生成资料按知识点检索替代按文件顺序取前几段。修复前后分别保存快照，不把跨版本结果混成一次固定助教实验。\n\n仅发送随包公开来源及合成学生数据。真实教师审核、用户可用性和学习效果仍待实际参与者完成。\n`);
console.log(JSON.stringify({status:report.status,...total,credential_verified:report.credential_verified,final_comparison:final?.status||null}));
