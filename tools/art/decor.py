"""
Decorados sueltos del terreno nuevo, dibujados pixel a pixel (flores y muñeco de nieve) o
sacados de la hoja de PixelLab (cactus). Salen a public/assets/img/wang/decor_<tipo>_<n>.png (32x32).
Uso: python3 tools/art/decor.py
"""
import os, random
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, '..', '..', 'public', 'assets', 'img', 'wang')
SRC = os.path.join(ROOT, 'pixellab')

def rgba(h, a=255): return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (a,)
OUTLINE = rgba('1e3a1a')
PETALS = ['ff4d45', 'f2f5ff', 'ffd447', 'b06be0', 'ff8ac8', '5eb3ff']

def shadow(im, cx, cy, w, h=2):
    d = ImageDraw.Draw(im)
    d.ellipse((cx - w, cy - h, cx + w, cy + h), fill=(0, 40, 0, 70))

def flower(im, x, y, col):
    px = im.load()
    c = rgba(col); dark = tuple(max(0, v - 70) for v in c[:3]) + (255,)
    # tallo y hoja
    for k in range(1, 5): px[x, y + k] = rgba('1f7a2e')
    px[x + 1, y + 2] = rgba('2e9a3d')
    # petalos en cruz con borde oscuro abajo
    for dx, dy in ((0, -1), (-1, 0), (1, 0), (0, 1), (-1, -1), (1, -1)): px[x + dx, y + dy] = c
    for dx, dy in ((0, -2), (-2, 0), (2, 0)): px[x + dx, y + dy] = c
    px[x + 1, y + 1] = dark; px[x - 1, y + 1] = dark
    px[x, y] = rgba('ffd447') if col != 'ffd447' else rgba('ff8a3d')

def tuft(im, x, y):
    px = im.load()
    for dx, dy in ((0, 0), (-1, -1), (1, -1), (0, -2), (2, -2)): px[x + dx, y + dy] = rgba('1f7a2e')

def flowers(seed):
    r = random.Random(seed); im = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
    cols = r.sample(PETALS, 2)
    pts = []
    while len(pts) < r.randint(4, 6):
        p = (r.randint(4, 27), r.randint(4, 23))
        if all(abs(p[0] - q[0]) + abs(p[1] - q[1]) > 8 for q in pts): pts.append(p)
    for i, (x, y) in enumerate(pts):
        shadow(im, x, y + 4, 2, 1)
        flower(im, x, y, cols[i % 2])
    for _ in range(3): tuft(im, r.randint(3, 28), r.randint(6, 29))
    return im

def snowman(variant):
    im = Image.new('RGBA', (32, 32), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    shadow(im, 16, 28, 8, 2)
    edge = rgba('7f9ec2'); snow = rgba('ffffff'); shade = rgba('cfe0f5')
    d.ellipse((9, 15, 23, 28), fill=snow, outline=edge)        # cuerpo
    d.ellipse((11, 6, 21, 16), fill=snow, outline=edge)         # cabeza
    d.arc((10, 16, 22, 27), 20, 160, fill=shade)               # sombra del cuerpo
    px = im.load()
    hat = rgba('2a2a3a') if variant == 0 else rgba('b8322c')
    d.rectangle((12, 4, 20, 6), fill=hat); d.rectangle((14, 0, 18, 4), fill=hat)
    d.line((14, 3, 18, 3), fill=rgba('ff4d45') if variant == 0 else rgba('ffd447'))
    px[14, 10] = rgba('1a1a1a'); px[18, 10] = rgba('1a1a1a')   # ojos
    px[16, 12] = rgba('ff8a3d'); px[17, 12] = rgba('ff8a3d')   # nariz
    scarf = rgba('ff4d45') if variant == 0 else rgba('3aa8ff')
    d.rectangle((11, 15, 21, 16), fill=scarf); d.rectangle((19, 16, 20, 20), fill=scarf)
    for y in (19, 22, 25): px[16, y] = rgba('2a2a3a')            # botones
    d.line((9, 19, 4, 15), fill=rgba('6b4f2f')); d.line((23, 19, 28, 15), fill=rgba('6b4f2f'))
    px[4, 14] = rgba('6b4f2f'); px[28, 14] = rgba('6b4f2f')
    return im

G1, G2, G3 = rgba('1f6b34'), rgba('2fa84a'), rgba('7be07a')   # verde oscuro, medio y brillo
SPINE = rgba('fff1a8')

def blob(d, box, r):
    d.rounded_rectangle(box, r, fill=G2, outline=G1)

def saguaro():
    im = Image.new('RGBA', (32, 32), (0, 0, 0, 0)); shadow(im, 16, 28, 7, 2); d = ImageDraw.Draw(im)
    blob(d, (13, 4, 19, 28), 3)                       # tronco
    blob(d, (6, 11, 11, 21), 2); blob(d, (8, 18, 15, 22), 2)    # brazo izquierdo
    blob(d, (21, 7, 26, 17), 2); blob(d, (17, 14, 24, 18), 2)   # brazo derecho
    px = im.load()
    for y in range(6, 27, 3): px[15, y] = G3; px[17, y + 1] = G1
    for (x, y) in ((13, 9), (19, 13), (13, 20), (7, 14), (25, 10)): px[x, y] = SPINE
    return im

def barrel():
    im = Image.new('RGBA', (32, 32), (0, 0, 0, 0)); shadow(im, 16, 28, 8, 2); d = ImageDraw.Draw(im)
    d.ellipse((8, 12, 24, 28), fill=G2, outline=G1)
    for x in (12, 16, 20): d.line((x, 14, x, 26), fill=G1)
    d.arc((10, 13, 22, 25), 200, 260, fill=G3)
    px = im.load()
    for (x, y) in ((10, 18), (14, 15), (18, 15), (22, 18), (14, 22), (18, 22)): px[x, y] = SPINE
    d.ellipse((13, 8, 19, 13), fill=rgba('ff4d45'), outline=rgba('b8322c'))   # flor
    px[16, 10] = rgba('ffd447')
    return im

def pear():
    im = Image.new('RGBA', (32, 32), (0, 0, 0, 0)); shadow(im, 16, 28, 9, 2); d = ImageDraw.Draw(im)
    d.ellipse((10, 16, 22, 29), fill=G2, outline=G1)
    d.ellipse((4, 9, 14, 20), fill=G2, outline=G1)
    d.ellipse((17, 6, 27, 18), fill=G2, outline=G1)
    px = im.load()
    for (x, y) in ((8, 13), (11, 16), (21, 10), (24, 14), (14, 21), (18, 24)): px[x, y] = SPINE
    for (x, y) in ((6, 9), (20, 6), (24, 6)): d.ellipse((x, y - 2, x + 3, y + 1), fill=rgba('ff8ac8'), outline=rgba('b8322c'))
    return im

def cacti():
    return [saguaro(), barrel(), pear()]

def main():
    os.makedirs(OUT, exist_ok=True)
    for i in range(3): flowers(10 + i).save(os.path.join(OUT, f'decor_flowers_{i}.png'))
    for i, im in enumerate(cacti()): im.save(os.path.join(OUT, f'decor_cactus_{i}.png'))
    for i in range(2): snowman(i).save(os.path.join(OUT, f'decor_frosty_{i}.png'))
    for old in ('decor_flowers', 'decor_cactus', 'decor_frosty'):
        p = os.path.join(OUT, old + '.png')
        if os.path.exists(p): os.remove(p)
    print('ok')

main()
