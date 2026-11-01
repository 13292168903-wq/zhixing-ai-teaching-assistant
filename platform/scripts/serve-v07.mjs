import {createApp} from '../src/server.mjs';
const app=await createApp({port:Number(process.env.PORT||3810)});
console.log('知行 v0.7 ready: '+app.origin+'; automatic model requests: 0');
const close=async()=>{delete process.env.LONGCAT_API_KEY;await app.close();process.exit(0);};
process.on('SIGINT',close);process.on('SIGTERM',close);
