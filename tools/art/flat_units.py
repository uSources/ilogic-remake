"""
Unidades en estilo plano, vista 3/4 (de lado, mirando a la derecha, con algo de la parte de arriba),
dibujadas por codigo a 32x32. Todas comparten paleta, contorno y escala.
Uso: python3 tools/art/flat_units.py  (de momento: muestras)
"""
import os
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'assets', 'img', 'flat')
INK = (16, 22, 40, 255)
# Rampa del bando (oscuro, base, claro, brillo); se cambia por la roja o la gris al final.
TEAM = {'blue': [(18, 62, 128), (31, 111, 209), (72, 160, 245), (160, 212, 255)],
        'red': [(120, 28, 24), (196, 52, 44), (240, 98, 84), (255, 176, 164)],
        'grey': [(64, 70, 84), (112, 120, 136), (152, 160, 176), (204, 210, 222)]}
METAL = [(44, 50, 64), (78, 86, 102), (120, 128, 146)]
SKIN, SKIN_D = (255, 205, 160), (222, 160, 118)
WOOD = (150, 92, 48)

class Pen:
    def __init__(self, ramp, w=32, h=32):
        self.im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); self.d = ImageDraw.Draw(self.im); self.t = ramp
    def rect(self, box, c): self.d.rectangle(box, fill=c + (255,) if len(c) == 3 else c)
    def rrect(self, box, r, c): self.d.rounded_rectangle(box, r, fill=c + (255,))
    def ell(self, box, c): self.d.ellipse(box, fill=c + (255,))
    def poly(self, pts, c): self.d.polygon(pts, fill=c + (255,))
    def px(self, x, y, c): self.im.putpixel((x, y), c + (255,))
    def done(self, shadow=True):
        a = np.asarray(self.im)[..., 3] > 0
        ring = ndimage.binary_dilation(a, structure=np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]])) & ~a
        arr = np.asarray(self.im).copy(); arr[ring] = INK
        out = Image.fromarray(arr)
        if shadow:
            sh = Image.new('RGBA', out.size, (0, 0, 0, 0)); ImageDraw.Draw(sh).ellipse((5, 27, 27, 31), fill=(0, 30, 0, 70))
            sh.alpha_composite(out); out = sh
        return out

def tank(ramp):
    p = Pen(ramp); d, l, b, h = ramp[0], ramp[1], ramp[2], ramp[3]
    # orugas
    p.rrect((3, 21, 28, 28), 3, METAL[0]); p.rrect((4, 22, 27, 25), 2, METAL[1])
    for x in (7, 12, 17, 22): p.ell((x - 2, 23, x + 2, 27), METAL[2]); p.px(x, 25, METAL[0])
    # casco: lado y techo
    p.rect((4, 15, 27, 21), l); p.rect((4, 13, 26, 15), b); p.rect((5, 13, 24, 13), h)
    p.rect((4, 20, 27, 21), d)
    # torreta
    p.rrect((9, 7, 21, 14), 3, l); p.rrect((10, 7, 20, 10), 2, b); p.rect((11, 7, 18, 7), h)
    # cañon
    p.rect((20, 9, 30, 11), METAL[1]); p.rect((20, 9, 30, 9), METAL[2]); p.rect((28, 8, 30, 12), METAL[1])
    # escotilla y estrella
    p.rect((13, 5, 16, 6), d); p.px(7, 17, h); p.px(8, 17, h)
    return p.done()

def soldier(ramp):
    p = Pen(ramp); d, l, b, h = ramp[0], ramp[1], ramp[2], ramp[3]
    # piernas y botas
    p.rect((12, 23, 14, 27), d); p.rect((17, 23, 19, 27), d)
    p.rect((11, 27, 15, 28), METAL[0]); p.rect((16, 27, 20, 28), METAL[0])
    # cuerpo
    p.rrect((11, 16, 20, 24), 2, l); p.rect((11, 22, 20, 23), d); p.rect((12, 17, 13, 21), b)
    # cabeza (grande, chibi) y casco
    p.ell((10, 7, 21, 17), SKIN); p.rect((17, 12, 18, 13), INK[:3]); p.rect((14, 15, 18, 16), SKIN_D)
    p.ell((8, 3, 22, 13), l); p.rect((8, 10, 22, 11), d); p.ell((11, 4, 17, 8), b); p.px(12, 5, h)
    # brazo y carabina de cerrojo
    p.rect((14, 18, 22, 19), b)
    p.rect((9, 19, 27, 20), WOOD); p.rect((19, 18, 28, 18), METAL[1]); p.px(21, 17, METAL[2])
    p.ell((20, 17, 23, 20), SKIN)
    return p.done()

def missile_truck(ramp):
    p = Pen(ramp); d, l, b, h = ramp[0], ramp[1], ramp[2], ramp[3]
    # chasis y ruedas
    p.rect((2, 21, 29, 23), METAL[0])
    for x in (7, 15, 24): p.ell((x - 3, 21, x + 3, 27), METAL[0]); p.ell((x - 1, 23, x + 1, 25), METAL[2])
    # cabina (derecha)
    p.rect((20, 12, 29, 21), l); p.rect((20, 11, 28, 12), b); p.rect((24, 13, 28, 17), (170, 225, 255)); p.rect((24, 13, 28, 13), h)
    p.rect((20, 20, 29, 21), d); p.px(29, 19, (255, 230, 120))
    # caja con soporte
    p.rect((2, 16, 19, 21), l); p.rect((2, 15, 19, 16), b); p.rect((2, 20, 19, 21), d)
    p.poly([(6, 15), (9, 15), (12, 11), (9, 11)], METAL[1])
    # misil inclinado (blanco con punta roja)
    p.poly([(2, 15), (5, 17), (20, 5), (17, 3)], (238, 242, 250)); p.poly([(17, 3), (20, 5), (23, 1), (21, 0)], (230, 70, 60))
    p.poly([(2, 15), (4, 16), (6, 14), (4, 13)], (150, 160, 180)); p.poly([(1, 12), (3, 14), (5, 13), (4, 11)], (230, 70, 60))
    return p.done()

def main():
    os.makedirs(OUT, exist_ok=True)
    units = {'Soldier': soldier, 'Tank': tank, 'Missile_truck': missile_truck}
    for name, fn in units.items():
        for side, ramp in (('b', TEAM['blue']), ('r', TEAM['red']), ('i', TEAM['grey'])):
            im = fn(ramp)
            if side == 'r': im = im.transpose(Image.FLIP_LEFT_RIGHT)
            im.save(os.path.join(OUT, f'{side}_{name}.png'))
    print('ok')

main()
