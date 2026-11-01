from pathlib import Path
import os,json,re,hashlib,zipfile
project=Path(__file__).resolve().parents[2]
checks=json.loads((project/'platform/reports/checks.json').read_text(encoding='utf-8'))
assert all(r['passed'] for r in checks['results'])
files=[project/'README.md',project/'.gitignore']
for base in [project/'platform',project/'output/bootstrap-v0.1',project/'output/pilot-v0.4',project/'output/pilot-v0.5',project/'output/pilot-v0.6']:
 for folder,dirs,names in os.walk(base):
  dirs[:]=[d for d in dirs if d not in ('var','__pycache__','node_modules','.git','tmp_rebuild')]
  for name in names:
   p=Path(folder)/name
   if p.suffix.lower() in ('.zip','.sqlite','.db','.log') or name.startswith('.env') or name=='package-verification.json':continue
   if re.search(rb'ak_[A-Za-z0-9]{20,}',p.read_bytes()):raise RuntimeError('Credential pattern detected; package stopped without printing contents')
   files.append(p)
files=sorted(set(files));archive=project/'output/pilot-v0.6/知行_v0.6_源码与课程审核包.zip'
manifest={p.relative_to(project).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
 for p in files:z.write(p,p.relative_to(project).as_posix())
 z.writestr('DELIVERY_CHECKSUMS.json',json.dumps(manifest,ensure_ascii=False,indent=2))
with zipfile.ZipFile(archive) as z:
 assert z.testzip() is None
 assert all(hashlib.sha256(z.read(name)).hexdigest()==digest for name,digest in manifest.items())
 assert not any('/var/' in name or name.endswith('.sqlite') for name in z.namelist())
report={'files':len(files),'bytes':archive.stat().st_size,'checksum_verified':True,'credentials_and_runtime_excluded':True,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest()}
(project/'output/pilot-v0.6/reports/package-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report))
