"""Build a portable source archive without runtime state, keys or sealed references."""
from pathlib import Path
import hashlib,json,zipfile,os

root=Path(__file__).resolve().parents[2]
out=root/'output'/'benchmark-v0.1'
out.mkdir(parents=True,exist_ok=True)
archive=out/'知行_自动评测集v0.1_可部署源码.zip'
allowed_roots={'README.md','交付说明.md','启动知行.cmd','本机启动.cmd','本机启动.ps1','启动课程质量检查.cmd','知行_v0.8_DSH运行依赖.zip'}
output_parts={'courses','course-packs','datasets','materials','public','eval','optimizer_allowed','sources','configs','adapters','baseline','scripts'}
skip_parts={'var','runtime','.venv','node_modules','__pycache__','.git','.codex','private-runtime','holdout','reviewer_private','sealed'}
paths=[];excluded_secrets=[]
def source_files():
 for folder,dirs,files in os.walk(root,topdown=True,followlinks=False):
  dirs[:]=[d for d in dirs if d not in skip_parts and 'sealed' not in d.lower() and 'holdout' not in d.lower()]
  for name in files:yield Path(folder)/name
for f in source_files():
 rel=f.relative_to(root);parts=rel.parts
 if f.name in {'源码包校验.json','clean-directory.json','portable-start.json','evaluation-lab-before-workbench.js','browser-before-workbench.mjs','workbench-failure.png'}:continue
 if any(p in skip_parts for p in parts) or any('sealed' in p.lower() or 'holdout' in p.lower() for p in parts):continue
 if f.name.startswith('.env') or f.suffix in {'.sqlite','.sqlite-wal','.sqlite-shm','.db','.key','.pem'}:continue
 include=False
 if len(parts)==1:include=f.name in allowed_roots
 elif parts[0]=='platform':include=parts[1]!='reports'
 elif parts[0]=='output':
  if parts[1]=='frontend-v1':include=(len(parts)==3 and f.suffix in {'.md','.json'}) or len(parts)>3 and parts[2] in {'screenshots','reports'} and f.name!='failure.png'
  elif parts[1]=='benchmark-v0.1':include=len(parts)>2 and parts[2] in {'offline-verified','longcat-release','longcat-probe-v1','evidence-binding-v0.1.1','evidence-binding-offline-v0.1.1-verified','reports','screenshots'} or len(parts)==3 and f.suffix in {'.md','.json'}
  else:include=(len(parts)>2 and parts[2] in output_parts) or len(parts)==3 and f.name in {'dsh-runtime.lock.json','README.md'}
 if not include or f==archive:continue
 if f.suffix.lower() in {'.mjs','.js','.py','.ps1','.cmd','.md','.txt','.json','.jsonl','.html','.css'}:
  import re
  if re.search(rb'ak_[A-Za-z0-9]{20,}',f.read_bytes()):excluded_secrets.append(str(rel));continue
 paths.append(f)
manifest=[]
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for f in sorted(paths):
  rel=f.relative_to(root).as_posix();data=f.read_bytes();manifest.append({'path':rel,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
  z.writestr(rel,data,compress_type=zipfile.ZIP_STORED if f.suffix=='.zip' else zipfile.ZIP_DEFLATED)
 z.writestr('源码文件清单.json',json.dumps({'files':manifest,'excluded_runtime_state':True,'existing_sealed_references_distributed':False,'secret_pattern_exclusions':excluded_secrets},ensure_ascii=False,indent=2))
checksum=hashlib.sha256(archive.read_bytes()).hexdigest()
(out/'源码包校验.json').write_text(json.dumps({'archive':archive.name,'bytes':archive.stat().st_size,'sha256':checksum,'files':len(paths),'secret_pattern_exclusions':excluded_secrets,'runtime_bundle_included':True},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'archive':str(archive),'bytes':archive.stat().st_size,'files':len(paths),'excluded_secret_files':len(excluded_secrets)},ensure_ascii=False))
