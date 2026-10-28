"""Edificios redibujados con Retro Diffusion (RD Pro edit sobre los de 2013, con pro_map.png de referencia).
Entrada: tools/art/retrodiffusion/bld_rd.png (6 edificios azules sobre blanco).
Salida: public/assets/img/flat/bld_{b|r|n}_<Nombre>.png (azul tal cual, rojo por giro de tono, neutral en gris)."""
import os, colorsys
import numpy as np
from PIL import Image
from scipy import ndimage

D = os.path.dirname(os.path.abspath(__file__))
OUT = D + '/../../public/assets/img/flat/'
NAMES = ['City', 'Factory', 'Airport', 'Oil', 'Stronghold', 'Base']

im = Image.open(D + '/retrodiffusion/bld_rd.png').convert('RGBA')
a = np.array(im)
# Fondo: blanco casi puro conectado al borde.
white = (a[..., :3].min(-1) > 235)
lab, _ = ndimage.label(white)
border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
bg = np.isin(lab, list(border))
a[bg, 3] = 0
objs, n = ndimage.label(a[..., 3] > 0, structure=np.ones((3, 3)))
parts = []
for i, sl in enumerate(ndimage.find_objects(objs), 1):
    if (objs[sl] == i).sum() < 40:
        continue
    parts.append((sl[1].start, sl, i))
# Trozos sueltos (antenas, bandera) se juntan con el edificio de su columna.
cols = {}
for x0, sl, i in parts:
    c = int((sl[1].start + sl[1].stop) / 2 / im.width * 6)
    cols.setdefault(c, []).append((sl, i))
assert sorted(cols) == list(range(6)), sorted(cols)


def recolor(img, mode):
    px = np.array(img).astype(float) / 255
    out = px.copy()
    for y in range(px.shape[0]):
        for x in range(px.shape[1]):
            r, g, b, al = px[y, x]
            if not al:
                continue
            h, s, v = colorsys.rgb_to_hsv(r, g, b)
            if 0.42 < h < 0.62 and s > 0.25:  # azul/cian del bando
                if mode == 'r':
                    h = (h - 0.5) % 1.0
                    h = 0.99 if h > 0.5 else h * 0.2
                else:
                    s *= 0.1
                    v *= 0.92
                out[y, x, :3] = colorsys.hsv_to_rgb(h, s, v)
    return Image.fromarray((out * 255).round().astype(np.uint8))


for c, name in enumerate(NAMES):
    ys = [sl[0] for sl, _ in cols[c]]
    xs = [sl[1] for sl, _ in cols[c]]
    y0, y1 = min(s.start for s in ys), max(s.stop for s in ys)
    x0, x1 = min(s.start for s in xs), max(s.stop for s in xs)
    keep = np.isin(objs[y0:y1, x0:x1], [i for _, i in cols[c]])
    crop = a[y0:y1, x0:x1].copy()
    crop[~keep, 3] = 0
    spr = Image.fromarray(crop)
    w = max(spr.width, 32)
    w += w % 2
    cv = Image.new('RGBA', (w, spr.height))
    cv.alpha_composite(spr, ((w - spr.width) // 2, 0))
    cv.save(OUT + f'bld_b_{name}.png')
    recolor(cv, 'r').save(OUT + f'bld_r_{name}.png')
    if name != 'Base':
        recolor(cv, 'n').save(OUT + f'bld_n_{name}.png')
    print(name, cv.size)
