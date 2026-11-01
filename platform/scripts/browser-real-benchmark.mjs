import path from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {ROOT} from '../src/data.mjs';
import {BENCH_PASSWORD} from './benchmark-fixture.mjs';
const origin=process.env.BENCHMARK_ORIGIN;if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin||''))throw Error('Only the isolated benchmark localhost origin is allowed');
const status=await fetch(origin+'/api/status').then(r=>r.json());if(status.harness?.mode!=='real_model_explicit')throw Error('Expected actual LongCat environment');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})}),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[],mutations=[];
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')mutations.push(new URL(r.url()).pathname);});
const out=path.resolve(ROOT,'../output/benchmark-v0.1/screenshots');mkdirSync(out,{recursive:true});
try{
 await page.goto(origin);await page.getByLabel('账号',{exact:true}).fill('benchmark-teacher');await page.getByLabel('密码',{exact:true}).fill(BENCH_PASSWORD);await page.getByRole('button',{name:'登录工作空间',exact:true}).click();if(!await page.getByRole('button',{name:'课程质量检查',exact:true}).isVisible())await page.getByText('更多工具',{exact:true}).click();await page.getByRole('button',{name:'课程质量检查',exact:true}).click();
 await page.getByRole('heading',{name:'本课检查概览',exact:true}).waitFor();await page.getByRole('heading',{name:'本课检查概览',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'07-real-longcat-metrics.png')});
 await page.getByText('高级详情（维护者与研究）',{exact:true}).click();const traces=page.getByText('全部助教轨迹',{exact:true}).locator('..');await traces.locator(':scope > summary').click();const panel=traces.locator(':scope > details').first();await panel.locator(':scope > summary').click();await panel.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'08-real-longcat-feedback.png')});
 const data=await page.evaluate(async()=>{const courses=await fetch('/api/courses').then(r=>r.json()),course=courses.find(c=>c.id==='python_pilot'),ds=await fetch('/api/teacher/evaluation-datasets?course='+course.id).then(r=>r.json());return {course_id:course.id,dataset:ds.find(d=>d.counts.real_model_calls>0),status:await fetch('/api/status').then(r=>r.json())};});
 if(!data.dataset.counts.real_model_calls||errors.length||mutations.some(p=>p!=='/api/auth/login'))throw Error('Actual-model read-only browser checks failed');
 const report={status:'passed',actual_model:data.status.harness.model,course_id:data.course_id,dataset_id:data.dataset.id,observed_tutor_model_calls:data.dataset.counts.real_model_calls,model_answer_visible:true,mutations,errors,scope:'read_only_synthetic_experiment_login_only_no_added_model_task'};writeFileSync(path.join(out,'browser-real-model.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await context.close();await browser.close();}
