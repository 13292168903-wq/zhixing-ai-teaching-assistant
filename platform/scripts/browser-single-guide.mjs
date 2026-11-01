import path from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {ROOT} from '../src/data.mjs';
import {benchmarkFixture,BENCH_PASSWORD} from './benchmark-fixture.mjs';
const {app,users}=await benchmarkFixture(),out=path.resolve(ROOT,'../output/frontend-v1');mkdirSync(path.join(out,'screenshots'),{recursive:true});
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href),browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH}),context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[],steps=[];
page.on('pageerror',e=>errors.push(e.message));
const click=async name=>page.getByRole('button',{name,exact:true}).first().click();
async function check(){await page.getByRole('button',{name:'打开小知帮助向导',exact:true}).waitFor();await click('重新调出知行向导');const panel=page.getByRole('region',{name:'知行向导帮助面板',exact:true});await panel.waitFor();assert.equal(await panel.getByRole('combobox').count(),0);assert.equal(await panel.getByText('小知 · 知行向导',{exact:true}).count(),1);await click('打开向导菜单');assert.equal(await page.getByRole('menu').getByRole('button',{name:/切换/}).count(),0);await click('本次隐藏');assert.equal(await page.getByRole('button',{name:'打开小知帮助向导',exact:true}).count(),0);await click('重新调出知行向导');await panel.waitFor();await click('操作引导');assert.ok(await panel.locator('.guide-tour').count()>0);await panel.locator('.guide-tour').first().click();await panel.getByRole('button',{name:'下一步',exact:true}).waitFor();await click('退出引导');await click('问一问');await panel.getByLabel('向导问题').fill('你是谁');await panel.getByRole('button',{name:'发送',exact:true}).click();await panel.getByText(/我是小知，知行平台的使用向导/).waitFor();assert.equal(await panel.getByText(/小行|切换角色/).count(),0);await click('关闭向导帮助');}
try{
 await page.goto(app.origin);await check();steps.push('visitor sees a single guide with local help, tours and hide/recall');
 for(const role of ['admin','teacher','student']){
  await page.getByLabel('账号',{exact:true}).fill(users[role].username);await page.getByLabel('密码',{exact:true}).fill(BENCH_PASSWORD);await click('登录工作空间');await page.getByRole('button',{name:'退出',exact:true}).waitFor();
  await check();steps.push(role+' uses the same guide without character selector or switch menu');
  if(role==='student'){
   const body=await (await context.request.get(app.origin+'/api/guide/history')).json();assert.equal(body.at(-1).result.runtime.real_model_calls,0);
   const before=app.store.db.prepare('SELECT COUNT(*) n FROM submissions').get().n;
   await context.request.post(app.origin+'/api/guide/preferences',{data:{character:'xiaoxing',position:{x:.3,y:.2},proactive:false,reduced_motion:true}});await page.reload();await page.getByRole('button',{name:'打开小知帮助向导',exact:true}).waitFor();const prefs=await (await context.request.get(app.origin+'/api/guide/preferences')).json();assert.equal(prefs.character,'xiaozhi');assert.equal(prefs.position.x,.3);steps.push('legacy preference becomes xiaozhi and preserves position and history');
   await page.getByRole('button',{name:'打开小知帮助向导',exact:true}).focus();await page.keyboard.press('ArrowRight');await click('重新调出知行向导');await page.screenshot({path:path.join(out,'screenshots/07-single-guide-desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'screenshots/08-single-guide-mobile.png'),fullPage:true});const dims=await page.evaluate(()=>({w:document.documentElement.scrollWidth,v:innerWidth}));assert.equal(dims.w,dims.v);assert.equal(app.store.db.prepare('SELECT COUNT(*) n FROM submissions').get().n,before);steps.push('keyboard movement and 390px layout work; help does not create learning evidence');
  }else{await click('退出');await page.getByRole('button',{name:'登录工作空间',exact:true}).waitFor();}
 }
 for(const name of ['xiaozhi','xiaoxing']){const r=await fetch(app.origin+'/guide-assets/'+name+'-idle.png');assert.equal(r.status,200);}
 const a=Buffer.from(await (await fetch(app.origin+'/guide-assets/xiaozhi-idle.png')).arrayBuffer()),b=Buffer.from(await (await fetch(app.origin+'/guide-assets/xiaoxing-idle.png')).arrayBuffer());assert.ok(a.equals(b));steps.push('legacy asset URL aliases the same single artwork');assert.deepEqual(errors,[]);
 const report={status:'passed',steps,errors,model_calls:0,scope:'isolated_synthetic_no_production_writes'};writeFileSync(path.join(out,'guide-merge-browser.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:'passed',steps:steps.length,errors:errors.length}));
}catch(e){writeFileSync(path.join(out,'guide-merge-browser.json'),JSON.stringify({status:'failed',error:e.message,steps,errors},null,2));throw e;}finally{await context.close();await browser.close();await app.close();}
