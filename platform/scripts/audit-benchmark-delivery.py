"""Structural delivery audit, not a semantic or teacher validation."""
from pathlib import Path
import json
root=Path(__file__).resolve().parents[2]
out=root/'output'/'benchmark-v0.1'
results=[]
for name in ['offline-verified','longcat-release']:
 d=out/name
 summary=json.loads((d/'summary.json').read_text(encoding='utf-8'))
 cases=[json.loads(s) for s in (d/'candidates.evaluator-private.jsonl').read_text(encoding='utf-8').splitlines() if s]
 public=[json.loads(s) for s in (d/'inputs.public.jsonl').read_text(encoding='utf-8').splitlines() if s]
 runs=[json.loads(s) for s in (d/'runs.evaluator-private.jsonl').read_text(encoding='utf-8').splitlines() if s]
 banned={'oracle','reference','required_points','expected_actions','private_tests','checks','execution_proof'}
 def forbidden(x):
  if isinstance(x,dict):return bool(set(x)&banned) or any(forbidden(v) for v in x.values())
  if isinstance(x,list):return any(forbidden(v) for v in x)
  return False
 checks={'completed':summary['status']=='completed','candidate_count_334':len(cases)==334,'unique_case_ids':len({c['id'] for c in cases})==len(cases),'public_and_private_ids_equal':{c['id'] for c in public}=={c['id'] for c in cases},'no_private_schema_fields_in_public':not any(forbidden(c) for c in public),'all_human_reviews_pending':all(c['review']['status']!='approved' for c in cases),'two_fresh_trials_each_run':all(len(r['trials'])==2 and len({t['trial_id'] for t in r['trials']})==2 for r in runs),'research_state_unchanged':json.loads((d/'state-isolation.json').read_text(encoding='utf-8'))['unchanged']}
 if not all(checks.values()):raise RuntimeError(str((name,checks)))
 results.append({'directory':name,'checks':checks,'candidates':len(cases),'runs':len(runs),'trials':sum(len(r['trials']) for r in runs)})
report={'status':'passed','scope':'structural_export_and_research_isolation_only','teacher_semantic_validation':False,'results':results}
(out/'reports'/'delivery-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=True))
