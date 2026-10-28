"""Muñecos de nieve redibujados con Retro Diffusion (RD Pro edit sobre los anteriores, pro_map.png de referencia).
Entrada: tools/art/retrodiffusion/snow_rd.png (3 muñecos sobre blanco).
Salida: public/assets/img/wang/decor_frosty_{0,1,2}.png (32x32, apoyados abajo y centrados)."""
import os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

D = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, D)
from fit_tile import rd_downscale, trim  # noqa: E402

OUT = D + '/../../public/assets/img/wang/'
im = Image.open(D + '/retrodiffusion/snow_rd.png').convert('RGBA')
a = np.array(im)
white = a[..., :3].min(-1) > 238
lab, _ = ndimage.label(white)
border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
a[np.isin(lab, list(border)), 3] = 0
objs, n = ndimage.label(a[..., 3] > 0, structure=np.ones((3, 3)))
groups = {}
for i, sl in enumerate(ndimage.find_objects(objs), 1):
    if (objs[sl] == i).sum() < 6:
        continue
    c = int((sl[1].start + sl[1].stop) / 2 / im.width * 3)
    groups.setdefault(c, []).append(i)
assert sorted(groups) == [0, 1, 2], sorted(groups)
for c in range(3):
    m = np.isin(objs, groups[c])
    b = a.copy()
    b[~m, 3] = 0
    spr = trim(Image.fromarray(b))
    s = min(1.0, 30 / spr.width, 30 / spr.height)
    if s < 1:
        w, h = max(1, round(spr.width * s)), max(1, round(spr.height * s))
        small = rd_downscale(spr, w, h, f'frosty_{c}')
        small.putalpha(spr.split()[3].resize((w, h), Image.BOX).point(lambda v: 255 if v > 110 else 0))
        spr = trim(small)
    cv = Image.new('RGBA', (32, 32))
    cv.alpha_composite(spr, ((32 - spr.width) // 2, 31 - spr.height))
    cv.save(OUT + f'decor_frosty_{c}.png')
    print(c, spr.size)
