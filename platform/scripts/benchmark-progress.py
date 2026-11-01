"""Read-only progress and cost summary; never reads or displays credentials."""
from pathlib import Path
import json,sqlite3,sys
root=Path(__file__).resolve().parents[2]
output=root/'output'/'benchmark-v0.1'
runs=[]
for directory in sorted(output.glob('longcat*')):
 runtime=directory/'private-runtime'
 if not runtime.is_dir():continue
 report={'directory':directory.name,'requests':0,'completed':0,'estimated_cny':0,'job':None}
 ledger=runtime/'experiment-longcat-budget.sqlite'
 if ledger.exists():
  db=sqlite3.connect('file:'+str(ledger.resolve())+'?mode=ro',uri=True)
  try:
   report['requests'],report['estimated_cny']=db.execute('SELECT COUNT(*),COALESCE(SUM(charged),0) FROM requests').fetchone()
   report['completed']=db.execute("SELECT COUNT(*) FROM requests WHERE status='completed'").fetchone()[0]
  finally:db.close()
 database=runtime/'platform.sqlite'
 if database.exists():
  db=sqlite3.connect('file:'+str(database.resolve())+'?mode=ro',uri=True)
  try:
   row=db.execute('SELECT status,progress,error FROM plugin_jobs ORDER BY rowid DESC LIMIT 1').fetchone()
   if row:report['job']={'status':row[0],'progress':json.loads(row[1]),'error':row[2]}
  finally:db.close()
 benchmark=runtime/'benchmark-v0.1'/'benchmark.sqlite'
 if benchmark.exists():
  db=sqlite3.connect('file:'+str(benchmark.resolve())+'?mode=ro',uri=True)
  try:
   report['candidates']=db.execute('SELECT COUNT(*) FROM benchmark_cases').fetchone()[0]
   report['case_runs']=db.execute('SELECT COUNT(*) FROM benchmark_runs').fetchone()[0]
   datasets=[json.loads(r[0]) for r in db.execute('SELECT data FROM benchmark_datasets')]
   active=[d for d in datasets if d.get('status')=='generating']
   if active:report['active_dataset']={k:active[-1].get(k) for k in ['title','arm','seed','count']}
  finally:db.close()
 runs.append(report)
summary={'requests':sum(r['requests'] for r in runs),'completed':sum(r['completed'] for r in runs),'estimated_cny':round(sum(r['estimated_cny'] for r in runs),6),'pricing':'configured_estimator_not_invoice','credential_value_in_report':False,'runs':runs}
(output/'LongCat实时进度.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
if '--brief' in sys.argv:print(json.dumps({k:v for k,v in summary.items() if k!='runs'}|{'active':[r for r in runs if r.get('job',{}).get('status')=='running']},ensure_ascii=True))
else:print(json.dumps(summary,ensure_ascii=True))
