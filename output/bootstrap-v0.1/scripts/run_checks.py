"""Run meaningful corpus/adapter checks and preserve their actual outputs."""
import argparse,json,subprocess,sys,os
from pathlib import Path
from build_dataset import ROOT,dump

def main():
    p=argparse.ArgumentParser();p.add_argument('--node',default='node');args=p.parse_args()
    jobs=[('acceptance_tests.txt',[sys.executable,str(ROOT/'scripts/test_acceptance.py')]),
          ('adapter_test.txt',[args.node,str(ROOT/'adapters/test_adapter.mjs')]),
          ('reproducibility_test.txt',[sys.executable,str(ROOT/'scripts/check_reproducibility.py')])]
    results=[]
    for name,command in jobs:
        env={**os.environ,'PYTHONUTF8':'1','PYTHONIOENCODING':'utf-8'}
        r=subprocess.run(command,capture_output=True,text=True,encoding='utf-8',errors='replace',env=env,timeout=90)
        (ROOT/'reports'/name).write_text(r.stdout+r.stderr,encoding='utf-8')
        results.append({'check':name,'exit_code':r.returncode,'output':r.stdout+r.stderr})
    dump(Path('reports/check_results.json'),results)
    print(json.dumps(results,ensure_ascii=True))
    if any(r['exit_code'] for r in results):sys.exit(1)

if __name__=='__main__':main()
