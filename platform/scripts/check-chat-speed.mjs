import {spawnSync} from 'node:child_process';
import {readdirSync,writeFileSync} from 'node:fs';
import {ROOT} from '../src/data.mjs';
import path from 'node:path';
const tests=readdirSync(path.join(ROOT,'tests')).filter(x=>x.endsWith('.test.mjs')).map(x=>path.join(ROOT,'tests',x));
const run=spawnSync(process.execPath,['--test',...tests],{encoding:'utf8',windowsHide:true});
const log=run.stdout+'\n'+run.stderr;writeFileSync(path.resolve(ROOT,'../output/pilot-v0.7/reports/chat-speed-tests.txt'),log);console.log(log.split(/\r?\n/).filter(s=>/^ℹ (tests|pass|fail|duration)/.test(s)).join('\n'));if(run.status!==0)process.exit(1);
