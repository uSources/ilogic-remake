"""Graficos de la interfaz hechos con Retro Diffusion (retratos de los generales, iconos de sus
habilidades, clima, zona y banderin de los puntos de control).

Fuente: tools/art/retrodiffusion/ui/ (PNG ya recortados, sin fondo, al tamaño nativo):
  gen_<General>.png  48x48  retrato con el color del bando en magenta
  ab_<habilidad>.png 16x16  icono de una habilidad de general (id de generals.json)
  wx_<clima>.png     16x16  icono del clima (id de weather.json)
  zona.png           16x16  icono de punto de control (magenta = bando)
  flag.png           16x24  banderin que se planta en el mapa (magenta = bando)
  cmd_<orden>.png    16x16  icono sobre la unidad en automatico (attack, defend, capture; RD Plus low_res)
  mk_<marca>.png     8-10px marcas de la unidad: star (veterania), noheal (no se cura), cargo (lleva carga)
  pj_<proyectil>.png proyectiles del combate (missile mirando arriba a la derecha, ball, bomb hacia abajo)
  anim_<efecto>.png  hoja de RD (rd_animation__vfx) en rejilla de 48x48: sale un PNG por fotograma
                     (anim_<efecto>_<n>), sin los vacios y sin las manchas magenta sueltas que deja RD

Del banderin salen tambien los de destino de las ordenes (flag_cmd_<orden> y flag_cmd_go), girando el
magenta al color de cada orden.

Salida: public/assets/img/ui/ (claves "ui/<nombre>"). Lo que lleva magenta sale en azul (b), rojo (r)
y, para lo que puede no ser de nadie, gris (i), con team_key.recolor como las unidades.
Uso: python3 tools/art/rd_ui.py (lo llama npm run assets).
"""
import colorsys, glob, os, sys

from PIL import Image

D = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, D)
from team_key import is_key, recolor  # noqa: E402

SRC = os.path.join(D, 'retrodiffusion', 'ui')
OUT = os.path.normpath(os.path.join(D, '..', '..', 'public', 'assets', 'img', 'ui'))

# Prefijo -> bandos que se sacan (None = se copia tal cual).
ANIM_FRAME = 48
TEAMS = {'anim': None, 'pj': None, 'gen': 'br', 'zona': 'bri', 'flag': 'bri', 'ab': None, 'wx': None, 'cmd': None, 'mk': None}

# Color de cada orden (tono 0..1), el mismo que COMMAND_FLAG de src/ui/mapView.ts; 'go' = ir alli (dorado).
CMD_HUES = {'attack': 0.0, 'defend': 0.47, 'capture': 0.13, 'go': 0.13}


# Contorno oscuro de 1 px alrededor (los iconos de orden van encima del dibujo de la unidad).
OUTLINE = {'cmd', 'mk', 'pj'}
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


def to_hue(im, hue):
    """Lo magenta pasa al tono `hue` conservando brillo y saturacion (como team_key.recolor)."""
    out = im.copy()
    px = out.load()
    w, h = out.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if not a or not is_key(r, g, b):
                continue
            _, sat, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            rr, gg, bb = colorsys.hsv_to_rgb(hue, sat, min(1.0, v * 1.05))
            px[x, y] = (round(rr * 255), round(gg * 255), round(bb * 255), a)
    return out


def split_anim(im, name):
    """Fotogramas de una hoja de animacion, en orden de lectura, quitando los vacios y el magenta suelto."""
    frames = []
    for row in range(im.height // ANIM_FRAME):
        for col in range(im.width // ANIM_FRAME):
            box = (col * ANIM_FRAME, row * ANIM_FRAME, (col + 1) * ANIM_FRAME, (row + 1) * ANIM_FRAME)
            fr = im.crop(box)
            px = fr.load()
            for y in range(ANIM_FRAME):
                for x in range(ANIM_FRAME):
                    r, g, b, a = px[x, y]
                    if a and r > 180 and b > 180 and g < 120:
                        px[x, y] = (0, 0, 0, 0)
            if sum(fr.getchannel('A').point(lambda a: 1 if a else 0).histogram()[1:]) > 40:
                frames.append(fr)
    for i, fr in enumerate(frames):
        fr.save(os.path.join(OUT, f'{name}_{i}.png'))
    return len(frames)


def main():
    os.makedirs(OUT, exist_ok=True)
    n = 0
    for f in sorted(glob.glob(os.path.join(SRC, '*.png'))):
        name = os.path.splitext(os.path.basename(f))[0]
        prefix, _, rest = name.partition('_')
        if prefix not in TEAMS:
            raise SystemExit(f'{f}: prefijo desconocido (usa {", ".join(TEAMS)})')
        im = Image.open(f).convert('RGBA')
        if prefix == 'anim':
            n += split_anim(im, name)
            continue
        if prefix in OUTLINE:
            im = outline(im)
        if prefix == 'flag':
            for cmd, hue in CMD_HUES.items():
                to_hue(im, hue).save(os.path.join(OUT, f'flag_cmd_{cmd}.png'))
                n += 1
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
