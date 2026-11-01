import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {ROOT} from '../src/data.mjs';
// Source manifest only. ZIP creation uses Python's standard library below.
const checks=JSON.parse(readFileSync(path.join(ROOT,'reports/checks.json'),'utf8'));
if(checks.results.some(x=>!x.passed))throw new Error('Checks have not passed');
writeFileSync(path.join(ROOT,'reports/delivery.json'),JSON.stringify({version:'0.4.0',checks:checks.results,live_url:'http://127.0.0.1:3810',
 platform:'local_web_prototype',bootstrap_version:'0.1.0',paid_calls_in_checks:0,
 deferred:['formal_identity_provider','teacher_adjudication','isolated_student_code_runner','open_ended_adaptive_search','controlled_AB_C_learning_experiment'],
 no_empirical_learning_gain_claim:true},null,2));
console.log('Delivery manifest ready. Run scripts/package.py to produce the source archive.');
