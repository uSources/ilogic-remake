"""
Nubes pixel (y su sombra en el suelo), hechas por codigo: circulos que se solapan con tres tonos.
Salen a public/assets/img/wang/cloud_<n>.png y cloud_shadow_<n>.png.
Uso: python3 tools/art/clouds.py
"""
import os, random, math
from PIL import Image

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'assets', 'img', 'wang')
WHITE = (255, 255, 255, 255)
LIGHT = (236, 244, 255, 255)
SHADE = (196, 216, 242, 255)
DEEP = (160, 188, 228, 255)

def cloud(seed, w, h):
    r = random.Random(seed)
    blobs = []
    # Base ancha y bultos encima.
    n = r.randint(5, 8)
    for i in range(n):
        cx = w * (0.18 + 0.64 * i / (n - 1)) + r.uniform(-3, 3)
        rad = r.uniform(h * 0.22, h * 0.36) * (1.15 if 0 < i < n - 1 else 0.85)
        cy = h * 0.62 - (rad * 0.55 if 0 < i < n - 1 else 0) + r.uniform(-2, 2)
        blobs.append((cx, cy, rad))
    for _ in range(2):
        blobs.append((w * r.uniform(0.35, 0.65), h * r.uniform(0.3, 0.42), h * r.uniform(0.26, 0.34)))
    inside = [[False] * h for _ in range(w)]
    for x in range(w):
        for y in range(h):
            if y > h * 0.8: continue  # base plana
            inside[x][y] = any((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= rad * rad for cx, cy, rad in blobs)
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); px = im.load()
    # Los bultos de delante (mas bajos) se pintan encima: cada pixel toma el bulto mas bajo que lo cubre.
    order = sorted(blobs, key=lambda b: b[1])
    for x in range(w):
        for y in range(h):
            if not inside[x][y]: continue
            own = None
            for cx, cy, rad in order:
                if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= rad * rad: own = (cx, cy, rad)
            down = [inside[x][y + k] if y + k < h else False for k in (1, 2, 3)]
            if not down[0] or not down[1]: c = DEEP
            elif own:
                cx, cy, rad = own
                dx, dy = (x + 0.5 - cx) / rad, (y + 0.5 - cy) / rad
                d = math.hypot(dx, dy)
                if dy > 0.25 and d > 0.7: c = SHADE          # media luna de sombra abajo de cada bulto
                elif dy < -0.2 and dx < 0.2 and d > 0.72: c = WHITE   # brillo arriba
                else: c = LIGHT
            else: c = LIGHT
            px[x, y] = c
    return im

def shadow(im):
    a = im.split()[3]
    sh = Image.new('RGBA', im.size, (8, 24, 48, 0))
    sh.putalpha(a.point(lambda v: 60 if v else 0))
    return sh

def main():
    os.makedirs(OUT, exist_ok=True)
    sizes = [(104, 50), (136, 60), (80, 42), (124, 56), (92, 46)]
    for i, (w, h) in enumerate(sizes):
        c = cloud(100 + i, w, h)
        c.save(os.path.join(OUT, f'cloud_{i}.png'))
        shadow(c).save(os.path.join(OUT, f'cloud_shadow_{i}.png'))
    print('ok')

main()
