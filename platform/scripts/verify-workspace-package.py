"""Same-device clean directory extraction, content checks, launcher and offline smoke."""
from pathlib import Path
import hashlib, json, os, subprocess, sys, uuid, zipfile
root=Path(__file__).resolve().parents[2]
out=root/'output/workspace-delivery'
archive=out/'知行_布局A接口联调版_2026-10-30.zip'
target=root/'platform/var'/('delivery-clean-'+uuid.uuid4().hex[:8])
target.mkdir(parents=True)
with zipfile.ZipFile(archive) as z:
 for i in z.infolist():
  p=(target/i.filename).resolve()
  if not p.is_relative_to(target.resolve()): raise RuntimeError('Unsafe zip path')
  if any(x in {'var','.venv','.env'} for x in Path(i.filename).parts) or Path(i.filename).suffix in {'.db','.sqlite'}: raise RuntimeError('Private state in archive')
 z.extractall(target)
manifest=json.loads((target/'交付清单.json').read_text(encoding='utf-8'))
for entry in manifest['entries']:
 p=target/entry['path']
 assert hashlib.sha256(p.read_bytes()).hexdigest()==entry['sha256'],entry['path']
env=os.environ.copy()
for k in list(env):
 if any(s in k for s in ['API_KEY','ACCESS_TOKEN','AUTH_TOKEN']): del env[k]
env['TUTOR_ENABLE_REAL_MODEL']='0'
env.pop('HARNESS_ROOT',None)
pwsh=r'C:\Program Files\PowerShell\7\pwsh.exe'
report={'scope':'same_device_clean_extract_not_second_device','target':str(target),'manifest_files_verified':len(manifest['entries']),'checks':[]}
commands=[('launcher_check',[pwsh,'-NoProfile','-File',str(target/'platform/start-workspace.ps1'),'-CheckOnly']),('connected_workspace',['node',str(target/'platform/scripts/portable-workspace-smoke.mjs')]),('offline_runtime',['node',str(target/'platform/scripts/portable-v09-smoke.mjs')])]
for name,cmd in commands:
 run=subprocess.run(cmd,cwd=target,env=env,capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=300)
 report['checks'].append({'name':name,'passed':run.returncode==0,'stdout':run.stdout[-8000:],'stderr':run.stderr[-1800:]})
 print(name,'passed' if run.returncode==0 else 'failed',flush=True)
 if run.returncode: break
report['passed']=len(report['checks'])==3 and all(c['passed'] for c in report['checks'])
(out/'reports/portable-start.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
sys.exit(0 if report['passed'] else 1)
