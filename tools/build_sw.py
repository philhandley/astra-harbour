"""Generate sw.js with a precache list and a content-hash version.

Run from the project folder before each deploy:  python tools/build_sw.py
"""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

INCLUDE = ['index.html', 'manifest.webmanifest']
INCLUDE_DIRS = ['css', 'js', 'assets']
SKIP_EXT = {'.md', '.py', '.tif', '.gif'}
FONT_CSS = 'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Lexend:wght@300;400;500;600;700&display=swap'


def collect():
    files = [ROOT / f for f in INCLUDE if (ROOT / f).exists()]
    for d in INCLUDE_DIRS:
        if not (ROOT / d).exists():
            continue
        for p in sorted((ROOT / d).rglob('*')):
            if p.is_file() and p.suffix.lower() not in SKIP_EXT:
                files.append(p)
    return files


def main():
    files = collect()
    h = hashlib.sha1()
    for p in files:
        h.update(p.relative_to(ROOT).as_posix().encode())
        h.update(p.read_bytes())
    h.update((ROOT / 'tools' / 'sw.template.js').read_bytes())
    version = h.hexdigest()[:10]
    local = ['./'] + [p.relative_to(ROOT).as_posix() for p in files]
    tpl = (ROOT / 'tools' / 'sw.template.js').read_text(encoding='utf-8')
    out = (tpl.replace('__VERSION__', version)
              .replace('__LOCAL__', json.dumps(local, indent=2))
              .replace('__CDN__', json.dumps([FONT_CSS], indent=2)))
    (ROOT / 'sw.js').write_text(out, encoding='utf-8', newline='\n')
    size = sum(p.stat().st_size for p in files)
    print(f'sw.js written: version {version}, {len(local)} local files ({size/1e6:.1f} MB)')


if __name__ == '__main__':
    main()
