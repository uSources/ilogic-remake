"""Colores de bando para los edificios: el azul se gira a rojo o se pasa a gris."""
import colorsys
import numpy as np
from PIL import Image


def recolor(img, mode):
    px = np.array(img).astype(float) / 255
    out = px.copy()
    for y in range(px.shape[0]):
        for x in range(px.shape[1]):
            r, g, b, al = px[y, x]
            if not al:
                continue
            h, s, v = colorsys.rgb_to_hsv(r, g, b)
            if 0.42 < h < 0.62 and s > 0.25:  # azul/cian del bando
                if mode == 'r':
                    h = (h - 0.5) % 1.0
                    h = 0.99 if h > 0.5 else h * 0.2
                else:
                    s *= 0.1
                    v *= 0.92
                out[y, x, :3] = colorsys.hsv_to_rgb(h, s, v)
    return Image.fromarray((out * 255).round().astype(np.uint8))
