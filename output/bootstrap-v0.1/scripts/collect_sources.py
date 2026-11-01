"""Download public, pinned-in-manifest source snapshots; never execute their code."""
from pathlib import Path
import argparse, concurrent.futures, datetime, hashlib, json, urllib.request

ROOT = Path(__file__).resolve().parents[1]
SOURCES = [
    ('py_intro', 'https://docs.python.org/3.13/tutorial/introduction.html', 'PSF-2.0; documentation code also 0BSD'),
    ('py_control', 'https://docs.python.org/3.13/tutorial/controlflow.html', 'PSF-2.0; documentation code also 0BSD'),
    ('py_data', 'https://docs.python.org/3.13/tutorial/datastructures.html', 'PSF-2.0; documentation code also 0BSD'),
    ('py_license', 'https://docs.python.org/3.13/license.html', 'PSF-2.0 / 0BSD notices'),
    ('ai_glossary', 'https://developers.google.com/machine-learning/glossary', 'CC-BY-4.0 content; Apache-2.0 code; exceptions apply'),
    ('ai_split', 'https://developers.google.com/machine-learning/crash-course/overfitting/dividing-datasets', 'CC-BY-4.0 content; Apache-2.0 code; exceptions apply'),
    ('ai_overfit', 'https://developers.google.com/machine-learning/crash-course/overfitting/overfitting', 'CC-BY-4.0 content; Apache-2.0 code; exceptions apply'),
    ('mbpp_sanitized', 'https://raw.githubusercontent.com/google-research/google-research/master/mbpp/sanitized-mbpp.json', 'CC-BY-4.0 per Google Research dataset card'),
    ('mbpp_card', 'https://huggingface.co/datasets/google-research-datasets/mbpp/raw/main/README.md', 'dataset notice: CC-BY-4.0'),
]

def collect(entry, refresh=False):
    key, url, license_name = entry
    suffix = '.json' if key == 'mbpp_sanitized' else '.md' if key == 'mbpp_card' else '.html'
    path = ROOT / 'sources/raw' / (key + suffix)
    base = {'id': key, 'url': url, 'license': license_name, 'path': str(path.relative_to(ROOT)).replace('\\', '/')}
    try:
        cached = path.exists() and not refresh
        if cached:
            data = path.read_bytes()
        else:
            request = urllib.request.Request(url, headers={'User-Agent': 'TeachingBootstrap/0.1 (public-source research)'})
            with urllib.request.urlopen(request, timeout=35) as response:
                data = response.read()
                base['resolved_url'] = response.url
            if key == 'mbpp_sanitized':
                value = json.loads(data)
                if not isinstance(value, list) or len(value) < 10:
                    raise ValueError('Unexpected MBPP payload')
            elif len(data) < 1000:
                raise ValueError('Unexpected short source response')
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        base.update(status='downloaded', bytes=len(data), sha256=hashlib.sha256(data).hexdigest(), cached=cached)
    except Exception as exc:
        base.update(status='failed', error=f'{type(exc).__name__}: {exc}')
    return base

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--refresh', action='store_true')
    args = parser.parse_args()
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        entries = list(pool.map(lambda item: collect(item, args.refresh), SOURCES))
    manifest = {'retrieved_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'sources': entries}
    path = ROOT / 'sources/manifest.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'downloaded': sum(x['status']=='downloaded' for x in entries), 'failed': [x['id'] for x in entries if x['status']=='failed']}, ensure_ascii=True))

if __name__ == '__main__':
    main()
