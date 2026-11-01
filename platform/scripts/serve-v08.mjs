import path from 'node:path';
import {ROOT} from '../src/data.mjs';
import {createApp} from '../src/server.mjs';
import {bootstrapV08} from './bootstrap-v08.mjs';
const app=await createApp({mode:'pilot',port:Number(process.env.PORT||3811),varDir:process.env.TUTOR_V08_VAR||path.join(ROOT,'var/pilot-v0.8'),defaultEngine:'harness'});
await bootstrapV08(app);console.log('知行 v0.9 本机试点：'+app.origin+'；首次访问由本人设置管理员；无自动模型调用');
process.on('SIGINT',async()=>{await app.close();process.exit(0);});process.on('SIGTERM',async()=>{await app.close();process.exit(0);});
