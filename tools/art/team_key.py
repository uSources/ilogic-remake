"""Color clave de bando: lo magenta de un dibujo se cambia por la escala del bando segun su brillo.
Asi cada unidad se genera una sola vez (neutra, con magenta) y el codigo saca azul, rojo y gris."""
import colorsys
import numpy as np
from PIL import Image

RAMPS = {
    'b': [(14, 46, 96), (31, 95, 168), (58, 168, 255), (160, 220, 255)],
    'r': [(96, 16, 18), (168, 36, 31), (255, 77, 69), (255, 168, 156)],
    'i': [(58, 63, 70), (106, 114, 122), (164, 172, 180), (222, 227, 232)],
}


def is_key(r, g, b):
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    return (0.76 < h < 0.97) and s > 0.28


def recolor(im, team):
    a = np.array(im.convert('RGBA'))
    out = a.copy()
    ramp = RAMPS[team]
    for y in range(a.shape[0]):
        for x in range(a.shape[1]):
            r, g, b, al = (int(c) for c in a[y, x])
            if al and is_key(r, g, b):
                v = max(r, g, b) / 255
                lo = min(r, g, b) / 255
                # Brillo y blancura (los reflejos tiran a rosa claro): de sombra a brillo.
                k = 0 if v < 0.45 else 1 if v < 0.72 else 3 if lo > 0.55 else 2
                out[y, x, :3] = ramp[k]
    return Image.fromarray(out)
