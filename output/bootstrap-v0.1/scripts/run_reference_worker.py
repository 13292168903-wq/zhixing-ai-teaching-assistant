"""-I worker: local imports explicit; no external dependencies or network."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from verify_references import verify_code
import json
rows=json.load(sys.stdin)
out=[]
for r in rows:
    try:out.append({'code':r['code'],'status':'executed_fixed_reference','stdout':verify_code(r['code'])})
    except Exception as exc:out.append({'code':r['code'],'status':'error','error':str(exc)})
print(json.dumps(out,ensure_ascii=True))
