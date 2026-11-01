import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {toDatasetCandidate} from './dataset_candidate.mjs';
const rows=readFileSync(new URL('../optimizer_allowed/dev_cases.jsonl',import.meta.url),'utf8').trim().split('\n').map(JSON.parse);
for(const [i,row] of rows.entries()) {
 const c=toDatasetCandidate(row,i);assert.equal(c.split,'generated');assert.equal(c.spec.datasetPartition,'dev');
 assert.equal(c.group,row.leakage_group);assert.deepEqual(c.referenceAnswer,row.reference);assert.equal(c.fingerprint.length,64);
 assert.throws(()=>toDatasetCandidate({...row,split:'test'}),/Only DEV/);
 assert.throws(()=>toDatasetCandidate({...row,split:'validation'}),/Only DEV/);
}
console.log(`Adapter shape and partition guards passed for ${rows.length} DEV records; Harness runtime integration was not run.`);
