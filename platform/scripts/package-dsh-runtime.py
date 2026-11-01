"""Package a locked, built DS-H dependency closure. Source checkout remains read-only."""
import os, json, shutil, hashlib, zipfile, re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
SOURCE=Path(os.environ['HARNESS_ROOT']).resolve()
OUT=ROOT/'output'/'pilot-v0.8'
DEST=ROOT/'platform'/'runtime'/'dsh'
DEST.mkdir(parents=True,exist_ok=True)
links={}
seen=set()
licenses=[]
def relative(p):
    return p.resolve().relative_to(SOURCE).as_posix()
def resolve_dep(folder,name):
    current=folder
    while True:
        target=current/'node_modules'/name
        if (target/'package.json').exists(): return target.resolve()
        if current==SOURCE or current.parent==current: break
        current=current.parent
    return None
def copy_files(src,dst):
    skip={'node_modules','.git','tests','test','docs','benchmarks','coverage','.cache','.vite','__pycache__'}
    if any(src.is_relative_to(SOURCE/name) for name in ['packages','apps','vendor']):skip.add('src')
    for base,dirs,files in os.walk(src,followlinks=False):
        dirs[:]=[d for d in dirs if d not in skip and not Path(base,d).is_symlink() and not Path(base,d).is_junction()]
        for name in files:
            p=Path(base,name)
            if name.startswith('.env') or name in {'.npmrc','.pnpmfile.cjs'}: continue
            if p.suffix in {'.map','.log'}: continue
            target=dst/p.relative_to(src)
            target.parent.mkdir(parents=True,exist_ok=True)
            shutil.copyfile(p,target)
def visit(folder):
    folder=folder.resolve()
    key=relative(folder)
    if key in seen:return
    seen.add(key)
    m=json.loads((folder/'package.json').read_text(encoding='utf-8'))
    if m.get('name'): links.setdefault('node_modules/'+m['name'],key)
    dest=DEST/key
    copy_files(folder,dest)
    licenses.append({'name':m.get('name'), 'version':m.get('version'),'license':m.get('license'),'path':key})
    deps={**m.get('dependencies',{}),**m.get('optionalDependencies',{})}
    # Built entrypoints also statically import a few packages declared as dev deps upstream.
    for file in folder.glob('lib/**/*.js'):
        try: code=file.read_text(encoding='utf-8')
        except: continue
        for spec in re.findall(r'(?:from\s*|import\s*\()["\']([^"\']+)["\']',code):
            if spec.startswith(('.', '/', 'node:')):continue
            name='/'.join(spec.split('/')[:2]) if spec.startswith('@') else spec.split('/')[0]
            deps.setdefault(name,'runtime-import')
    for name in deps:
        target=resolve_dep(folder,name)
        if not target:continue  # optional native package for another OS is not installed
        target_key=relative(target)
        links[(Path(key)/'node_modules'/name).as_posix()]=target_key
        visit(target)
visit(SOURCE/'apps'/'cli')
for extra in ['packages/core/agent','packages/core/tools','packages/llm/llm','packages/bundle/headless','vendor/cordis','vendor/schemastery']:
    visit(SOURCE/extra)
for name in ['package.json','pnpm-workspace.yaml','pnpm-lock.yaml','LICENSE','THIRD_PARTY_NOTICES.md']:
    p=SOURCE/name
    if p.exists():shutil.copyfile(p,DEST/name)
(DEST/'runtime-links.json').write_text(json.dumps(links,indent=2),encoding='utf-8')
(DEST/'RUNTIME-LICENSES.json').write_text(json.dumps(licenses,indent=2),encoding='utf-8')
files=[]
for base,dirs,names in os.walk(DEST,followlinks=False):
    dirs[:]=[d for d in dirs if not Path(base,d).is_symlink() and not Path(base,d).is_junction()]
    files.extend(Path(base,n) for n in names if Path(base,n).is_file())
files.sort()
manifest={p.relative_to(DEST).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
lock={'source_version':json.loads((SOURCE/'package.json').read_text())['version'],'identity':'built_snapshot_sha256_no_verified_commit_available','files':manifest,'aggregate_sha256':hashlib.sha256(json.dumps(manifest,sort_keys=True).encode()).hexdigest(),'packages':len(seen),'symlinks':len(links)}
(OUT/'dsh-runtime.lock.json').write_text(json.dumps(lock,indent=2),encoding='utf-8')
archive=OUT/'知行_v0.8_DSH运行依赖.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for p in files:z.write(p,'platform/runtime/dsh/'+p.relative_to(DEST).as_posix())
with zipfile.ZipFile(archive) as z:
    if z.testzip():raise RuntimeError('CRC failed')
print(json.dumps({'packages':len(seen),'files':len(files),'links':len(links),'bytes':archive.stat().st_size,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest()}))

