"""
Montañas y edificios en estilo plano, vista 3/4, dibujados por codigo (mismo estilo que las unidades).
Salida: public/assets/img/flat/mount_<tipo>_<n>.png y bld_<lado>_<Edificio>.png
Uso: python3 tools/art/flat_terrain.py
"""
import os
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'assets', 'img', 'flat')
INK = (16, 22, 40, 255)

def outline(im, ink=INK):
    a = np.asarray(im)[..., 3] > 0
    ring = ndimage.binary_dilation(a, structure=np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]])) & ~a
    arr = np.asarray(im).copy(); arr[ring] = ink
    return Image.fromarray(arr)

def C(c, a=255): return tuple(c) + (a,)

# ---------------------------------------------------------------- montañas
ROCK = {   # de oscuro a claro (5 tonos)
    'grass': [(84, 72, 66), (112, 98, 88), (146, 128, 112), (180, 162, 140), (212, 198, 176)],
    'snow': [(86, 102, 132), (118, 136, 168), (154, 172, 204), (196, 210, 232), (232, 240, 252)],
    'mesa': [(120, 44, 30), (162, 66, 40), (200, 96, 56), (228, 134, 82), (248, 178, 120)],
}
SNOWCAP = [(176, 196, 226), (214, 228, 248), (255, 255, 255)]
import random

def lerp(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def peak(im, cx, base_y, w, h, ramp, seed, cap=True):
    """Pico con dos caras, sombreado por altura, grietas, piedras y nieve de borde irregular."""
    r = random.Random(seed); px = im.load()
    top_y = base_y - h
    for y in range(top_y, base_y + 1):
        t = (y - top_y) / h                       # 0 arriba, 1 abajo
        half = int(w / 2 * t)
        for x in range(cx - half, cx + half + 1):
            if not (0 <= x < im.width and 0 <= y < im.height): continue
            lit = x <= cx + (base_y - y) // 6      # arista un poco desplazada
            k = (3 if lit else 1) + (1 if (lit and t < 0.45) else 0) - (1 if t > 0.82 else 0)
            # textura: vetas diagonales y motas
            if (x * 3 + y * 2 + seed) % 11 == 0: k -= 1
            if r.random() < 0.06: k += 1 if lit else -1
            px[x, y] = C(ramp[max(0, min(4, k))])
    # grietas
    for _ in range(3):
        x, y = cx + r.randint(-w // 5, w // 5), base_y - r.randint(h // 4, h // 2)
        for i in range(r.randint(3, 6)):
            if 0 <= x < im.width and 0 <= y < im.height and px[x, y][3]: px[x, y] = C(ramp[0])
            x += r.choice((-1, 0, 1)); y += 1
    if cap:
        capb = top_y + int(h * 0.36)
        for y in range(top_y, capb + 3):
            t = (y - top_y) / h; half = int(w / 2 * t)
            for x in range(cx - half, cx + half + 1):
                jag = capb + (2 if (x // 2 + seed) % 3 == 0 else 0) - (1 if (x // 3) % 2 else 0)
                if y > jag or not (0 <= x < im.width) or not px[x, y][3]: continue
                lit = x <= cx + (base_y - y) // 6
                px[x, y] = C(SNOWCAP[2] if lit and y < capb - 2 else SNOWCAP[1] if lit else SNOWCAP[0])

def mountain(kind, variant):
    im = Image.new('RGBA', (34, 44), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    ramp = ROCK[kind]; seed = variant * 7 + len(kind)
    if kind == 'mesa':
        top = 13 - variant * 2
        for y in range(top, 40):
            for x in range(4, 31):
                if y < top + 5:   # techo
                    if x < 6 + (top + 5 - y) // 2 or x > 28 - (top + 5 - y) // 2: continue
                    c = ramp[4] if (x + y) % 7 else ramp[3]
                else:
                    band = ((y - top) // 4) % 2
                    c = ramp[2 + band] if x < 22 else ramp[1 - band + 0]
                    if (x * 5 + y * 3) % 13 == 0: c = ramp[0] if x >= 22 else ramp[1]
                im.putpixel((x, y), C(c))
        for y in range(top + 5, 40, 4): d.line([(5, y), (21, y)], fill=C(ramp[1]))
        d.line([(22, top + 5), (22, 39)], fill=C(ramp[0]))
    elif variant == 0:
        peak(im, 17, 40, 30, 32, ramp, seed)
    else:
        peak(im, 11, 40, 20, 22, ramp, seed + 3)
        peak(im, 21, 40, 26, 34, ramp, seed)
    # piedras y matas al pie
    r = random.Random(seed)
    for _ in range(3):
        x = r.randint(5, 27)
        d.ellipse((x - 2, 37, x + 1, 40), fill=C(ramp[1]))
        im.putpixel((x - 1, 37), C(ramp[3]))
    if kind == 'grass':
        for x in (4, 28):
            for dx, dy in ((0, 0), (-1, -1), (1, -1), (0, -2)): im.putpixel((x + dx, 40 + dy), C((60, 140, 60)))
    im = outline(im)
    sh = Image.new('RGBA', im.size, (0, 0, 0, 0)); ImageDraw.Draw(sh).ellipse((3, 37, 31, 43), fill=(0, 30, 0, 70))
    sh.alpha_composite(im)
    return sh

# ---------------------------------------------------------------- edificios
TEAM = {'b': [(14, 48, 104), (24, 86, 168), (40, 124, 226), (110, 180, 255)],
        'r': [(96, 22, 20), (156, 40, 34), (214, 66, 56), (255, 140, 124)],
        'n': [(80, 88, 104), (120, 128, 144), (160, 168, 184), (210, 216, 228)]}
WALL = [(136, 142, 160), (176, 182, 198), (214, 218, 230), (244, 246, 252)]   # sombra, base, luz, brillo
WIN = (255, 230, 140); WIN_D = (52, 74, 116); FRAME = (60, 66, 84)
METAL = [(38, 44, 58), (70, 78, 96), (112, 120, 140), (160, 168, 186)]

def facade(d, x0, y0, x1, y1, ramp):
    """Frente con degradado por bandas (mas claro arriba) y zocalo oscuro."""
    for y in range(y0, y1 + 1):
        t = (y - y0) / max(1, y1 - y0)
        c = ramp[2] if t < 0.3 else ramp[1]
        d.line([(x0, y), (x1, y)], fill=C(c))
    d.line([(x0, y0), (x1, y0)], fill=C(ramp[3]))
    d.rectangle((x0, y1 - 1, x1, y1), fill=C(ramp[0]))

def box(d, x0, y0, x1, y1, depth, wall, roof, roof_hi=None):
    facade(d, x0, y0, x1, y1, wall)
    d.polygon([(x0, y0), (x0 + depth, y0 - depth), (x1 + depth, y0 - depth), (x1, y0)], fill=C(roof[2]))
    d.line([(x0 + depth, y0 - depth), (x1 + depth, y0 - depth)], fill=C(roof_hi or roof[3]))
    d.line([(x0, y0), (x1, y0)], fill=C(roof[1]))
    d.polygon([(x1, y0), (x1 + depth, y0 - depth), (x1 + depth, y1 - depth), (x1, y1)], fill=C(wall[0]))

def window(d, x, y, w=2, h=3, lit=True):
    d.rectangle((x - 1, y - 1, x + w, y + h), fill=C(FRAME))
    d.rectangle((x, y, x + w - 1, y + h - 1), fill=C(WIN if lit else WIN_D))
    d.point((x, y), fill=C((255, 255, 230) if lit else (110, 140, 190)))

def windows(d, x0, y0, x1, y1, sx=5, sy=6, seed=0):
    k = seed
    for y in range(y0, y1 - 2, sy):
        for x in range(x0, x1 - 1, sx):
            k += 7; window(d, x, y, lit=(k % 5) != 0)

def flag(d, x, y, team):
    d.line([(x, y), (x, y + 13)], fill=C(METAL[1])); d.point((x, y - 1), fill=C(METAL[3]))
    d.polygon([(x + 1, y), (x + 9, y + 2), (x + 1, y + 6)], fill=C(team[2]))
    d.line([(x + 1, y + 5), (x + 8, y + 2)], fill=C(team[1])); d.point((x + 2, y + 1), fill=C(team[3]))

def door(d, x0, y0, x1, y1, team):
    d.rectangle((x0 - 1, y0 - 1, x1 + 1, y1), fill=C(FRAME))
    d.rectangle((x0, y0, x1, y1), fill=C(team[0])); d.line([(x0, y0), (x1, y0)], fill=C(team[1]))
    d.rectangle((x0 - 2, y1 + 1, x1 + 2, y1 + 1), fill=C(WALL[1]))

def building(name, side):
    t = TEAM[side]
    im = Image.new('RGBA', (34, 46), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    if name == 'City':
        box(d, 3, 22, 14, 40, 4, WALL, t); windows(d, 5, 25, 14, 38, seed=1)
        box(d, 16, 13, 26, 40, 4, WALL, t); windows(d, 18, 16, 26, 38, seed=4)
        d.rectangle((20, 6, 21, 9), fill=C(METAL[1])); d.point((20, 5), fill=C(t[3]))          # antena
        d.rectangle((6, 15, 9, 17), fill=C(METAL[2]))                                       # aire acondicionado
    elif name == 'Factory':
        box(d, 3, 25, 25, 40, 4, WALL, t)
        for x in (4, 11, 18):   # tejado de dientes de sierra con cristal
            d.polygon([(x, 25), (x + 3, 18), (x + 7, 25)], fill=C(t[2])); d.line([(x + 3, 18), (x + 7, 25)], fill=C(t[0]))
            d.line([(x + 1, 24), (x + 3, 20)], fill=C((170, 220, 255)))
        d.rectangle((24, 8, 28, 25), fill=C(METAL[1])); d.line([(24, 8), (24, 25)], fill=C(METAL[3]))
        for y in (12, 18): d.line([(24, y), (28, y)], fill=C(t[2]))                          # franjas de la chimenea
        door(d, 7, 32, 13, 39, t)
        for x in (17, 21): window(d, x, 30, 2, 4)
        for i, (x, y, rr) in enumerate(((27, 4, 3), (30, 1, 2))): d.ellipse((x - rr, y - rr, x + rr, y + rr), fill=(226, 230, 238, 210 - i * 50))
    elif name == 'Airport':
        d.polygon([(1, 41), (5, 36), (31, 36), (33, 41)], fill=C(METAL[1])); d.line([(5, 36), (31, 36)], fill=C(METAL[2]))
        for x in (8, 15, 22, 28): d.line([(x, 39), (x + 3, 39)], fill=C((250, 250, 250)))
        d.pieslice((3, 19, 22, 40), 180, 360, fill=C(t[2])); d.arc((3, 19, 22, 40), 180, 360, fill=C(t[3]))
        for x in (8, 12, 16): d.line([(x, 21), (x, 30)], fill=C(t[1]))
        d.rectangle((3, 29, 21, 36), fill=C(WALL[1])); d.rectangle((7, 30, 17, 36), fill=C(METAL[0])); d.line([(7, 30), (17, 30)], fill=C(METAL[2]))
        box(d, 24, 15, 27, 36, 2, WALL, t)
        d.rectangle((22, 9, 29, 15), fill=C((150, 210, 245))); d.line([(22, 12), (29, 12)], fill=C((100, 160, 210)))
        d.polygon([(21, 9), (25, 6), (30, 9)], fill=C(t[2])); d.point((25, 4), fill=C((255, 80, 80)))
    elif name == 'Oil':
        d.ellipse((5, 32, 27, 41), fill=C(METAL[0])); d.ellipse((7, 32, 25, 38), fill=C(METAL[1]))
        for xa, xb in ((10, 16), (22, 16)): d.line([(xa, 37), (xb, 9)], fill=C(METAL[2]))
        for y in (15, 21, 27, 33):
            wv = (y - 9) // 5; d.line([(16 - wv, y), (16 + wv, y)], fill=C(METAL[2])); d.line([(16 - wv, y), (16 + wv + 1, y + 5)], fill=C(METAL[1]))
        d.rectangle((14, 5, 18, 9), fill=C(t[2])); d.line([(14, 5), (18, 5)], fill=C(t[3]))
        box(d, 21, 29, 29, 38, 3, [t[0], t[1], t[2], t[3]], METAL)                          # deposito del bando
        d.ellipse((2, 37, 8, 40), fill=(20, 20, 24, 255))                                   # mancha de petroleo
    elif name == 'Stronghold':
        STONE = [(104, 96, 88), (142, 132, 120), (176, 166, 150), (204, 196, 182)]
        box(d, 4, 22, 26, 40, 4, STONE, STONE)
        for x in range(6, 30, 6):
            d.rectangle((x, 14, x + 3, 18), fill=C(STONE[2])); d.line([(x, 14), (x + 3, 14)], fill=C(STONE[3]))
        for y in range(25, 39, 4):   # ladrillos
            d.line([(5, y), (25, y)], fill=C(STONE[0]))
            for x in range(6 + (y // 4) % 2 * 3, 25, 6): d.point((x, y + 1), fill=C(STONE[0])); d.point((x, y + 2), fill=C(STONE[0]))
        door(d, 12, 32, 17, 39, t)
        for x in (7, 21): d.rectangle((x, 27, x + 1, 29), fill=C(INK[:3]))
        flag(d, 15, 5, t)
    elif name == 'Base':
        box(d, 2, 21, 25, 41, 5, WALL, t); windows(d, 4, 24, 25, 33, seed=2)
        box(d, 8, 10, 19, 21, 4, WALL, t); windows(d, 10, 13, 18, 19, sx=4, seed=3)
        d.rectangle((2, 34, 25, 35), fill=C(t[1])); d.line([(2, 34), (25, 34)], fill=C(t[3]))   # franja del bando
        door(d, 10, 36, 16, 40, t)
        for x in (5, 21): d.rectangle((x, 37, x + 1, 40), fill=C(WALL[3]))                      # columnas
        flag(d, 22, 0, t)
    im = outline(im)
    sh = Image.new('RGBA', im.size, (0, 0, 0, 0)); ImageDraw.Draw(sh).ellipse((2, 39, 32, 45), fill=(0, 30, 0, 70))
    sh.alpha_composite(im)
    return sh

def front(kind):
    """Tira de rocas que tapa los pies de una unidad sobre una montaña (mismo color que la montaña)."""
    ramp = ROCK[kind]
    im = Image.new('RGBA', (32, 12), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    pts = [(0, 12), (0, 6), (5, 3), (9, 6), (14, 2), (19, 5), (24, 1), (28, 5), (31, 4), (31, 12)]
    d.polygon(pts, fill=C(ramp[2]))
    d.polygon([(0, 12), (0, 8), (6, 6), (12, 9), (12, 12)], fill=C(ramp[3]))
    d.polygon([(19, 12), (24, 4), (31, 6), (31, 12)], fill=C(ramp[1]))
    d.line(pts[1:-1], fill=C(ramp[0]))
    return im

def main():
    os.makedirs(OUT, exist_ok=True)
    for kind in ROCK: front(kind).save(os.path.join(OUT, f'front_{kind}.png'))
    for kind in ROCK:
        for v in (0, 1):
            mountain(kind, v).save(os.path.join(OUT, f'mount_{kind}_{v}.png'))
    for name in ('City', 'Factory', 'Airport', 'Oil', 'Stronghold', 'Base'):
        for side in ('b', 'r', 'n'):
            if name == 'Base' and side == 'n': continue
            building(name, side).save(os.path.join(OUT, f'bld_{side}_{name}.png'))
    print('ok')

main()
