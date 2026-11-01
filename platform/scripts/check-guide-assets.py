from pathlib import Path
from PIL import Image
import hashlib,json
root=Path(__file__).resolve().parents[2];out=root/'output/pilot-v0.9';rows=[]
for name in ['xiaozhi']:
 for state in ['idle','blink','wave','point','thinking','notice']:
  p=root/'platform/public/guide-assets'/f'{name}-{state}.png';img=Image.open(p);alpha=img.getchannel('A') if 'A' in img.getbands() else None
  box=alpha.getbbox() if alpha else None
  rows.append({'file':p.name,'size':img.size,'mode':img.mode,'alpha_extrema':alpha.getextrema() if alpha else None,'content_bbox':box,'passed':alpha is not None and alpha.getextrema()[0]==0 and alpha.getextrema()[1]==255,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size})
(out/'reports/asset-quality.json').write_text(json.dumps({'assets':rows,'passed':sum(x['passed'] for x in rows),'total':len(rows),'pixel_edits':'none; read-only alpha/hash inspection'},ensure_ascii=False,indent=2),encoding='utf-8')
cards=''.join(f'<figure><img src="{r["file"]}"/><figcaption>{r["file"]}</figcaption></figure>' for r in rows)
(out/'characters/catalog.html').write_text('<!doctype html><meta charset="utf-8"><title>知行角色素材</title><style>body{font:16px system-ui;background:#f5f7f3;color:#274b3b;padding:24px}main{display:grid;grid-template-columns:repeat(6,minmax(100px,1fr));gap:16px}figure{margin:0;background:white;border-radius:18px;padding:12px}img{width:100%;height:180px;object-fit:contain}figcaption{font-size:12px;text-align:center}</style><h1>小知 · 透明素材</h1><main>'+cards+'</main>',encoding='utf-8')
print(json.dumps({'passed':sum(x['passed'] for x in rows),'total':len(rows)}))
if not all(x['passed'] for x in rows): raise SystemExit(1)
