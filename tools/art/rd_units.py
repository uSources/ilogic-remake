"""Unidades redibujadas con Retro Diffusion (RD Pro edit sobre las de 2013, pro_map.png de referencia).
Se generaron UNA vez, neutras, con las partes del bando en magenta (color clave). Aqui se recortan,
se ajustan a la casilla (32x32, reduccion K-Centroid si se pasan) y se sacan los bandos:
  u/b_<Nombre>.png azul, u/i_<Nombre>.png gris (ya ha movido), u/r_<Nombre>.png rojo mirando a la izquierda.
El dibujo con magenta queda en tools/art/retrodiffusion/units/key_<Nombre>.png."""
import os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

D = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, D)
from fit_tile import rd_downscale, trim  # noqa: E402
from team_key import recolor  # noqa: E402

SRC = D + '/retrodiffusion/units/'
OUT = D + '/../../public/assets/img/u/'
SHEETS = {
    'u_pilot': ['Soldier', 'MSoldier', 'Tank', 'Missile_truck', 'Fighter'],
    'u_s1': ['BSoldier', 'SSoldier', 'FSoldier', 'Car', 'LTank'],
    'u_s2': ['WTank', 'Artillery', 'Antiair', 'Transport', 'Supplier'],
    'u_s3': ['Blocker', 'LFighter', 'Bomber', 'THelicopter'],
}
MAX = 32

for sheet, names in SHEETS.items():
    im = Image.open(SRC + sheet + '.png').convert('RGBA')
    a = np.array(im)
    white = a[..., :3].min(-1) > 238
    lab, _ = ndimage.label(white)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    a[np.isin(lab, list(border)), 3] = 0
    objs, _ = ndimage.label(a[..., 3] > 0, structure=np.ones((3, 3)))
    slot = im.width // len(names)
    groups = {}
    for i, sl in enumerate(ndimage.find_objects(objs), 1):
        if sl is None or (objs[sl] == i).sum() < 4:
            continue
        c = min(len(names) - 1, int((sl[1].start + sl[1].stop) / 2 // slot))
        groups.setdefault(c, []).append(i)
    for c, name in enumerate(names):
        b = a.copy()
        b[~np.isin(objs, groups.get(c, [])), 3] = 0
        spr = trim(Image.fromarray(b))
        s = min(1.0, MAX / spr.width, MAX / spr.height)
        if s < 1:
            w, h = max(1, round(spr.width * s)), max(1, round(spr.height * s))
            small = rd_downscale(spr, w, h, f'unit_{name}')
            small.putalpha(spr.split()[3].resize((w, h), Image.BOX).point(lambda v: 255 if v > 110 else 0))
            spr = trim(small)
        cv = Image.new('RGBA', (32, 32))
        cv.alpha_composite(spr, ((32 - spr.width) // 2, 32 - spr.height))
        cv.save(SRC + f'key_{name}.png')
        recolor(cv, 'b').save(OUT + f'b_{name}.png')
        recolor(cv, 'i').save(OUT + f'i_{name}.png')
        recolor(cv, 'r').transpose(Image.FLIP_LEFT_RIGHT).save(OUT + f'r_{name}.png')
        print(name, spr.size)
