import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createApp} from '../src/server.mjs';
import {bootstrapV08} from './bootstrap-v08.mjs';
import {ROOT} from '../src/data.mjs';
export async function startWorkspace({port=Number(process.env.PORT||4180),varDir=process.env.ZHIXING_WORKSPACE_DATA||path.join(ROOT,'var/workspace-v1'),seed=true}={}){
 const app=await createApp({mode:'pilot',port,varDir,defaultEngine:process.env.TUTOR_ENABLE_REAL_MODEL==='1'?'harness':'local'});
 try{if(seed)await bootstrapV08(app,{legacyDir:path.join(varDir,'no-legacy-import')});return app;}catch(e){await app.close();throw e;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const app=await startWorkspace();console.log('知行 · 布局 A 已连接后端：'+app.origin);console.log('数据目录：'+app.pilot.varDir+'；首次运行请在页面初始化管理员。');
 const stop=async()=>{await app.close();process.exit(0);};process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
