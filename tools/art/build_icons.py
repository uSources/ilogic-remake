"""Compila los iconos de la interfaz (tools/art/icons/iconos.txt) a public/assets/img/ui/*.png.

Cada icono se centra en un lienzo de SIZE x SIZE con fondo transparente. No llama a ningun servicio.

    python3 tools/art/build_icons.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "tools/art/icons/iconos.txt"
OUT = ROOT / "public/assets/img/ui"
SIZE = 12


def parse(text: str) -> tuple[dict[str, tuple[int, int, int, int]], dict[str, list[str]]]:
    colors: dict[str, tuple[int, int, int, int]] = {}
    icons: dict[str, list[str]] = {}
    mode = None
    cur: list[str] | None = None
    for n, raw in enumerate(text.splitlines(), 1):
        line = raw.rstrip()
        if not line or line.startswith("#"):
            continue
        if line == "colores:":
            mode = "colors"
            continue
        if line.startswith("= "):
            name = line[2:].strip()
            if name in icons:
                raise SystemExit(f"{SRC.name}:{n}: icono repetido {name!r}")
            cur = icons[name] = []
            mode = "icon"
            continue
        if mode == "colors":
            key, hexv = line.split()[:2]
            h = hexv.lstrip("#")
            colors[key] = (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)
        elif mode == "icon" and cur is not None:
            cur.append(line)
    for name, rows in icons.items():
        w, h = max(len(r) for r in rows), len(rows)
        if w > SIZE or h > SIZE:
            raise SystemExit(f"icono {name!r}: {w}x{h}, el maximo es {SIZE}x{SIZE}")
        for r in rows:
            for ch in r:
                if ch != "." and ch not in colors:
                    raise SystemExit(f"icono {name!r}: color {ch!r} sin definir")
    return colors, icons


def build() -> None:
    colors, icons = parse(SRC.read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.png"):
        if old.stem not in icons:
            old.unlink()
    for name, rows in icons.items():
        w, h = max(len(r) for r in rows), len(rows)
        img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
        ox, oy = (SIZE - w) // 2, (SIZE - h) // 2
        for y, row in enumerate(rows):
            for x, ch in enumerate(row):
                if ch != ".":
                    img.putpixel((ox + x, oy + y), colors[ch])
        img.save(OUT / f"{name}.png", optimize=True)
    print(f"{len(icons)} iconos en {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    build()
