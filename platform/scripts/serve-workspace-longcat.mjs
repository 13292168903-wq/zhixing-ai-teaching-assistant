// Same layout and database as serve-workspace; the key stays in process memory.
if(!process.env.LONGCAT_API_KEY){
 if(!process.stdin.isTTY)throw Error('请在交互终端运行，或通过本机环境配置LONGCAT_API_KEY');
 process.stdout.write('LongCat API key (hidden): ');process.stdin.setRawMode(true);process.stdin.resume();
 process.env.LONGCAT_API_KEY=await new Promise(resolve=>{let value='';const read=b=>{for(const c of b.toString()){if(c==='\u0003')process.exit(130);if(c==='\r'||c==='\n'){process.stdin.off('data',read);process.stdin.setRawMode(false);process.stdout.write('\n');resolve(value.trim());return;}if(c==='\u007f'||c==='\b')value=value.slice(0,-1);else value+=c;}};process.stdin.on('data',read);});
 if(!process.env.LONGCAT_API_KEY)throw Error('密钥不能为空');
}
process.env.TUTOR_ENABLE_REAL_MODEL='1';process.env.TUTOR_PROVIDER='longcat';process.env.TUTOR_MODEL_ID='LongCat-2.0';
const {startWorkspace}=await import('./serve-workspace.mjs');
const app=await startWorkspace();console.log('知行 · 布局A / LongCat：'+app.origin);console.log('数据目录：'+app.pilot.varDir);
const stop=async()=>{await app.close();process.exit(0);};process.on('SIGINT',stop);process.on('SIGTERM',stop);process.stdin.unref();
