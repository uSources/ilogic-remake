"""Retratos de las unidades para la interfaz: pixel art de 64x64 a partir de sus renders 3D.

Entrada: tools/art/retratos/3d/<lado>_<Unidad>.png (los hace tools/art/retratos3d.mjs, sobre magenta).
Salida, en public/assets/img/retrato/:
  b_<Unidad>.png  la propia (azul), r_<Unidad>.png  la enemiga (roja),
  i_<Unidad>.png  la propia ya ha actuado (gris).
Se quita el fondo magenta, se recorta a la unidad, se reduce a 64 pixeles y se cuantiza a una paleta
pequena sin difuminar, con borde duro (alfa 0 o 255). No llama a ningun servicio.

    python3 tools/art/retratos_pixel.py
"""

from __future__ import annotations

import glob
import os

import numpy as np
from PIL import Image, ImageFilter, ImageOps

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "retratos", "3d")
OUT = os.path.normpath(os.path.join(ROOT, "..", "..", "public", "assets", "img", "retrato"))
SIZE = 64  # lado del retrato final, en pixeles
COLORS = 40  # colores de la paleta de cada retrato
MAGENTA = np.array([255, 0, 255])
OUTLINE = (20, 16, 28, 255)  # contorno: casi negro, con un tinte morado (como los sprites de antes)
KEY_TOLERANCE = 90  # distancia (suma de canales) para considerar el fondo magenta


def cut_out(render: Image.Image) -> Image.Image:
    """La unidad sobre transparente: lo parecido al magenta del fondo, fuera."""
    rgb = np.array(render.convert("RGB")).astype(int)
    background = np.abs(rgb - MAGENTA).sum(-1) < KEY_TOLERANCE
    rgba = np.dstack([rgb.astype(np.uint8), np.where(background, 0, 255).astype(np.uint8)])
    return Image.fromarray(rgba)


def fit(unit: Image.Image) -> Image.Image:
    """Recorta a la caja de la unidad y la pone centrada en un lienzo de SIZE x SIZE."""
    box = unit.getbbox()
    if box is None:
        raise SystemExit("render vacio: no se ve la unidad")
    unit = unit.crop(box)
    scale = (SIZE - 4) / max(unit.width, unit.height)
    small = unit.resize((max(1, round(unit.width * scale)), max(1, round(unit.height * scale))), Image.Resampling.BOX)
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    canvas.paste(small, ((SIZE - small.width) // 2, (SIZE - small.height) // 2))
    return canvas


def pixelate(art: Image.Image) -> Image.Image:
    """Paleta pequena sin difuminar y borde duro, con un contorno de un pixel."""
    alpha = art.getchannel("A").point(lambda value: 255 if value >= 128 else 0)
    quantized = art.convert("RGB").quantize(colors=COLORS, dither=Image.Dither.NONE).convert("RGBA")
    quantized.putalpha(alpha)
    return outline(quantized)


def outline(art: Image.Image) -> Image.Image:
    """Pone un pixel del color del contorno alrededor de la silueta (fuera de ella, nunca encima)."""
    inside = np.array(art.getchannel("A")) > 0
    grown = Image.fromarray((inside * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))
    ring = (np.array(grown) > 0) & ~inside
    pixels = np.array(art)
    pixels[ring] = OUTLINE
    return Image.fromarray(pixels)


def grey(art: Image.Image) -> Image.Image:
    """La version gris de la propia (ya ha actuado), como los iconos de antes."""
    alpha = art.getchannel("A")
    grey_art = ImageOps.grayscale(art.convert("RGB")).convert("RGBA")
    grey_art.putalpha(alpha)
    return grey_art


def portrait(render_path: str) -> Image.Image:
    return pixelate(fit(cut_out(Image.open(render_path))))


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    own = sorted(glob.glob(os.path.join(SRC, "own_*.png")))
    if not own:
        raise SystemExit(f"No hay renders en {SRC}: ejecutar `npm run retratos`.")
    for path in own:
        name = os.path.basename(path)[len("own_") : -len(".png")]
        blue = portrait(path)
        blue.save(os.path.join(OUT, f"b_{name}.png"))
        grey(blue).save(os.path.join(OUT, f"i_{name}.png"))
        enemy = os.path.join(SRC, f"enemy_{name}.png")
        if not os.path.exists(enemy):
            raise SystemExit(f"Falta el render enemigo de {name}")
        portrait(enemy).save(os.path.join(OUT, f"r_{name}.png"))
        print(name)
    print(f"{len(own)} retratos en {OUT}")


if __name__ == "__main__":
    main()
