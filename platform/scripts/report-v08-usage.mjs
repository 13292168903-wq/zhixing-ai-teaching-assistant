import {DatabaseSync} from 'node:sqlite';
import {readdirSync,existsSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {ROOT} from '../src/data.mjs';
const requests=new Map();
for(const name of readdirSync(path.join(ROOT,'var')).filter(n=>n.startsWith('v08-isolated-'))){const dir=path.join(ROOT,'var',name),file=path.join(dir,'longcat-budget.sqlite'),logs=path.join(dir,'harness');if(!existsSync(file)||!existsSync(logs))continue;const own=new Set(readdirSync(logs));const db=new DatabaseSync(file,{readOnly:true});for(const r of db.prepare('SELECT id,run_id,charged,status,usage,created FROM requests').all())if(own.has(r.run_id))requests.set(r.id,r);db.close();}
const rows=[...requests.values()],report={scope:'v08_real_acceptance_attempts_isolated_synthetic_fixtures',requests:rows.length,completed:rows.filter(r=>r.status==='completed').length,failed_or_unknown:rows.filter(r=>r.status!=='completed').length,estimated_cny:rows.reduce((n,r)=>n+r.charged,0),pricing:'conservative undiscounted input 5/output 20 CNY per million; not an account invoice',automatic_retry:false,rows};
writeFileSync(path.resolve(ROOT,'../output/pilot-v0.8/reports/longcat-all-attempts-usage.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,rows:undefined}));
