"""Package distributable source/data only; never traverse runtime links or private databases."""
from pathlib import Path
import os, re, json, hashlib, zipfile

root = Path(__file__).resolve().parents[2]
out = root / 'output/pilot-v0.8'
archive = out / '知行AI助教_v0.8_源码与数据.zip'
files = [root / 'README.md']
for base in [root / 'platform', *[root / 'output' / n for n in ['bootstrap-v0.1','pilot-v0.4','pilot-v0.5','pilot-v0.6','pilot-v0.7','pilot-v0.8']]]:
    for directory, dirs, names in os.walk(base, followlinks=False):
        dirs[:] = [d for d in dirs if d not in ['var','runtime','node_modules','__pycache__','.git'] and not (Path(directory)/d).is_junction() and not (Path(directory)/d).is_symlink()]
        for name in names:
            p = Path(directory) / name
            if p.suffix.lower() in ['.zip','.sqlite','.db','.pyc','.pdf'] or name.startswith('.env') or name in ['package-manifest.json']: continue
            if not p.is_symlink(): files.append(p)
files = sorted(set(files))
manifest = []
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for p in files:
        data = p.read_bytes()
        if re.search(rb'ak_[A-Za-z0-9]{20,}', data): raise RuntimeError('Possible secret in '+str(p.relative_to(root)))
        name = p.relative_to(root).as_posix()
        z.writestr(name, data)
        manifest.append({'path':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
code_digest=hashlib.sha256('\n'.join(name+'\0'+sha for name,sha in sorted((e['path'],e['sha256']) for e in manifest if e['path'].startswith('platform/'))).encode()).hexdigest()
report = {'file':archive.name,'files':len(manifest),'bytes':archive.stat().st_size,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'platform_content_sha256':code_digest,'excluded':['private databases','runtime dependency package (separate zip)','environment keys','node_modules'],'secret_scan':'no matching LongCat key found','entries':manifest}
(out/'package-manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k!='entries'},ensure_ascii=False))
