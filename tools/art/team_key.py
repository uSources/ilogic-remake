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


# Tono de cada bando (0..1). El gris quita casi toda la saturacion.
HUES = {'b': 0.575, 'r': 0.0}


def recolor(im, team):
    """Gira el tono de lo magenta al del bando conservando brillo y saturacion de cada pixel:
    el contorno casi negro sigue casi negro y el sombreado se mantiene entero."""
    a = np.array(im.convert('RGBA'))
    out = a.copy()
    for y in range(a.shape[0]):
        for x in range(a.shape[1]):
            r, g, b, al = (int(c) for c in a[y, x])
            if not al or not is_key(r, g, b):
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if team == 'i':
                s, v = s * 0.12, min(1.0, v * 0.95 + 0.05)
                h = 0.58
            else:
                h = HUES[team]
                if team == 'b':
                    v = min(1.0, v * 1.05)
            out[y, x, :3] = [round(c * 255) for c in colorsys.hsv_to_rgb(h, s, v)]
    return Image.fromarray(out)
