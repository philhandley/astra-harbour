"""Draw the Jelly Harbour app icons with Pillow: an isometric block of turquoise jelly on cream strata,
with three rows of containers and a red-and-white lighthouse on top. Run: python tools/make_icons.py"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'icons'
OUT.mkdir(parents=True, exist_ok=True)
PAPER = (236, 230, 220)
INK = (38, 34, 29)


def iso(cx, cy, s):
    """Project block coordinates (x right-back, z left-back, y up) to the image."""
    def p(x, y, z):
        x -= 0.5; z -= 0.5
        return (cx + (x - z) * s * 0.866, cy + (x + z) * s * 0.5 - y * s)
    return p


def draw(size, maskable=False):
    S = 1024
    im = Image.new('RGBA', (S, S), PAPER + (255,) if maskable else (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if not maskable:
        d.rounded_rectangle((40, 40, S - 40, S - 40), 200, fill=PAPER)
    sc = 400 if not maskable else 330
    p = iso(S / 2, S / 2 + (sc * 0.12), sc)
    H = 0.62     # block height below the sea surface
    # strata faces (left face: x from 0..1 at z = 1; right face: z 0..1 at x = 1)
    bands = [(-H, -0.48, (201, 160, 124)), (-0.48, -0.34, (233, 201, 167)), (-0.34, -0.22, (244, 232, 214)),
             (-0.22, -0.12, (242, 207, 198)), (-0.12, 0.0, (247, 240, 227))]
    for y0, y1, c in bands:
        d.polygon([p(0, y0, 1), p(1, y0, 1), p(1, y1, 1), p(0, y1, 1)], fill=c)
        dc = tuple(int(v * 0.88) for v in c)
        d.polygon([p(1, y0, 1), p(1, y0, 0), p(1, y1, 0), p(1, y1, 1)], fill=dc)
    # jelly sea: a translucent slab on top of the strata (front faces) and the top
    jelly_front = (47, 196, 180)
    d.polygon([p(0, 0, 1), p(1, 0, 1), p(1, 0.16, 1), p(0, 0.16, 1)], fill=(38, 178, 165))
    d.polygon([p(1, 0, 1), p(1, 0, 0), p(1, 0.16, 0), p(1, 0.16, 1)], fill=(30, 152, 142))
    d.polygon([p(0, 0.16, 0), p(1, 0.16, 0), p(1, 0.16, 1), p(0, 0.16, 1)], fill=jelly_front)
    # meniscus highlights along the top edges
    w = max(4, int(sc * 0.02))
    d.line([p(0, 0.16, 1), p(1, 0.16, 1), p(1, 0.16, 0)], fill=(230, 255, 250), width=w)
    # the quay along the back-left (z = 0 side)
    d.polygon([p(0, 0.16, 0), p(1, 0.16, 0), p(1, 0.30, 0), p(0, 0.30, 0)], fill=(214, 208, 199))
    d.polygon([p(0, 0.30, 0), p(1, 0.30, 0), p(1, 0.30, -0.18), p(0, 0.30, -0.18)], fill=(90, 94, 100))
    # three rows of containers on a little ship (red, blue, yellow)
    cols = [(217, 64, 47), (47, 111, 208), (240, 182, 46)]
    for r, c in enumerate(cols):
        x0 = 0.18 + r * 0.17
        top = tuple(min(255, int(v * 1.15)) for v in c)
        side = tuple(int(v * 0.8) for v in c)
        y0, y1, z0, z1 = 0.17, 0.27, 0.12, 0.42
        d.polygon([p(x0, y1, z0), p(x0 + 0.14, y1, z0), p(x0 + 0.14, y1, z1), p(x0, y1, z1)], fill=top)
        d.polygon([p(x0, y0, z1), p(x0 + 0.14, y0, z1), p(x0 + 0.14, y1, z1), p(x0, y1, z1)], fill=c)
        d.polygon([p(x0 + 0.14, y0, z1), p(x0 + 0.14, y0, z0), p(x0 + 0.14, y1, z0), p(x0 + 0.14, y1, z1)], fill=side)
    # lighthouse at the front-right corner
    lx, lz = 0.82, 0.78
    base = p(lx, 0.16, lz)
    r = sc * 0.055
    for i in range(5):
        y0 = 0.16 + i * 0.075
        a, b = p(lx, y0, lz), p(lx, y0 + 0.075, lz)
        col = (210, 60, 44) if i % 2 == 0 else (244, 241, 234)
        d.rectangle((a[0] - r, b[1], a[0] + r, a[1]), fill=col)
    top = p(lx, 0.16 + 5 * 0.075, lz)
    d.rectangle((top[0] - r * 1.25, top[1] - r * 0.25, top[0] + r * 1.25, top[1]), fill=INK)
    d.rectangle((top[0] - r * 0.8, top[1] - r * 1.5, top[0] + r * 0.8, top[1] - r * 0.25), fill=(255, 226, 140))
    d.pieslice((top[0] - r, top[1] - r * 2.4, top[0] + r, top[1] - r * 0.6), 180, 360, fill=(210, 60, 44))
    return im.resize((size, size), Image.LANCZOS)


draw(512).save(OUT / 'icon-512.png')
draw(192).save(OUT / 'icon-192.png')
draw(512, maskable=True).save(OUT / 'icon-maskable-512.png')
ap = Image.new('RGBA', (180, 180), PAPER + (255,))
ap.alpha_composite(draw(180, maskable=True))
ap.convert('RGB').save(OUT / 'apple-touch-icon-180.png')
draw(32).save(OUT / 'favicon-32.png')
print('icons written to', OUT)
