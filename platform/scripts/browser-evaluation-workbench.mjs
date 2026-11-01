import path from 'node:path';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {ROOT} from '../src/data.mjs';
import {benchmarkFixture,BENCH_PASSWORD,waitBenchmark} from './benchmark-fixture.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const out=path.resolve(ROOT,'../output/benchmark-v0.1/screenshots');mkdirSync(out,{recursive:true});
const {app,users}=await benchmarkFixture(),factory=app.pluginLab.evaluationFactory;
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})}),context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),page=await context.newPage(),errors=[],steps=[],started=Date.now();
page.on('pageerror',e=>errors.push(e.message));
const snap=async name=>page.screenshot({path:path.join(out,name+'.png'),fullPage:true});
const summary=(title)=>page.locator('summary').filter({hasText:title}).filter({hasNot:page.locator('summary')});
const open=async title=>{const s=page.getByText(title,{exact:true}).filter({hasNot:page.locator('summary')});await s.click();};
async function login(user){await page.goto(app.origin);await page.getByLabel('账号',{exact:true}).fill(user.username);await page.getByLabel('密码',{exact:true}).fill(BENCH_PASSWORD);await page.getByRole('button',{name:'登录工作空间',exact:true}).click();await page.getByRole('button',{name:'退出',exact:true}).waitFor();}
async function download(button,name){const wait=page.waitForEvent('download');await page.getByRole('button',{name:button,exact:true}).click();const d=await wait;await d.saveAs(path.join(out,name));}
try{
 await login(users.teacher);if(!await page.getByRole('button',{name:'课程质量检查',exact:true}).isVisible())await page.getByText('更多工具',{exact:true}).click();await page.getByRole('button',{name:'课程质量检查',exact:true}).click();await page.getByRole('heading',{name:'本课检查概览',exact:true}).waitFor();
 if(!await page.getByText('本课程还没有检查记录。先新建一小批检查，再查看结果和待办事项。',{exact:true}).isVisible())throw Error('empty state did not explain next action');
 steps.push('empty course explains next action without claiming quality approval');
 await open('高级设置：检查范围与生成参数');await page.getByLabel('候选数量',{exact:true}).fill('2');await page.getByRole('button',{name:'创建检查',exact:true}).click();await page.getByRole('button',{name:'开始检查',exact:true}).waitFor();
 await page.getByRole('button',{name:'开始检查',exact:true}).click();let j;const deadline=Date.now()+120000;while(Date.now()<deadline){j=app.pluginLab.jobs.list().find(j=>j.plugin_id==='evaluation_factory');if(j&&!['queued','running'].includes(j.status))break;await new Promise(r=>setTimeout(r,250));}if(j?.status!=='completed')throw Error('job failed: '+j?.error);
 await page.getByRole('button',{name:'刷新结果',exact:true}).click();await page.getByRole('heading',{name:'需要处理的事项',exact:true}).waitFor();
 if(await page.locator('pre:visible').count())throw Error('raw JSON visible on default workbench');
 if(await page.getByRole('button',{name:'建立三组对照实验',exact:true}).isVisible())throw Error('research controls visible by default');
 await snap('workbench-01-overview');steps.push('teacher sees conclusion, role triage and next steps; raw JSON and research controls collapsed');
 const candidate=factory.cases(j.input.dataset_id)[0];await page.getByRole('button',{name:'查看待审核内容',exact:true}).click();
 const notes=page.getByLabel('审核依据 '+candidate.id,{exact:true}),entry=notes.locator('xpath=ancestor::details[1]');await entry.locator(':scope > summary').click();await notes.fill('SYNTHETIC BROWSER FIXTURE: needs independent teacher review, not approval');await entry.getByRole('button',{name:'保存审核',exact:true}).click();
 if(factory.getCase(candidate.id).review.status!=='needs_revision')throw Error('review was not persisted');steps.push('teacher reviews a human-readable case and preserves needs_revision gate');
 await download('导出教师审核表','workbench-teacher-review.csv');const csv=readFileSync(path.join(out,'workbench-teacher-review.csv'),'utf8');if(!csv.includes('审核意见')||!csv.includes(candidate.id))throw Error('teacher CSV incomplete');
 await download('导出检查摘要','workbench-summary.json');const brief=JSON.parse(readFileSync(path.join(out,'workbench-summary.json'),'utf8'));if(brief.教学效果!=='尚未验证'||brief.cases||brief.runs)throw Error('summary scope invalid');steps.push('teacher CSV and plain-language summary export without technical trace dump');
 await open('高级详情（维护者与研究）');await open('原始导出');
 await download('导出公开输入','public-inputs.json');await download('导出评测器参考与轨迹','evaluator-private.json');await download('导出六项指标报告','six-criteria.json');
 const publicData=JSON.parse(readFileSync(path.join(out,'public-inputs.json'),'utf8'));if(publicData.cases.some(c=>c.oracle||c.public.item.reference))throw Error('public export leaked reference');steps.push('advanced public/private exports remain separated');
 await page.getByRole('button',{name:'冻结研究快照',exact:true}).click();await page.getByText('记录状态：只读研究快照',{exact:true}).waitFor();await open('高级详情（维护者与研究）');if(!await page.getByRole('button',{name:'重新运行已核验案例',exact:true}).isDisabled())throw Error('frozen rerun not disabled');steps.push('frozen research stays read-only without simulated approval');
 // Copy finished research records into the isolated test DB for read-only UI validation.
 const source=path.resolve(ROOT,'../output/benchmark-v0.1/longcat-release/private-runtime/benchmark-v0.1/benchmark.sqlite');
 if(existsSync(source)){
  const src=new DatabaseSync(source,{readOnly:true});try{for(const table of ['benchmark_datasets','benchmark_cases','benchmark_runs','benchmark_experiments'])for(const row of src.prepare('SELECT * FROM '+table).all()){
   if(table==='benchmark_datasets'){const d=JSON.parse(row.data);d.title='[真实研究归档] '+d.title;d.record_origin='isolated_real_research_not_current_course_run';d.archive_notes='公开资料与合成学员的历史研究；不代表当前课程现测结果。';row.data=JSON.stringify(d);}
   const keys=Object.keys(row);factory.db.prepare('INSERT OR IGNORE INTO '+table+'('+keys.join(',')+') VALUES('+keys.map(()=>'?').join(',')+')').run(...keys.map(k=>row[k]));
  }}finally{src.close();}
  await page.getByRole('button',{name:'刷新结果',exact:true}).click();const archived=factory.db.prepare("SELECT data FROM benchmark_datasets WHERE data LIKE '%Python 固定锚定案例%'").all().map(r=>JSON.parse(r.data))[0];
  await page.getByLabel('查看检查记录',{exact:true}).selectOption(archived.id);await page.getByText('这是公开资料与合成学员的独立研究归档，资料版本可能不同于当前课程。当前课程的质量需另建检查确认。',{exact:true}).waitFor();
  if(await page.locator('pre:visible').count())throw Error('archive exposes raw JSON by default');
  await page.getByRole('button',{name:'查看待审核内容',exact:true}).click();await page.getByLabel('搜索案例',{exact:true}).fill('b[0].append(4)');
  const found=page.getByText('案例与教学审核',{exact:true}).locator('..').locator('summary').filter({hasText:'答案与理由矛盾'}).filter({hasText:'异常场景'}).first().locator('..');
  await found.locator(':scope > summary').click();await found.getByText('解释判断：解释出现矛盾；独立掌握证据：本次不计入',{exact:true}).waitFor();
  if(await found.getByRole('button',{name:'保存审核',exact:true}).count())throw Error('frozen archive has review write control');
  await snap('workbench-02-real-example');steps.push('actual LongCat shallow-copy record is searchable and shown with human-readable outcome; archive stays read-only');
  await page.getByLabel('事项范围',{exact:true}).selectOption('all');
  const broken=factory.db.prepare("SELECT data FROM benchmark_datasets WHERE data LIKE '%B / seed 42%'").all().map(r=>JSON.parse(r.data))[0];await page.getByLabel('查看检查记录',{exact:true}).selectOption(broken.id);await page.getByText('建议处理人：平台维护者',{exact:true}).waitFor();await snap('workbench-03-maintainer-routing');steps.push('quarantined generation is routed to maintainers, not counted as teacher approval or student error');
 }
 const boundPath=path.resolve(ROOT,'../output/benchmark-v0.1/evidence-binding-v0.1.1/private-runtime/benchmark-v0.1/benchmark.sqlite');
 if(existsSync(boundPath)){
  const src=new DatabaseSync(boundPath,{readOnly:true});try{for(const table of ['benchmark_datasets','benchmark_cases','benchmark_runs'])for(const row of src.prepare('SELECT * FROM '+table).all()){
   if(table==='benchmark_datasets'){const d=JSON.parse(row.data);d.title='[证据绑定验证归档] '+d.title;d.record_origin='isolated_real_research_not_current_course_run';row.data=JSON.stringify(d);}
   const keys=Object.keys(row);factory.db.prepare('INSERT OR IGNORE INTO '+table+'('+keys.join(',')+') VALUES('+keys.map(()=>'?').join(',')+')').run(...keys.map(k=>row[k]));
  }}finally{src.close();}
  await page.getByRole('button',{name:'刷新结果',exact:true}).click();const bound=factory.db.prepare("SELECT data FROM benchmark_datasets WHERE data LIKE '%证据绑定修复 · Python%'").all().map(r=>JSON.parse(r.data))[0];
  await page.getByLabel('查看检查记录',{exact:true}).selectOption(bound.id);await page.getByRole('button',{name:'查看待审核内容',exact:true}).click();
  const candidate=factory.cases(bound.id).find(c=>c.validation.status==='passed');await page.getByLabel('搜索案例',{exact:true}).fill(candidate.id);
  const area=page.getByText('案例与教学审核',{exact:true}).locator('..'),entry=area.locator(':scope > div > details').first();await entry.locator(':scope > summary').click();await entry.getByText('查看来源与定位',{exact:true}).click();
  const original=bound.snapshot.sources.find(s=>s.id===candidate.source_refs[0]);await entry.getByText(original.text,{exact:true}).first().waitFor();if(await page.locator('pre:visible').count())throw Error('bound evidence unexpectedly requires JSON view');
  await entry.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'workbench-05-bound-evidence.png')});steps.push('new real evidence-bound candidate shows its exact original source in the teacher view');
 }
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'打开导航',exact:true}).click();if(!await page.getByRole('button',{name:'课程质量检查',exact:true}).isVisible())await page.getByText('更多工具',{exact:true}).click();await page.getByRole('button',{name:'课程质量检查',exact:true}).click();await page.getByRole('heading',{name:'本课检查概览',exact:true}).waitFor();
 const layout=await page.evaluate(()=>({width:innerWidth,document_width:document.documentElement.scrollWidth}));if(layout.document_width>layout.width+1)throw Error('mobile horizontal overflow');await snap('workbench-04-mobile');steps.push('390px mobile workbench without document overflow');
 await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'退出',exact:true}).click();await login(users.student);if(await page.getByRole('button',{name:'课程质量检查',exact:true}).count())throw Error('student sees teacher navigation');
 const denied=await page.evaluate(async id=>(await fetch('/api/teacher/evaluation-datasets/'+id)).status,j.input.dataset_id);if(denied!==403)throw Error('student API not denied');steps.push('student experience unchanged; direct evaluation API denied');
 await page.getByRole('button',{name:'退出',exact:true}).click();await login(users.admin);if(!await page.getByRole('button',{name:'课程质量检查',exact:true}).isVisible())await page.getByText('更多工具',{exact:true}).click();await page.getByRole('button',{name:'课程质量检查',exact:true}).click();await page.getByRole('heading',{name:'本课检查概览',exact:true}).waitFor();if(await page.getByLabel('事项范围',{exact:true}).inputValue()!=='all')throw Error('admin all-issues scope unavailable');steps.push('administrator can inspect all responsibility groups');
 const mainContext=await browser.newContext(),mainPage=await mainContext.newPage();await mainPage.goto('http://127.0.0.1:4180/');await mainPage.getByLabel('账号',{exact:true}).waitFor();await mainContext.close();steps.push('updated main service still opens the login page');
 if(errors.length)throw Error(errors.join(';'));
 const result={status:'passed',steps,errors,layout,duration_ms:Date.now()-started,model_calls:0,docker:'real_locked_images',accounts:'isolated_synthetic',teacher_approval:false,real_user_usability:'not_observed',existing_real_records_copied_read_only_for_ui:true};
 writeFileSync(path.join(out,'browser-workbench.json'),JSON.stringify(result,null,2));writeFileSync(path.join(out,'browser-acceptance.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({status:'passed',steps:steps.length,errors:errors.length}));
}catch(e){writeFileSync(path.join(out,'browser-workbench.json'),JSON.stringify({status:'failed',error:e.message,steps,errors},null,2));await snap('workbench-failure');throw e;}
finally{await context.close();await browser.close();await app.close();}
