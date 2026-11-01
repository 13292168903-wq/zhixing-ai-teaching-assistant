from pathlib import Path
import os,json,hashlib,zipfile,re
ROOT=Path(__file__).resolve().parents[1]
PROJECT=ROOT.parent
report=json.loads((ROOT/'reports/checks.json').read_text(encoding='utf-8'))
if not all(r['passed'] for r in report['results']):raise RuntimeError('Checks have not passed')
paths=[]
for base in [ROOT,PROJECT/'output/bootstrap-v0.1',PROJECT/'output/pilot-v0.4']:
 for folder,dirs,names in os.walk(base):
  dirs[:]=[d for d in dirs if d not in ['var','tmp_rebuild','__pycache__','.git','node_modules']]
  for name in names:
   p=Path(folder)/name
   if p.suffix.lower() not in ['.zip','.sqlite','.db','.log'] and not name.startswith('.env'):
    paths.append(p)
paths=sorted(set(paths))
output=PROJECT/'output/pilot-v0.4/AI助教平台_v0.4_源码与试点数据.zip'
for p in paths:
 if re.search(rb'ak_[A-Za-z0-9]{20,}',p.read_bytes()):raise RuntimeError('Potential credential detected; packaging stopped without printing its value')
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as z:
 for p in paths:z.write(p,str(p.relative_to(PROJECT)).replace('\\','/'))
 z.writestr('DELIVERY_CHECKSUMS.json',json.dumps({str(p.relative_to(PROJECT)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},ensure_ascii=False,indent=2))
with zipfile.ZipFile(output) as check:
 assert check.testzip() is None
 saved=json.loads(check.read('DELIVERY_CHECKSUMS.json'))
 assert all(hashlib.sha256(check.read(name)).hexdigest()==value for name,value in saved.items())
 assert not any('/var/' in name or name.endswith('.sqlite') for name in check.namelist())
print(json.dumps({'archive':str(output),'files':len(paths),'bytes':output.stat().st_size,'excluded':'live runtime data, sessions, secrets, DB and upstream dependencies'},ensure_ascii=True))
