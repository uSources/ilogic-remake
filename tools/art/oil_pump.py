"""Refineria animada como un balancin de pozo petrolero, a partir de su dibujo (sin IA):
la viga de arriba (con el remate) cabecea sobre su pivote y la torre y la base quedan quietas.
Salida: public/assets/img/flat/anim_{b|r|n}_Oil.png, 8 fotogramas de 64x64 (x=16, base en y=58)."""
import math, os
import numpy as np
from PIL import Image

D = os.path.dirname(os.path.abspath(__file__))
FLAT = D + '/../../public/assets/img/flat/'
N, AMP, PIVOT = 8, 7.0, (16, 9)

for t in 'brn':
    im = Image.open(FLAT + f'bld_{t}_Oil.png').convert('RGBA')
    a = np.array(im)
    h, w = a.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    # Viga: filas 0-12 enteras y los extremos que cuelgan (filas 13-17 fuera de la torre).
    beam = (yy <= 12) | ((yy <= 17) & ((xx < 8) | (xx > 23)))
    top = a.copy()
    top[~beam, 3] = 0
    rest = a.copy()
    rest[beam, 3] = 0
    row = Image.new('RGBA', (64 * N, 64))
    for k in range(N):
        ang = AMP * math.sin(2 * math.pi * k / N)
        # Pivote en el centro de la viga; se gira en un lienzo grande para no recortar.
        big = Image.new('RGBA', (64, 64))
        big.alpha_composite(Image.fromarray(top), (16, 16))
        rot = big.rotate(ang, resample=Image.NEAREST, center=(16 + PIVOT[0], 16 + PIVOT[1]))
        fr = Image.new('RGBA', (64, 64))
        fr.alpha_composite(Image.fromarray(rest), (16, 58 - h))
        fr.alpha_composite(rot, (0, 58 - h - 16))
        row.paste(fr, (k * 64, 0))
    row.save(FLAT + f'anim_{t}_Oil.png')
print('ok')
