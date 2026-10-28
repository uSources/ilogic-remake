"""Edificios redibujados con Retro Diffusion (RD Pro edit sobre los de 2013, con pro_map.png de referencia).
Entrada: tools/art/retrodiffusion/bld_rd.png (6 edificios azules sobre blanco).
Salida: public/assets/img/flat/bld_{b|r|n}_<Nombre>.png (azul tal cual, rojo por giro de tono, neutral en gris)."""
import os, sys, colorsys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
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
# Huecos blancos encerrados dentro de la refineria (columna 4 de 6): tambien son fondo.
# (En el resto se respeta el blanco: rayas de la pista, brillos...)
sizes = ndimage.sum(np.ones_like(lab), lab, index=np.arange(lab.max() + 1))
oil_cols = (np.arange(a.shape[1]) * 6 // a.shape[1] == 3)[None, :]
holes = (sizes[lab] >= 12) & (lab > 0) & oil_cols & (a[..., :3].min(-1) > 245)
a[bg | holes, 3] = 0
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


from rd_buildings_colors import recolor  # noqa: E402


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
