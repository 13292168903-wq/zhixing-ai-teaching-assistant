// Optional local hidden prompt; credentials stay only in this process environment.
if(!process.env.LONGCAT_API_KEY){
 if(!process.stdin.isTTY)throw Error('Use an interactive terminal or configure LONGCAT_API_KEY');
 process.stdout.write('LongCat API key (hidden): ');process.stdin.setRawMode(true);process.stdin.resume();
 process.env.LONGCAT_API_KEY=await new Promise(resolve=>{let value='';const read=b=>{for(const c of b.toString()){if(c==='\u0003')process.exit(130);if(c==='\r'||c==='\n'){process.stdin.off('data',read);process.stdin.setRawMode(false);process.stdout.write('\n');resolve(value.trim());return;}if(c==='\u007f'||c==='\b')value=value.slice(0,-1);else value+=c;}};process.stdin.on('data',read);});
}
process.env.TUTOR_ENABLE_REAL_MODEL='1';process.env.TUTOR_PROVIDER='longcat';process.env.TUTOR_MODEL_ID='LongCat-2.0';
if(process.argv.includes('--validate-speed')){const {validateChatSpeed}=await import('./validate-chat-speed.mjs');await validateChatSpeed();}
if(process.argv.includes('--validate-v08')){const {validateV08Live}=await import('./validate-v08-live.mjs');await validateV08Live();}
if(process.argv.includes('--validate-v09')){const {validateV09Live}=await import('./validate-v09-live.mjs');await validateV09Live();}
if(process.argv.includes('--validate-only')){delete process.env.LONGCAT_API_KEY;process.exit(0);}
await import(process.argv.includes('--pilot')?'./serve-v08.mjs':'./serve-v07.mjs');process.stdin.unref();
