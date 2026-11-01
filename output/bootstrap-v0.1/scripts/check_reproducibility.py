"""Rebuild from identical snapshots in a temporary directory and compare data."""
from pathlib import Path
import hashlib,json,shutil,subprocess,sys,uuid
from build_dataset import ROOT,dump

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    tempbase=ROOT/'tmp_rebuild'
    if not tempbase.resolve().is_relative_to(ROOT.resolve()):raise RuntimeError('Unsafe temporary directory')
    tempbase.mkdir(exist_ok=True)
    target=tempbase/('repro-'+uuid.uuid4().hex)
    if not target.resolve().is_relative_to(tempbase.resolve()):raise RuntimeError('Temporary target outside package')
    target.mkdir()
    try:
        shutil.copytree(ROOT/'scripts',target/'scripts',ignore=shutil.ignore_patterns('__pycache__'))
        shutil.copytree(ROOT/'sources',target/'sources')
        for name in ['build_dataset.py','validate_dataset.py']:
            p=subprocess.run([sys.executable,'-X','utf8',str(target/'scripts'/name)],capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=60)
            if p.returncode:raise RuntimeError(p.stderr+p.stdout)
        files=['reviewer_private/all_candidates.jsonl','public/learning_inputs.jsonl','public/learning_references.jsonl',
               'optimizer_allowed/dev_cases.jsonl','reports/leakage_groups.json','courses/python/manifest.json',
               'courses/ai_literacy/manifest.json','sources/evidence_index.json',
               'eval/dev/inputs.jsonl','eval/validation/inputs.jsonl','evaluator_private/holdout/references.jsonl']
        results=[{'path':p,'original_sha256':sha(ROOT/p),'rebuilt_sha256':sha(target/p),'match':sha(ROOT/p)==sha(target/p)} for p in files]
        report={'source':'same downloaded snapshots','seed':20261020,'files':results,'all_match':all(r['match'] for r in results),
                'scope':'Data outputs only; PDF metadata and ZIP timestamps not compared.'}
        dump(Path('reports/reproducibility.json'),report)
        print(json.dumps({'files_checked':len(results),'all_match':report['all_match']}))
        if not report['all_match']:sys.exit(1)
    finally:
        # Verify the absolute target immediately before recursive cleanup.
        if not target.resolve().is_relative_to(tempbase.resolve()):raise RuntimeError('Unsafe cleanup target')
        shutil.rmtree(target)

if __name__=='__main__':main()
