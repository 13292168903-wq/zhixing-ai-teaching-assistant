from pathlib import Path
import re,sys,json,os
root=Path(__file__).resolve().parents[1];bad=[];count=0
paths=[]
for folder,dirs,files in os.walk(root,followlinks=False):
 dirs[:]=[d for d in dirs if d not in {'.git','runtime','var','node_modules','.venv','__pycache__'}]
 paths.extend(Path(folder)/name for name in files)
for p in paths:
 rel=p.relative_to(root).as_posix();count+=1
 if p.stat().st_size>95*1024*1024 or p.suffix.lower() in {'.sqlite','.db','.key','.pem'} or p.name.startswith('.env') and p.name!='.env.example':bad.append(rel)
 if p.suffix.lower() in {'.js','.mjs','.py','.md','.txt','.html','.json','.jsonl','.ps1','.yml'} and re.search(rb'ak_[A-Za-z0-9]{20,}',p.read_bytes()):bad.append(rel)
print(json.dumps({'files':count,'blocked_paths':bad,'status':'failed' if bad else 'passed'},ensure_ascii=True))
sys.exit(bool(bad))
