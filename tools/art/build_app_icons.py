"""Iconos de la app (pestaña, PWA, pantalla de inicio) a partir del Soldado azul nuevo.

Sale de public/assets/img/u/b_Soldier.png (dibujo de Retro Diffusion, 32x32) y escribe en
public/icons/:
  favicon-32.png, favicon-64.png     pestaña del navegador (fondo transparente)
  icon-192.png, icon-512.png         manifest "any" (fondo transparente)
  maskable-192.png, maskable-512.png manifest "maskable": fondo lleno y el soldado dentro de la
                                     zona segura (circulo del 80 %), para que Android lo recorte
  apple-touch-icon.png               180x180 con fondo (iOS no acepta transparencia)
Siempre se amplia a pixeles enteros (sin suavizar) para que no se emborrone el pixel art.
No llama a ningun servicio.

    python3 tools/art/build_app_icons.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "public/assets/img/u/b_Soldier.png"
OUT = ROOT / "public/icons"
# Mismo color que theme-color y el fondo del juego (index.html, src/main.ts).
BG = (0x0B, 0x12, 0x20, 255)


def sprite() -> Image.Image:
    im = Image.open(SRC).convert("RGBA")
    box = im.getbbox()
    if box is None:
        raise SystemExit(f"{SRC} esta vacio")
    return im.crop(box)


def icon(spr: Image.Image, size: int, fill: float, bg: tuple[int, int, int, int] | None) -> Image.Image:
    """El dibujo ampliado a pixeles enteros hasta ocupar como mucho `fill` del lado, centrado."""
    scale = max(1, int(size * fill) // max(spr.width, spr.height))
    big = spr.resize((spr.width * scale, spr.height * scale), Image.Resampling.NEAREST)
    out = Image.new("RGBA", (size, size), bg or (0, 0, 0, 0))
    out.alpha_composite(big, ((size - big.width) // 2, (size - big.height) // 2))
    return out


def main() -> None:
    spr = sprite()
    OUT.mkdir(parents=True, exist_ok=True)
    # nombre: (lado, parte del lado que ocupa el dibujo, fondo)
    plan: dict[str, tuple[int, float, tuple[int, int, int, int] | None]] = {
        "favicon-32": (32, 1.0, None),
        "favicon-64": (64, 1.0, None),
        "icon-192": (192, 0.9, None),
        "icon-512": (512, 0.9, None),
        # Zona segura: circulo de diametro 0.8; un cuadrado de lado 0.56 cabe dentro.
        "maskable-192": (192, 0.56, BG),
        "maskable-512": (512, 0.56, BG),
        "apple-touch-icon": (180, 0.75, BG),
    }
    for name, (size, fill, bg) in plan.items():
        icon(spr, size, fill, bg).save(OUT / f"{name}.png", optimize=True)
    print(f"{len(plan)} iconos en {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
