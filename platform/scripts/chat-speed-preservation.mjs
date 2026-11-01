import {DatabaseSync,backup} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {ROOT} from '../src/data.mjs';
import path from 'node:path';
const report=path.resolve(ROOT,'../output/pilot-v0.7/reports/chat-speed-preservation.json'),db=new DatabaseSync(path.join(ROOT,'var/platform.sqlite'),{readOnly:true});
const snapshot=()=>Object.fromEntries(['states','submissions','reviews','assignments'].map(t=>{const rows=db.prepare('SELECT * FROM '+t+' ORDER BY rowid').all();return [t,{count:rows.length,sha256:createHash('sha256').update(JSON.stringify(rows)).digest('hex')}];}));
if(process.argv.includes('--before')){
 if(db.prepare("SELECT COUNT(*) n FROM plugin_jobs WHERE status IN ('running','queued')").get().n)throw Error('Plugin jobs not idle');
 mkdirSync(path.join(ROOT,'var/backups'),{recursive:true});const target=path.join(ROOT,'var/backups/pre-chat-speed-'+Date.now()+'.sqlite');await backup(db,target);writeFileSync(report,JSON.stringify({before:snapshot(),backup:target},null,2));
}else{const r=JSON.parse(readFileSync(report,'utf8'));r.after=snapshot();r.unchanged=JSON.stringify(r.before)===JSON.stringify(r.after);writeFileSync(report,JSON.stringify(r,null,2));console.log(JSON.stringify({unchanged:r.unchanged,tables:Object.keys(r.before)}));if(!r.unchanged)throw Error('Records changed; inspect report');}db.close();
