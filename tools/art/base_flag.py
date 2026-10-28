"""Cuartel general animado a partir de su dibujo (sin IA): el edificio queda quieto y en lo alto
de la torre alta ondea una bandera del color del bando (8 fotogramas).
Salida: public/assets/img/flat/anim_{b|r}_Base.png, fotogramas de 64x64 (x=16, base en y=58)."""
import os, sys
from PIL import Image, ImageDraw

D = os.path.dirname(os.path.abspath(__file__))
FLAT = D + '/../../public/assets/img/flat/'
INK = (26, 31, 36, 255)
POLE = (196, 202, 208, 255)
# Tela del bando: claro, medio y sombra.
CLOTH = {'b': [(120, 200, 255), (58, 168, 255), (31, 95, 168)], 'r': [(255, 140, 130), (255, 77, 69), (168, 36, 31)]}
PX, TOP = 8, 0  # mastil en x=8 sobre la punta de la torre (fila 0 del dibujo)
# Altura de cada columna de la tela (0 = arriba) en 8 pasos: una onda que recorre la bandera.
WAVE = [[0, 0, 1, 1, 1, 0], [0, 1, 1, 1, 0, 0], [0, 1, 1, 0, 0, -1], [0, 1, 0, 0, -1, -1],
        [0, 0, 0, -1, -1, 0], [0, 0, -1, -1, 0, 0], [0, -1, -1, 0, 0, 1], [0, -1, 0, 0, 1, 1]]

for t in 'br':
    bld = Image.open(FLAT + f'bld_{t}_Base.png').convert('RGBA')
    h = bld.height
    row = Image.new('RGBA', (64 * 8, 64))
    for k in range(8):
        fr = Image.new('RGBA', (64, 64))
        oy = 58 - h
        fr.alpha_composite(bld, (16, oy))
        d = ImageDraw.Draw(fr)
        x0, y0 = 16 + PX, oy + TOP
        # Mastil (borde oscuro + brillo) y bola.
        d.line([(x0, y0 - 11), (x0, y0)], fill=INK)
        d.point((x0, y0 - 12), fill=POLE)
        light, mid, dark = CLOTH[t]
        for c, dy in enumerate(WAVE[k]):
            x = x0 + 1 + c
            top = y0 - 11 + dy
            d.line([(x, top), (x, top + 5)], fill=INK)
            d.line([(x, top + 1), (x, top + 4)], fill=mid + (255,))
            d.point((x, top + 1), fill=light + (255,))
            if dy > 0 or c == 5:
                d.point((x, top + 4), fill=dark + (255,))
        row.paste(fr, (k * 64, 0))
    row.save(FLAT + f'anim_{t}_Base.png')
print('ok')
