"""Flores y cactus de Retro Diffusion (laminas de 96x32 con 3 piezas cada una). RD los dibujo dentro de un
marco con fondo propio: se recorta el marco, se quita el fondo por su color (relleno desde el borde) y
se queda la pieza mas grande de cada tercio.
Salida: public/assets/img/wang/decor_{flowers|cactus}_{0,1,2}.png (32x32, apoyadas abajo y centradas)."""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

D = os.path.dirname(os.path.abspath(__file__))
SRC = D + '/retrodiffusion/decor/'
OUT = D + '/../../public/assets/img/wang/'


def pieces(path, tol=40):
    a = np.array(Image.open(path).convert('RGBA')).astype(int)
    h, w = a.shape[:2]
    # Marco: filas/columnas exteriores de color marron uniforme -> se quitan hasta llegar al fondo interior.
    m = 0
    while m < 6 and np.abs(a[m, w // 2, :3] - a[0, w // 2, :3]).sum() < 30:
        m += 1
    a = a[m:h - m, m:w - m]
    h, w = a.shape[:2]
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])[:, :3]
    bg = np.median(border, axis=0)
    like = np.abs(a[..., :3] - bg).sum(-1) < tol
    lab, _ = ndimage.label(like)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    a[np.isin(lab, list(edge)), 3] = 0
    objs, _ = ndimage.label(a[..., 3] > 0, structure=np.ones((3, 3)))
    out = []
    for third in range(3):
        best, bsl = 0, None
        for i, sl in enumerate(ndimage.find_objects(objs), 1):
            if sl is None:
                continue
            cx = (sl[1].start + sl[1].stop) / 2
            if int(cx / w * 3) != third:
                continue
            n = (objs[sl] == i).sum()
            if n > best:
                best, bsl, bi = n, sl, i
        p = a[bsl].copy()
        p[objs[bsl] != bi, 3] = 0
        im = Image.fromarray(p.astype(np.uint8))
        cv = Image.new('RGBA', (32, 32))
        cv.alpha_composite(im, ((32 - im.width) // 2, 31 - im.height))
        out.append(cv)
    return out


for kind in ('flowers', 'cactus'):
    for i, im in enumerate(pieces(SRC + f'misc_{kind}.png')):
        im.save(OUT + f'decor_{kind}_{i}.png')
print('ok')
