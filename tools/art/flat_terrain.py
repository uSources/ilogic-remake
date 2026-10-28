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
ROCK = {
    'grass': [(118, 104, 92), (158, 140, 122), (196, 180, 160)],   # sombra, base, luz
    'snow': [(120, 138, 168), (168, 186, 212), (214, 226, 242)],
    'mesa': [(170, 70, 44), (212, 106, 64), (240, 150, 96)],
}
SNOWCAP = [(214, 228, 248), (255, 255, 255)]

def peak(d, cx, base_y, w, h, ramp, cap=True):
    top = (cx, base_y - h)
    l, r = (cx - w // 2, base_y), (cx + w // 2, base_y)
    d.polygon([l, top, (cx, base_y)], fill=C(ramp[2]))      # cara iluminada (izquierda)
    d.polygon([top, r, (cx, base_y)], fill=C(ramp[1]))      # cara en sombra (derecha)
    d.line([top, (cx + w // 6, base_y)], fill=C(ramp[0]))   # arista
    if cap:
        k = h // 3
        cl = (cx - (w // 2) * k // h, base_y - h + k); cr = (cx + (w // 2) * k // h, base_y - h + k)
        d.polygon([cl, top, (cx, base_y - h + k + 2)], fill=C(SNOWCAP[1]))
        d.polygon([top, cr, (cx, base_y - h + k + 2)], fill=C(SNOWCAP[0]))

def mountain(kind, variant):
    im = Image.new('RGBA', (34, 44), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    ramp = ROCK[kind]
    if kind == 'mesa':
        # meseta: techo plano y cara frontal con franjas
        d.polygon([(4, 26), (8, 14 - variant * 2), (26, 14 - variant * 2), (30, 26), (30, 38), (4, 38)], fill=C(ramp[1]))
        d.polygon([(8, 14 - variant * 2), (26, 14 - variant * 2), (28, 19 - variant * 2), (6, 19 - variant * 2)], fill=C(ramp[2]))
        for y in (24, 30): d.line([(5, y), (29, y)], fill=C(ramp[0]))
        d.polygon([(22, 19 - variant * 2), (28, 19 - variant * 2), (30, 26), (30, 38), (24, 38)], fill=C(ramp[0]))
    elif variant == 0:
        peak(d, 17, 40, 30, 32, ramp)
    else:
        peak(d, 11, 40, 20, 22, ramp)
        peak(d, 21, 40, 26, 34, ramp)
    im = outline(im)
    # sombra en el suelo
    sh = Image.new('RGBA', im.size, (0, 0, 0, 0)); ImageDraw.Draw(sh).ellipse((3, 37, 31, 43), fill=(0, 30, 0, 60))
    sh.alpha_composite(im)
    return sh

# ---------------------------------------------------------------- edificios
TEAM = {'b': [(18, 62, 128), (31, 111, 209), (72, 160, 245)], 'r': [(120, 28, 24), (196, 52, 44), (240, 98, 84)],
        'n': [(96, 104, 120), (150, 158, 172), (196, 202, 214)]}
WALL = [(170, 176, 190), (214, 218, 228), (240, 242, 248)]   # sombra, base, luz
WIN = (255, 236, 150); WIN_D = (60, 80, 120)
METAL = [(44, 50, 64), (78, 86, 102), (120, 128, 146)]

def box(d, x0, y0, x1, y1, depth, front, top, side):
    """Caja 3/4: frente (x0..x1, y0..y1), techo de `depth` px encima y lado derecho."""
    d.rectangle((x0, y0, x1, y1), fill=C(front))
    d.polygon([(x0, y0), (x0 + depth, y0 - depth), (x1 + depth, y0 - depth), (x1, y0)], fill=C(top))
    d.polygon([(x1, y0), (x1 + depth, y0 - depth), (x1 + depth, y1 - depth), (x1, y1)], fill=C(side))

def windows(d, x0, y0, x1, y1, step=4, lit=True):
    for y in range(y0, y1, step):
        for x in range(x0, x1, step):
            d.rectangle((x, y, x + 1, y + 1), fill=C(WIN if lit and (x + y) % 3 else WIN_D))

def flag(d, x, y, team):
    d.line([(x, y), (x, y + 12)], fill=C(METAL[0]))
    d.polygon([(x + 1, y), (x + 8, y + 2), (x + 1, y + 5)], fill=C(team[2]))
    d.line([(x + 1, y + 4), (x + 7, y + 2)], fill=C(team[1]))

def building(name, side):
    t = TEAM[side]
    im = Image.new('RGBA', (34, 46), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    if name == 'City':
        box(d, 4, 22, 15, 40, 4, WALL[1], t[2], WALL[0]); windows(d, 6, 25, 14, 39)
        box(d, 17, 14, 27, 40, 4, WALL[1], t[2], WALL[0]); windows(d, 19, 17, 26, 39)
    elif name == 'Factory':
        box(d, 3, 24, 26, 40, 4, WALL[1], t[1], WALL[0])
        for x in (4, 12, 20):   # tejado de dientes de sierra
            d.polygon([(x, 24), (x + 4, 18), (x + 8, 24)], fill=C(t[2]))
        d.rectangle((24, 10, 27, 24), fill=C(METAL[1])); d.rectangle((24, 10, 27, 11), fill=C(METAL[2]))
        d.rectangle((8, 31, 13, 40), fill=C(METAL[0])); windows(d, 16, 29, 25, 37, step=4)
        d.ellipse((25, 4, 31, 9), fill=(220, 224, 232, 200))
    elif name == 'Airport':
        d.polygon([(2, 40), (6, 36), (30, 36), (32, 40)], fill=C(METAL[1]))       # pista
        for x in (8, 15, 22): d.line([(x, 38), (x + 3, 38)], fill=C((240, 240, 240)))
        box(d, 4, 24, 20, 36, 3, WALL[1], t[2], WALL[0]); d.ellipse((5, 19, 22, 30), fill=C(t[2]))   # hangar redondo
        d.rectangle((8, 29, 17, 36), fill=C(METAL[0]))
        box(d, 23, 14, 27, 36, 2, WALL[1], WALL[2], WALL[0]); box(d, 21, 9, 29, 14, 2, (150, 210, 245), t[1], (110, 170, 210))
    elif name == 'Oil':
        d.ellipse((6, 30, 26, 40), fill=C(METAL[0]))    # base
        d.polygon([(10, 36), (16, 10), (22, 36)], fill=C(METAL[1]))       # torre
        for y in (16, 22, 28): d.line([(16 - (y - 10) // 4, y), (16 + (y - 10) // 4, y)], fill=C(METAL[2]))
        box(d, 20, 28, 29, 38, 3, t[1], t[2], t[0])   # deposito del bando
        d.rectangle((14, 6, 18, 10), fill=C(t[2]))
    elif name == 'Stronghold':
        box(d, 4, 22, 26, 40, 4, (150, 140, 128), (190, 180, 166), (120, 112, 102))
        for x in range(6, 30, 6): d.rectangle((x, 14, x + 3, 18), fill=C((190, 180, 166)))   # almenas
        d.rectangle((12, 31, 17, 40), fill=C(METAL[0])); d.rectangle((7, 27, 9, 29), fill=C(INK[:3])); d.rectangle((21, 27, 23, 29), fill=C(INK[:3]))
        flag(d, 15, 6, t)
    elif name == 'Base':
        box(d, 2, 20, 26, 41, 5, WALL[1], t[1], WALL[0]); windows(d, 4, 24, 25, 33)
        box(d, 9, 9, 19, 20, 4, WALL[2], t[2], WALL[1]); windows(d, 11, 12, 18, 19)
        d.rectangle((11, 34, 17, 41), fill=C(t[0]))          # puerta
        flag(d, 21, 0, t)
    im = outline(im)
    sh = Image.new('RGBA', im.size, (0, 0, 0, 0)); ImageDraw.Draw(sh).ellipse((2, 39, 32, 45), fill=(0, 30, 0, 60))
    sh.alpha_composite(im)
    return sh

def front(kind):
    """Tira de rocas que tapa los pies de una unidad sobre una montaña (mismo color que la montaña)."""
    ramp = ROCK[kind]
    im = Image.new('RGBA', (32, 12), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    pts = [(0, 12), (0, 6), (5, 3), (9, 6), (14, 2), (19, 5), (24, 1), (28, 5), (31, 4), (31, 12)]
    d.polygon(pts, fill=C(ramp[1]))
    d.polygon([(0, 12), (0, 8), (6, 6), (12, 9), (12, 12)], fill=C(ramp[2]))
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
