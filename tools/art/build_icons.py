"""Compila los iconos de la interfaz (tools/art/icons/iconos.txt) a public/assets/img/ui/*.png.

Cabecera de cada dibujo:
  "= nombre"          icono de la interfaz: centrado en SIZE x SIZE, en ui/<nombre>.png (va al atlas)
  "= nombre AxB"      igual pero a tamaño exacto A x B, sin centrar
  "= nombre raton"    puntero del raton: 16x16, suelto en <nombre>.png (x2) y <nombre>_2x.png (x4)
No llama a ningun servicio.

    python3 tools/art/build_icons.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "tools/art/icons/iconos.txt"
OUT = ROOT / "public/assets/img/ui"
LOOSE_OUT = ROOT / "public/assets/img"
SIZE = 12
MOUSE = 16


def parse(text: str) -> tuple[dict[str, tuple[int, int, int, int]], dict[str, list[str]], dict[str, str]]:
    """(colores, filas de cada dibujo, tipo de cada dibujo: "" | "AxB" | "raton")"""
    colors: dict[str, tuple[int, int, int, int]] = {}
    icons: dict[str, list[str]] = {}
    kinds: dict[str, str] = {}
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
            parts = line[2:].split()
            name = parts[0]
            kinds[name] = parts[1] if len(parts) > 1 else ""
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
        cw, ch_ = canvas(kinds[name])
        if w > cw or h > ch_:
            raise SystemExit(f"icono {name!r}: {w}x{h}, el maximo es {cw}x{ch_}")
        for r in rows:
            for ch in r:
                if ch != "." and ch not in colors:
                    raise SystemExit(f"icono {name!r}: color {ch!r} sin definir")
    return colors, icons, kinds


def canvas(kind: str) -> tuple[int, int]:
    if kind == "raton":
        return MOUSE, MOUSE
    if kind:
        a, b = kind.lower().split("x")
        return int(a), int(b)
    return SIZE, SIZE


def build() -> None:
    colors, icons, kinds = parse(SRC.read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    ui = {n for n, k in kinds.items() if k != "raton"}
    for old in OUT.glob("*.png"):
        if old.stem not in ui:
            old.unlink()
    for name, rows in icons.items():
        w, h = max(len(r) for r in rows), len(rows)
        cw, ch_ = canvas(kinds[name])
        img = Image.new("RGBA", (cw, ch_), (0, 0, 0, 0))
        ox, oy = ((cw - w) // 2, (ch_ - h) // 2) if not kinds[name] else (0, 0)
        for y, row in enumerate(rows):
            for x, ch in enumerate(row):
                if ch != ".":
                    img.putpixel((ox + x, oy + y), colors[ch])
        if kinds[name] == "raton":
            img.resize((cw * 2, ch_ * 2), Image.NEAREST).save(LOOSE_OUT / f"{name}.png", optimize=True)
            img.resize((cw * 4, ch_ * 4), Image.NEAREST).save(LOOSE_OUT / f"{name}_2x.png", optimize=True)
        else:
            img.save(OUT / f"{name}.png", optimize=True)
    print(f"{len(ui)} iconos en {OUT.relative_to(ROOT)} y {len(icons) - len(ui)} punteros del raton")


if __name__ == "__main__":
    build()
