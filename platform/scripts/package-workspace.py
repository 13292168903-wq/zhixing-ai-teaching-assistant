"""Build one clean handoff archive with a nested, integrity-locked DS-H runtime."""
from pathlib import Path
import hashlib, json, os, re, zipfile

root = Path(__file__).resolve().parents[2]
out = root / 'output/workspace-delivery'
out.mkdir(parents=True, exist_ok=True)
archive = out / '知行_布局A接口联调版_2026-10-30.zip'
runtime = root / '知行_v0.8_DSH运行依赖.zip'
blocked = {'var', 'runtime', 'node_modules', '__pycache__', '.git', '.venv'}
files = [root / n for n in ['README.md', '交付说明.md', '启动知行.cmd']]
bases = [root/'platform', *[root/'output'/n for n in ['bootstrap-v0.1','pilot-v0.4','pilot-v0.5','pilot-v0.6','pilot-v0.7','pilot-v0.8','pilot-v0.9']], out/'reports']
for base in bases:
    for directory, dirs, names in os.walk(base, followlinks=False):
        dirs[:] = [d for d in dirs if d not in blocked and not (Path(directory)/d).is_junction() and not (Path(directory)/d).is_symlink()]
        for name in names:
            p = Path(directory)/name
            if p.suffix.lower() in {'.zip','.sqlite','.db','.pyc','.log'} or name.startswith('.env') or name in {'package-manifest.json','manifest.json.sha256'}: continue
            if not p.is_symlink(): files.append(p)
files = sorted(set(files))
secret = re.compile(rb'ak_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{32,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\r?\n[A-Za-z0-9+/=\r\n]{64,}')
entries=[]
with zipfile.ZipFile(runtime) as z:
    for info in z.infolist():
        parts=Path(info.filename).parts
        if info.filename.startswith(('/', '\\')) or '..' in parts or any(x.startswith('.env') or x.endswith(('.sqlite','.db','.pem')) for x in parts): raise RuntimeError('Unsafe nested runtime entry')
        if not info.is_dir() and Path(info.filename).suffix.lower() not in {'.exe','.dll','.node','.png','.jpg','.gif','.ico','.woff','.woff2','.ttf'} and secret.search(z.read(info)): raise RuntimeError('Possible secret in nested runtime: '+info.filename)
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for p in files:
        data=p.read_bytes()
        if secret.search(data): raise RuntimeError('Possible secret in '+str(p.relative_to(root)))
        name=p.relative_to(root).as_posix()
        z.writestr(name,data)
        entries.append({'path':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
    data=runtime.read_bytes()
    z.writestr(runtime.name,data,compress_type=zipfile.ZIP_STORED)
    entries.append({'path':runtime.name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
    manifest={'version':'layout-a-connected-2026-10-30','entries':entries,'excludes':['private databases','accounts','environment keys','local runtime trees','virtual environments'],'secret_scan':'source and nested runtime: no matching credentials'}
    z.writestr('交付清单.json',json.dumps(manifest,ensure_ascii=False,indent=2))
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
digest=hashlib.sha256(archive.read_bytes()).hexdigest()
(out/'SHA256.txt').write_text(digest+'  '+archive.name+'\n',encoding='utf-8')
(out/'package-manifest.json').write_text(json.dumps({**manifest,'archive':archive.name,'archive_bytes':archive.stat().st_size,'archive_sha256':digest},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'archive':str(archive),'files':len(entries),'bytes':archive.stat().st_size,'sha256':digest},ensure_ascii=False))
