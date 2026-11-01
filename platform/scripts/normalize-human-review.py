import csv,json,sys
from pathlib import Path
rows=list(csv.DictReader(Path(sys.argv[1]).read_text(encoding='utf-8-sig').splitlines()))
assert len(rows)==56, 'Expected 56 original review rows'
assert len({(r['record_type'],r['course_id'],r['record_id']) for r in rows})==56
assert all(r['review_status'] in ('approved','needs_revision','pending') and r['review_notes'].strip() for r in rows)
Path(sys.argv[2]).write_text(json.dumps({'review_scope':'project_group_preliminary_review_v0.4','formal_teacher_approval':False,'rows':rows},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({s:sum(r['review_status']==s for r in rows) for s in ('approved','needs_revision','pending')}))
