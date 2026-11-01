from pathlib import Path
import zipfile,uuid,json,sys
root=Path(__file__).resolve().parents[2]
out=root/'output'/'benchmark-v0.1'
record=out/'reports'/'clean-directory.json'
target=Path(json.loads(record.read_text(encoding='utf-8'))['directory']) if '--reuse' in sys.argv and record.exists() else root.parent.parent/'work'/('benchmark-clean-'+uuid.uuid4().hex[:8])
if not target.resolve().is_relative_to((root.parent.parent/'work').resolve()) or not target.name.startswith('benchmark-clean-'):raise ValueError('unexpected clean workspace')
target.mkdir(parents=True,exist_ok=True)
def extract(file,directory):
 with zipfile.ZipFile(file) as z:
  for item in z.infolist():
   resolved=(directory/item.filename).resolve()
   if not resolved.is_relative_to(directory.resolve()):raise ValueError('archive path escape')
  z.extractall(directory)
extract(out/'知行_自动评测集v0.1_可部署源码.zip',target)
if not (target/'platform/runtime/dsh/runtime-links.json').exists():extract(target/'知行_v0.8_DSH运行依赖.zip',target)
(out/'reports'/'clean-directory.json').write_text(json.dumps({'directory':str(target),'synthetic_clean_workspace':True}),encoding='utf-8')
print(json.dumps({'directory':str(target),'archive_extracted':True,'runtime_extracted':True}))
