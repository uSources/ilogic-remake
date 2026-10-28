"""
Unidades nuevas (primera pasada): recorta cada unidad de las filas generadas con PixelLab (pixen),
la pasa a los colores del ejercito azul y saca las versiones roja (mirando a la izquierda) y gris
(ya usada). Salida: public/assets/img/u/{b,r,i}_<Nombre>.png
Uso: python3 tools/art/units.py
"""
import os, colorsys
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'pixellab', 'units')
OUT = os.path.join(ROOT, '..', '..', 'public', 'assets', 'img', 'u')

# Nombre -> (fila, x0, x1)
CROPS = {
    # Segunda pasada (descripciones del usuario): infanteria y tanques en la misma fila, mismo estilo y escala.
    'Soldier': ('v2_22', 0, 26), 'BSoldier': ('v2_22', 27, 50), 'SSoldier': ('v2_21', 43, 65),
    'MSoldier': ('v2_mortar', 0, 28), 'FSoldier': ('v2_22', 214, 238),
    'LTank': ('v2_22', 70, 98), 'WTank': ('v2_22', 98, 131), 'Tank': ('v2_22', 266, 302),
    'Artillery': ('v2_21', 275, 300), 'Missile_truck': ('v2_22', 300, 337),
    # Primera pasada (pendientes de describir).
    'Supplier': ('pixen_veh2', 86, 112), 'Antiair': ('pixen_veh2', 111, 133), 'Car': ('pixen_veh2', 132, 154), 'Transport': ('pixen_veh2', 152, 176), 'Blocker': ('pixen_veh2', 194, 219),
    'Fighter': ('pixen_extra', 78, 110), 'THelicopter': ('pixen_air', 159, 192),
    'Bomber': ('pixen_extra', 0, 28), 'LFighter': ('pixen_extra', 164, 192),
}
# Algunas salieron a otra escala: se reducen para que cuadren con el resto.
SCALE = {'MSoldier': 0.7}
INFANTRY = {'Soldier', 'BSoldier', 'SSoldier', 'MSoldier', 'FSoldier'}
# Rampa del bando azul (de oscuro a claro) y su equivalente rojo y gris.
BLUE = [(13, 34, 78), (19, 74, 143), (31, 111, 209), (58, 168, 255), (154, 212, 255)]
RED = [(74, 16, 14), (122, 29, 25), (184, 50, 44), (255, 77, 69), (255, 170, 160)]
GREY = [(40, 44, 54), (78, 84, 98), (120, 128, 144), (168, 176, 190), (214, 220, 230)]

def crop(name):
    row, x0, x1 = CROPS[name]
    im = np.asarray(Image.open(os.path.join(SRC, row + '.png')).convert('RGBA'))[:, x0:x1]
    a = im[..., 3] > 40
    lab, n = ndimage.label(ndimage.binary_dilation(a))
    if n > 1:
        sizes = ndimage.sum(a, lab, range(1, n + 1))
        keep = lab == (int(np.argmax(sizes)) + 1)
        im = im.copy(); im[~keep] = 0
    ys, xs = np.nonzero(im[..., 3] > 40)
    return Image.fromarray(im[ys.min():ys.max() + 1, xs.min():xs.max() + 1])

def team_body(px, infantry):
    """¿Es un pixel de "carroceria/uniforme" (se pinta del color del bando)?"""
    r, g, b, a = px
    if a < 40: return False
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    if l < 0.13 or l > 0.93: return False                 # contorno y brillos
    if 0.02 <= h < 0.12 and l > 0.45 and s > 0.25: return False   # piel
    if infantry and (h < 0.13 or h > 0.9) and s > 0.25: return False  # armas de madera, insignias
    return True

def ramp_of(px, ramp):
    r, g, b, _ = px
    l = (0.3 * r + 0.59 * g + 0.11 * b) / 255
    i = min(len(ramp) - 1, max(0, int(l * 1.25 * len(ramp))))
    return ramp[i]

def paint(im, ramp, mask_from, infantry=False):
    a = np.asarray(im).copy()
    src = np.asarray(mask_from)
    for y in range(a.shape[0]):
        for x in range(a.shape[1]):
            px = tuple(int(v) for v in src[y, x])
            if team_body(px, infantry):
                a[y, x, :3] = ramp_of(px, ramp)
    return Image.fromarray(a)

def grey(im):
    a = np.asarray(im).astype(float).copy()
    l = (0.3 * a[..., 0] + 0.59 * a[..., 1] + 0.11 * a[..., 2])
    for k in range(3): a[..., k] = l * 0.85 + 20
    return Image.fromarray(a.clip(0, 255).astype(np.uint8))

def place(sprite):
    """En un lienzo de 32 de ancho (o mas si no cabe), apoyado abajo y centrado."""
    w, h = sprite.size
    W = max(32, w); H = max(32, h + 2)
    c = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    c.alpha_composite(sprite, ((W - w) // 2, H - h - 2))
    return c

def main():
    os.makedirs(OUT, exist_ok=True)
    for name in CROPS:
        sp = crop(name)
        if name in SCALE:
            k = SCALE[name]
            sp = sp.resize((round(sp.width * k), round(sp.height * k)), Image.NEAREST)
        inf = name in INFANTRY
        blue = paint(sp, BLUE, sp, inf)
        red = paint(sp, RED, sp, inf).transpose(Image.FLIP_LEFT_RIGHT)
        place(blue).save(os.path.join(OUT, f'b_{name}.png'))
        place(red).save(os.path.join(OUT, f'r_{name}.png'))
        place(grey(blue)).save(os.path.join(OUT, f'i_{name}.png'))
    print(len(CROPS), 'unidades')

main()
