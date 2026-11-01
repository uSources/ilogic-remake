"""Graficos de la interfaz hechos con Retro Diffusion (retratos de los generales, iconos de sus
habilidades, clima, zona y banderin de los puntos de control).

Fuente: tools/art/retrodiffusion/ui/ (PNG ya recortados, sin fondo, al tamaño nativo):
  gen_<General>.png  48x48  retrato con el color del bando en magenta
  ab_<habilidad>.png 16x16  icono de una habilidad de general (id de generals.json)
  wx_<clima>.png     16x16  icono del clima (id de weather.json)
  zona.png           16x16  icono de punto de control (magenta = bando)
  flag.png           16x24  banderin que se planta en el mapa (magenta = bando)
  cmd_<orden>.png    16x16  icono sobre la unidad en automatico (attack, defend, capture; RD Plus low_res)

Salida: public/assets/img/ui/ (claves "ui/<nombre>"). Lo que lleva magenta sale en azul (b), rojo (r)
y, para lo que puede no ser de nadie, gris (i), con team_key.recolor como las unidades.
Uso: python3 tools/art/rd_ui.py (lo llama npm run assets).
"""
import glob, os, sys

from PIL import Image

D = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, D)
from team_key import recolor  # noqa: E402

SRC = os.path.join(D, 'retrodiffusion', 'ui')
OUT = os.path.normpath(os.path.join(D, '..', '..', 'public', 'assets', 'img', 'ui'))

# Prefijo -> bandos que se sacan (None = se copia tal cual).
TEAMS = {'gen': 'br', 'zona': 'bri', 'flag': 'bri', 'ab': None, 'wx': None, 'cmd': None}


# Contorno oscuro de 1 px alrededor (los iconos de orden van encima del dibujo de la unidad).
OUTLINE = {'cmd'}
INK = (20, 24, 32, 255)


def outline(im):
    w, h = im.size
    src = im.load()
    out = im.copy()
    px = out.load()
    for y in range(h):
        for x in range(w):
            if src[x, y][3]:
                continue
            if any(0 <= x + dx < w and 0 <= y + dy < h and src[x + dx, y + dy][3] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                px[x, y] = INK
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    n = 0
    for f in sorted(glob.glob(os.path.join(SRC, '*.png'))):
        name = os.path.splitext(os.path.basename(f))[0]
        prefix, _, rest = name.partition('_')
        if prefix not in TEAMS:
            raise SystemExit(f'{f}: prefijo desconocido (usa {", ".join(TEAMS)})')
        im = Image.open(f).convert('RGBA')
        if prefix in OUTLINE:
            im = outline(im)
        teams = TEAMS[prefix]
        if teams is None:
            im.save(os.path.join(OUT, f'{name}.png'))
            n += 1
            continue
        for t in teams:
            out = f'{prefix}_{t}_{rest}' if rest else f'{prefix}_{t}'
            recolor(im, t).save(os.path.join(OUT, f'{out}.png'))
            n += 1
    print(f'{n} graficos de interfaz en {OUT}')


if __name__ == '__main__':
    main()
