import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {ROOT} from '../src/data.mjs';
// Existing servers already whitelist /plugin-lab.js: a public-only update must not
// break their login page while the owner prepares the new server environment.
const file=path.join(ROOT,'public/plugin-lab.js'),marker='\n/* EVALUATION_FACTORY_UI_BEGIN */\n';
const base=readFileSync(file,'utf8').split(marker)[0];
writeFileSync(file,base+marker+readFileSync(path.join(ROOT,'public/evaluation-lab.js'),'utf8'));
