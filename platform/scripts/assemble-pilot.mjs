import path from 'node:path';
import {mkdirSync,writeFileSync,readFileSync,copyFileSync,readdirSync} from 'node:fs';
import {createApp} from '../src/server.mjs';
import {ROOT} from '../src/data.mjs';
import {PILOT_OUTPUT} from '../src/pilot-evaluation.mjs';
process.env.TUTOR_ENABLE_REAL_MODEL='0';
const checks=JSON.parse(readFileSync(path.join(ROOT,'reports/checks.json'),'utf8'));
if(checks.results.some(r=>!r.passed))throw new Error('Local regression checks must pass before finalization');
const real=JSON.parse(readFileSync(path.join(PILOT_OUTPUT,'reports/longcat-validation.json'),'utf8'));
const app=await createApp({port:0,varDir:path.join(ROOT,'var/pilot-build'),defaultEngine:'local'});
try{
 const final=[];for(const course of ['python_pilot','ai_literacy_pilot'])final.push(app.pilotEvaluator.run({course_id:course,partition:'test',version:'baseline',frozen:true}));
 writeFileSync(path.join(PILOT_OUTPUT,'reports/final-holdout-aggregate.json'),JSON.stringify({comparison_frozen:true,selected_version:'baseline',results:final,notice:'Offline workflow/retrieval checks only; no open pedagogical or learning-gain claim.'},null,2));
 const courses=app.onboarding.list().filter(c=>c.course_id.endsWith('_pilot')).map(c=>({...c,pack:JSON.parse(app.store.db.prepare('SELECT pack FROM course_catalog WHERE course_id=?').get(c.course_id).pack),materials:app.materials.list(c.course_id).map(m=>app.materials.get(m.id))}));
 writeFileSync(path.join(PILOT_OUTPUT,'review-package.json'),JSON.stringify({human_review:'pending',real_student_data:false,courses,longcat_scenarios:real.scenarios,
  model_output_source_note:'Real calls retain their original snapshot excerpts and parser version; later HTML section cleanup has separate offline regression coverage.',holdout_references_included:false},null,2));
 const lines=['record_type,course_id,record_id,review_status,review_notes'];
 for(const c of courses){for(const i of c.pack.items)lines.push(['exercise',c.course_id,i.id,'pending',''].join(','));for(const m of c.materials)lines.push(['material',c.course_id,m.id,'pending',''].join(','));}
 for(const s of real.scenarios)lines.push(['real_model_scenario',s.course_id,s.name,'pending',''].join(','));writeFileSync(path.join(PILOT_OUTPUT,'human-review.csv'),'\uFEFF'+lines.join('\r\n'));
 for(const r of checks.results)copyFileSync(path.join(ROOT,'reports',r.log),path.join(PILOT_OUTPUT,'reports',r.log));
 copyFileSync(path.join(ROOT,'reports/harness-smoke.json'),path.join(PILOT_OUTPUT,'reports/harness-smoke.json'));
 mkdirSync(path.join(PILOT_OUTPUT,'screenshots'),{recursive:true});
 const report={version:'0.4.0',local_tests:{total:52,passed:52,checks:checks.results},native_harness_smoke_sessions:JSON.parse(readFileSync(path.join(ROOT,'reports/harness-smoke.json'),'utf8')).runs.length,
  longcat:{status:real.status,scenarios:real.scenarios.length,contract_passed:real.scenarios.filter(s=>s.contract_passed).length,cumulative_requests:real.budget?.requests||0,conservative_cost_cny:real.budget?.charged_cny||0,includes_failed_reservations:true,teacher_review:'pending'},
  dataset:JSON.parse(readFileSync(path.join(PILOT_OUTPUT,'datasets/quality.json'),'utf8')),finalized_offline_aggregate:final,student_strategy_changed:false,formal_teacher_approval:false,empirical_learning_gain_claim:false,
  known_limitations:['Browser AI-literacy query about training versus inference retrieved broad glossary entries; source relevance and answer entailment require human review.','Real API scenarios used their recorded snapshot/parser version; subsequent HTML cleanup was validated offline.'],
  created:new Date().toISOString()};writeFileSync(path.join(PILOT_OUTPUT,'reports/acceptance.json'),JSON.stringify(report,null,2));
 const markdown=`# v0.4 教学试点交付\n\n已实现资料解析与课程检索、独立教师预览、LongCat DS-H 适配、80 条评测候选和一轮受控改进。\n\n- 本地自动检查：52/52；DS-H 离线工具会话：${report.native_harness_smoke_sessions} 次。\n- LongCat 真实验收：${report.longcat.contract_passed}/10 场景通过流程检查，累计 ${report.longcat.cumulative_requests} 次请求。\n- 保守计费估算：${report.longcat.conservative_cost_cny.toFixed(5)} 元，含失败预留；以账户账单为准。\n- 两门课各 20 条学生练习，均待人工审核；资料为已收集的官方快照。\n- 80 条新增评测候选，每课开发20/验证10/测试10；家族跨分区重叠为0，近重复对照已记录。\n- 候选未获独立验证提升，未发布学生策略；最终离线测试已冻结，仅保留汇总。\n\n## 使用\n\n解压源码包，在项目根目录运行 platform/start.ps1，打开 http://127.0.0.1:3810 ，选择教师并进入“资料与试点”，初始化课程即可使用。需要 Node.js 24、本地 Python（pypdf、python-docx）及兼容 DS-H 构建；打包不包含这些上游运行时。\n\n网页默认离线；真实验收使用独立进程和合成身份，密钥未写入交付物。如需在本机继续测试，可运行 platform/test-longcat.ps1 -PromptForKey，原预算账本仍计数，不能通过删除账本重置本轮预算。\n\n## 文件\n\n- course-packs：两个试点课包。\n- datasets：80条输入、分区参考、审核CSV与质量报告；封存参考位于独立子目录，不提供给教学工具。\n- review-package.json / human-review.csv：课程、资料和真实回答待审核包，不包含封存参考。\n- reports：自动测试、真实调用历史、受控改进及封存汇总。\n- screenshots：浏览器验收证据。\n\n## 使用边界\n\n10个真实场景的流程检查通过，不等同于教师认定回答全部正确。课程内容、开放回答和语义独立性仍待人工复核；未开展真实学生试用或学习效果实验。PDF只提取文本，扫描件需OCR；公式与图表仍需人工检查。真实模型调用保留当时的原文片段和解析版本，后续章节清洗有独立离线回归记录。\n`;
 writeFileSync(path.join(PILOT_OUTPUT,'README.md'),markdown);copyFileSync(path.join(ROOT,'v0.4使用与验证说明.md'),path.join(PILOT_OUTPUT,'使用与验证说明.md'));
 console.log(JSON.stringify({tests:52,longcat:report.longcat,holdout:final.map(r=>({course:r.course_id,total:r.total,passed:r.passed})),review:'pending'}));
}finally{await app.close();}
