"""Create a source/data handoff without credentials or local runtime databases."""
from pathlib import Path
import hashlib
import json
import re
import zipfile

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output' / 'pilot-v0.7'
ARCHIVE = OUT / '知行AI助教_v0.7_源码与验收.zip'
roots = [ROOT / 'platform'] + [ROOT / 'output' / name for name in (
    'bootstrap-v0.1', 'pilot-v0.4', 'pilot-v0.5', 'pilot-v0.6', 'pilot-v0.7')]
excluded = {'var', '.git', 'node_modules', '__pycache__', 'tmp_rebuild'}
binary_skip = {'.sqlite', '.db', '.pyc', '.zip', '.exe', '.msi', '.vhdx', '.log'}
files = [ROOT / 'README.md']
for folder in roots:
    for file in sorted(folder.rglob('*')):
        if not file.is_file() or any(p in excluded for p in file.relative_to(folder).parts):
            continue
        if file.suffix.lower() in binary_skip or file.name.startswith('.env'):
            continue
        if file.name in {'源码包.sha256', 'source-package.json'}:
            continue
        files.append(file)
suspects = []
for file in files:
    if re.search(rb'ak_[A-Za-z0-9]{20,}', file.read_bytes()):
        suspects.append(file.relative_to(ROOT).as_posix())
if suspects:
    raise SystemExit('Credential scan rejected paths: ' + json.dumps(suspects))
with zipfile.ZipFile(ARCHIVE, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as bundle:
    for file in files:
        bundle.write(file, file.relative_to(ROOT).as_posix())
with zipfile.ZipFile(ARCHIVE) as bundle:
    bad = bundle.testzip()
    names = set(bundle.namelist())
    required = {'platform/src/server.mjs', 'platform/scripts/bootstrap-v07.mjs',
                'platform/plugins/exercise-factory/index.mjs',
                'platform/plugins/student-simulator/index.mjs',
                'platform/plugins/teaching-policy/index.mjs',
                'platform/sandbox/images.lock.json',
                'output/pilot-v0.7/验收报告.md'}
    if bad or required - names:
        raise SystemExit('Archive verification failed')
digest = hashlib.sha256(ARCHIVE.read_bytes()).hexdigest()
(OUT / '源码包.sha256').write_text(digest + '  ' + ARCHIVE.name + '\n', encoding='utf-8')
report = {'archive': ARCHIVE.name, 'sha256': digest, 'files': len(files),
          'bytes': ARCHIVE.stat().st_size, 'crc_check': 'passed',
          'credential_pattern_matches': 0, 'runtime_databases_included': False,
          'external_dependencies': ['Node.js >=24', 'built DS-H runtime',
                                    'Python document parser dependencies', 'Docker Linux engine/images']}
(OUT / 'reports' / 'source-package.json').write_text(
    json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report, ensure_ascii=False))
