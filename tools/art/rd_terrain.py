"""Recorta las montañas y los bosques generados con Retro Diffusion (estilo RD Pro Top Down,
con el mapa de referencia pro_map.png) y crea sus primeros planos para tapar los pies de las unidades.

Entradas (tools/art/retrodiffusion/):
  m2_mountains.png  2 filas x 6: hierba, hierba, nieve, nieve, meseta, meseta
  t2_forest.png     1 fila x 6: frondoso, frondoso, pinos, frondoso, pinos, frondoso
Salidas (public/assets/img/flat/):
  mount_{grass|snow|mesa}_{0..3}.png, tree_{grass|snow}_{n}.png, front_<mismo nombre>.png
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

D = os.path.dirname(os.path.abspath(__file__))
SRC = D + '/retrodiffusion/'
OUT = D + '/../../public/assets/img/flat/'
TILE = 32
DROP = 3  # el juego baja los dibujos de flat/ 3 px


def sprites(path, min_px=60):
    im = Image.open(path).convert('RGBA')
    a = np.array(im)
    lab, n = ndimage.label(a[:, :, 3] > 0, structure=np.ones((3, 3)))
    boxes = []
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        if sl is None or (lab[sl] == i).sum() < min_px:
            continue
        boxes.append((sl[1].start, sl[0].start, sl[1].stop, sl[0].stop, i))
    # Agrupa por filas (centro vertical) y ordena de izquierda a derecha.
    boxes.sort(key=lambda b: ((b[1] + b[3]) // 2 // (im.height // 2 if len(boxes) > 8 else im.height), b[0]))
    out = []
    for x0, y0, x1, y1, i in boxes:
        m = a[y0:y1, x0:x1].copy()
        m[lab[y0:y1, x0:x1] != i] = 0  # solo este trozo
        out.append((Image.fromarray(m), (x0 + x1) / 2 / im.width))
    return out


def save(im, name):
    # Lienzo con el dibujo centrado y apoyado abajo.
    w = max(im.width, TILE)
    cv = Image.new('RGBA', (w + (w % 2), im.height))
    cv.alpha_composite(im, ((cv.width - im.width) // 2, 0))
    cv.save(OUT + name + '.png')
    # Primer plano: la franja de abajo de la casilla (14 px) tal como se ve sobre ella.
    H = 14
    tile = Image.new('RGBA', (TILE, TILE + DROP))
    tile.alpha_composite(cv, (TILE // 2 - cv.width // 2, TILE + DROP - cv.height)) if cv.width <= TILE else tile.alpha_composite(
        cv.crop(((cv.width - TILE) // 2, 0, (cv.width + TILE) // 2, cv.height)), (0, TILE + DROP - cv.height))
    tile.crop((0, TILE - H, TILE, TILE)).save(OUT + 'front_' + name + '.png')


m = sprites(SRC + 'm2_mountains.png')
assert len(m) == 12, len(m)
kinds = ['grass', 'grass', 'snow', 'snow', 'mesa', 'mesa']
count = {}
for im, cx in m:
    k = kinds[int(cx * 6)]
    v = count.get(k, 0)
    count[k] = v + 1
    save(im, f'mount_{k}_{v}')

t = sprites(SRC + 't2_forest.png')
assert len(t) == 6, len(t)
tk = ['grass', 'grass', 'snow', 'grass', 'snow', 'grass']
count = {}
for im, cx in t:
    k = tk[int(cx * 6)]
    v = count.get(k, 0)
    count[k] = v + 1
    save(im, f'tree_{k}_{v}')
print('ok', count)
