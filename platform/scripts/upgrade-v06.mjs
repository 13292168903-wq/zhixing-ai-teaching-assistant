import {writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {createApp} from '../src/server.mjs';
import {ROOT} from '../src/data.mjs';
import {setupV06} from '../src/v06.mjs';
import {statisticsPack} from '../src/statistics-pack.mjs';
process.env.TUTOR_ENABLE_REAL_MODEL='0';
const out=path.resolve(ROOT,'../output/pilot-v0.6'),app=await createApp({port:0,defaultEngine:'local'});
try{const report=await setupV06(app);mkdirSync(path.join(out,'course-packs'),{recursive:true});writeFileSync(path.join(out,'course-packs/statistics_pilot.json'),JSON.stringify(statisticsPack(),null,2));writeFileSync(path.join(out,'reports/upgrade.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}finally{await app.close();}
