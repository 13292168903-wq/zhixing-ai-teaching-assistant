from pathlib import Path
import os, sys, json, subprocess, zipfile, uuid, hashlib

root=Path(__file__).resolve().parents[2]
out=root/'output/pilot-v0.8'
reuse='--reuse' in sys.argv
target=Path(sys.argv[sys.argv.index('--reuse')+1]).resolve() if reuse else root/'work'/('pilot08-clean-'+uuid.uuid4().hex[:8])
if not target.resolve().is_relative_to((root/'work').resolve()) or not target.name.startswith('pilot08-clean-'): raise RuntimeError('Invalid clean test path')
if (target/'platform/var/portable-smoke/platform.sqlite').exists(): raise RuntimeError('Cannot reuse a previously initialized smoke database')
target.mkdir(parents=True,exist_ok=reuse)
for name in ['知行AI助教_v0.8_源码与数据.zip','知行_v0.8_DSH运行依赖.zip']:
    if reuse and name=='知行_v0.8_DSH运行依赖.zip' and (target/'platform/runtime/dsh/runtime-links.json').exists(): continue  # Every runtime file is checked below by preflight.
    with zipfile.ZipFile(out/name) as z:
        for info in z.infolist():
            p=(target/info.filename).resolve()
            if not p.is_relative_to(target.resolve()): raise RuntimeError('Unsafe archive path')
        z.extractall(target)
node=sys.argv[1] if len(sys.argv)>1 else 'node'
env=os.environ.copy()
for k in list(env):
    if any(x in k for x in ['API_KEY','ACCESS_TOKEN','AUTH_TOKEN']): del env[k]
env['HARNESS_ROOT']=str(target/'platform/runtime/dsh')
env['TUTOR_ENABLE_REAL_MODEL']='0'
code=[]
for directory, dirs, names in os.walk(target/'platform',followlinks=False):
    dirs[:]=[d for d in dirs if d not in ['runtime','var','node_modules','__pycache__'] and not (Path(directory)/d).is_junction() and not (Path(directory)/d).is_symlink()]
    for name in names:
        p=Path(directory)/name
        if p.suffix.lower() not in ['.zip','.sqlite','.db','.pyc','.pdf'] and not name.startswith('.env'): code.append((p.relative_to(target).as_posix(),hashlib.sha256(p.read_bytes()).hexdigest()))
digest=hashlib.sha256('\n'.join(name+'\0'+sha for name,sha in sorted(code)).encode()).hexdigest()
manifest=json.loads((out/'package-manifest.json').read_text(encoding='utf-8'))
assert digest==manifest['platform_content_sha256']
report={'scope':'same_device_clean_extract_not_second_device','target':str(target),'platform_content_sha256':digest,'checks':[]}
for script,args in [('restore-runtime-links.mjs',[]),('preflight-v08.mjs',['--verify']),('portable-v08-smoke.mjs',[])]:
    run=subprocess.run([node,str(target/'platform/scripts'/script),*args],cwd=target,env=env,capture_output=True,text=True,encoding='utf-8',timeout=180)
    report['checks'].append({'script':script,'passed':run.returncode==0,'stdout':run.stdout[-6000:],'stderr':run.stderr[-1200:]})
    print(script, 'passed' if run.returncode==0 else 'failed',flush=True)
    if run.returncode: break
report['passed']=len(report['checks'])==3 and all(x['passed'] for x in report['checks'])
(out/'reports/portable-start.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
if not report['passed']: sys.exit(1)
