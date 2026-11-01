"""Produce separate runtime/dev bundles plus the reviewer-only full handoff."""
from pathlib import Path
import hashlib,json,zipfile,os
from build_dataset import ROOT,dump

def files():
    result=[]
    for folder,dirs,names in os.walk(ROOT):
        dirs[:]=[d for d in dirs if d not in ['__pycache__','tmp_rebuild']]
        for name in names:
            p=Path(folder)/name
            if p.suffix!='.zip' and p.name!='package_checksums.json':result.append(p)
    return sorted(result)

def bundle(path,selected):
    with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED) as archive:
        for p in sorted(set(selected)):archive.write(p,str(p.relative_to(ROOT)).replace('\\','/'))

def main():
    allfiles=files()
    common=[ROOT/'sources/NOTICE.md',ROOT/'sources/raw/py_license.html',ROOT/'POLICY.md']
    course=[p for p in allfiles if 'courses'==p.relative_to(ROOT).parts[0]]
    runtime=common+course+[ROOT/'public/learning_inputs.jsonl']
    optimizer=common+course+[ROOT/'optimizer_allowed/dev_cases.jsonl']
    bundle(ROOT/'runtime_bundle.zip',runtime)
    bundle(ROOT/'optimizer_dev_bundle.zip',optimizer)
    with zipfile.ZipFile(ROOT/'runtime_bundle.zip') as archive:
        assert not any(any(term in name for term in ['reference','holdout','catalog','reviewer_private','optimizer_allowed']) for name in archive.namelist())
    with zipfile.ZipFile(ROOT/'optimizer_dev_bundle.zip') as archive:
        assert not any(any(term in name for term in ['validation','holdout','catalog','reviewer_private']) for name in archive.namelist())
    dump(Path('reports/access_boundary_checks.json'),{'runtime_reference_or_holdout_files':0,'optimizer_validation_or_holdout_files':0,
         'scope':'ZIP allowlists verified; filesystem permissions and production role enforcement not implemented.'})
    allfiles=files()
    checksums={str(p.relative_to(ROOT)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in allfiles}
    dump(Path('package_checksums.json'),checksums)
    full=ROOT.parent/'AI助教平台_首批数据与实施方案_v0.1.zip'
    bundle(full,files()+[ROOT/'package_checksums.json',ROOT/'runtime_bundle.zip',ROOT/'optimizer_dev_bundle.zip'])
    with zipfile.ZipFile(full) as archive:
        assert archive.testzip() is None
    print(json.dumps({'full_package':str(full),'bytes':full.stat().st_size,'files':len(checksums),'runtime_access_check':'pass','optimizer_access_check':'pass'},ensure_ascii=True))

if __name__=='__main__':main()
