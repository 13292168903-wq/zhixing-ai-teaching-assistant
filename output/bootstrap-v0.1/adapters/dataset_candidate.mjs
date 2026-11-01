/** Compatibility adapter only. No Harness runtime or model is started here.
 * Feed DEV records only; references are evaluator data, never student context.
 */
import {createHash} from 'node:crypto';
const stable = value => Array.isArray(value) ? '['+value.map(stable).join(',')+']' :
  value && typeof value==='object' ? '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}' : JSON.stringify(value);
export function toDatasetCandidate(record, index=0) {
  if (record.kind!=='eval' || record.split!=='dev') throw new Error('Only DEV evaluation records may enter the generator adapter');
  if (!record.reference || !record.family_id || !record.leakage_group) throw new Error('Incomplete teaching record');
  const payload={course_id:record.course_id,concept_id:record.concept_id,messages:record.messages,
    initial_state:record.initial_state,tool_fixtures:record.tool_fixtures};
  return {id:record.id,source:'teaching-'+record.course_id,family:record.family_id,
    instruction:record.messages.map(m=>m.content).join('\n'),referenceAnswer:record.reference,
    spec:{schema_version:record.schema_version,teaching:payload,datasetPartition:'dev'},
    fingerprint:createHash('sha256').update(stable(payload)).digest('hex'),group:record.leakage_group,
    split:'generated',sourceRefs:record.source_refs,license:record.provenance.license,
    generator:{name:'teaching-bootstrap-adapter',version:'0.1.0',seed:20261020,index}};
}
