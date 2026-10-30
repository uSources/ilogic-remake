"""Compila la letra Ilogic (tools/art/font/ilogic.txt) a src/hud/fonts/ilogic.woff2.

Cada pixel de la rejilla es un cuadrado de PX unidades; los pixeles vecinos se funden en un solo
contorno (sin costuras entre cuadrados al dibujarse). No llama a ningun servicio: solo fontTools.

    python3 tools/art/build_font.py
"""

from __future__ import annotations

import sys
from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "tools/art/font/ilogic.txt"
OUT = ROOT / "src/hud/fonts/ilogic.woff2"

FAMILY = "Ilogic"
# 100 unidades por pixel y 1000 por em: nitida a 10, 20, 30 y 40 px. La mayuscula mide 700, como
# la capHeight de Silkscreen, asi que cambiar de letra no descuadra la interfaz.
PX = 100
UPM = 1000
CAP_ROWS = 7
ASCENT = 1050  # tres filas de tilde encima de la mayuscula
DESCENT = 250
SPACE_ADVANCE = 4 * PX
SPACES = [0x20, 0xA0, 0x202F]


def parse(text: str) -> list[tuple[list[int], list[str], int, int]]:
    """[(codigos, filas, filas de encima, filas de debajo)]"""
    glyphs = []
    cur = None
    for n, raw in enumerate(text.splitlines(), 1):
        line = raw.rstrip()
        if not line or (line.startswith("#") and not set(line) <= {"#", "."}):
            continue  # linea en blanco o comentario
        if line.startswith("= "):
            codes = []
            for tok in line[2:].split():
                codes.append(int(tok[2:], 16) if tok.startswith("U+") and len(tok) > 2 else ord(tok) if len(tok) == 1 else bad(n, tok))
            cur = (codes, [], [0], [0])
            glyphs.append(cur)
            continue
        if cur is None:
            continue
        kind = line[0] if line[0] in "^," else ""
        row = line[1:] if kind else line
        if not set(row) <= {"#", "."}:
            raise SystemExit(f"{SRC.name}:{n}: fila con caracteres raros: {raw!r}")
        cur[1].append(row)
        if kind == "^":
            cur[2][0] += 1
        elif kind == ",":
            cur[3][0] += 1
    out = []
    for codes, rows, up, down in glyphs:
        name = "".join(chr(c) for c in codes)
        if len(rows) - up[0] - down[0] != CAP_ROWS:
            raise SystemExit(f"glifo {name!r}: tiene que tener {CAP_ROWS} filas de mayuscula")
        if len({len(r) for r in rows}) != 1:
            raise SystemExit(f"glifo {name!r}: filas de distinto ancho")
        out.append((codes, rows, up[0], down[0]))
    return out


def bad(n: int, tok: str):
    raise SystemExit(f"{SRC.name}:{n}: caracter mal escrito {tok!r} (uno solo o U+XXXX)")


def outline(rows: list[str], up: int) -> list[list[tuple[int, int]]]:
    """Contornos de la union de los pixeles (sentido horario, y hacia arriba)."""
    top = CAP_ROWS + up  # fila 0 ocupa de (top-1)*PX a top*PX
    edges: dict[tuple[tuple[int, int], tuple[int, int]], None] = {}

    def add(a, b):
        if (b, a) in edges:
            del edges[(b, a)]  # lado compartido con un vecino: desaparece
        else:
            edges[(a, b)] = None

    for r, row in enumerate(rows):
        for c, v in enumerate(row):
            if v != "#":
                continue
            x0, x1 = c * PX, (c + 1) * PX
            y1 = (top - r) * PX
            y0 = y1 - PX
            add((x0, y0), (x0, y1))
            add((x0, y1), (x1, y1))
            add((x1, y1), (x1, y0))
            add((x1, y0), (x0, y0))
    nxt: dict[tuple[int, int], list[tuple[int, int]]] = {}
    for a, b in edges:
        nxt.setdefault(a, []).append(b)
    loops = []
    while nxt:
        start = next(iter(nxt))
        loop = [start]
        p = start
        while True:
            b = nxt[p].pop()
            if not nxt[p]:
                del nxt[p]
            if b == start:
                break
            loop.append(b)
            p = b
        loops.append(simplify(loop))
    return loops


def simplify(loop: list[tuple[int, int]]) -> list[tuple[int, int]]:
    """Quita los puntos que estan en medio de un lado recto."""
    out = []
    n = len(loop)
    for i in range(n):
        a, b, c = loop[i - 1], loop[i], loop[(i + 1) % n]
        if (a[0] == b[0] == c[0]) or (a[1] == b[1] == c[1]):
            continue
        out.append(b)
    return out


def build() -> None:
    glyphs = parse(SRC.read_text(encoding="utf-8"))
    order = [".notdef", "space"]
    cmap = {c: "space" for c in SPACES}
    outlines = {}
    advances = {".notdef": (5 * PX + PX, 0), "space": (SPACE_ADVANCE, 0)}
    seen = set(SPACES)
    for i, (codes, rows, up, _down) in enumerate(glyphs):
        name = f"g{i:03d}"
        order.append(name)
        for c in codes:
            if c in seen:
                raise SystemExit(f"caracter repetido: {chr(c)!r}")
            seen.add(c)
            cmap[c] = name
        outlines[name] = outline(rows, up)
        width = len(rows[0]) * PX
        advances[name] = (width + PX, 0)

    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    glyf = {}
    for name in order:
        pen = TTGlyphPen(None)
        if name == ".notdef":
            box = [[(0, 0), (0, CAP_ROWS * PX), (5 * PX, CAP_ROWS * PX), (5 * PX, 0)], [(PX, PX), (4 * PX, PX), (4 * PX, 6 * PX), (PX, 6 * PX)]]
            loops = box
        else:
            loops = outlines.get(name, [])
        for loop in loops:
            pen.moveTo(loop[0])
            for pt in loop[1:]:
                pen.lineTo(pt)
            pen.closePath()
        glyf[name] = pen.glyph()
    fb.setupGlyf(glyf)
    metrics = {}
    for name in order:
        loops = outlines.get(name) or ([[(0, 0)]] if name != ".notdef" else [[(0, 0)]])
        metrics[name] = (advances[name][0], min(x for loop in loops for x, _ in loop))
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=ASCENT, descent=-DESCENT)
    fb.setupNameTable({"familyName": FAMILY, "styleName": "Regular", "uniqueFontIdentifier": f"{FAMILY}-Regular", "fullName": f"{FAMILY} Regular", "psName": f"{FAMILY}-Regular", "version": "1.0", "copyright": "Ilogic remake"})
    fb.setupOS2(
        sTypoAscender=ASCENT,
        sTypoDescender=-DESCENT,
        sTypoLineGap=0,
        usWinAscent=ASCENT,
        usWinDescent=DESCENT,
        sCapHeight=CAP_ROWS * PX,
        sxHeight=CAP_ROWS * PX,
        achVendID="ILGC",
    )
    fb.setupPost()
    fb.font.flavor = "woff2"
    OUT.parent.mkdir(parents=True, exist_ok=True)
    fb.save(str(OUT))
    print(f"{OUT.relative_to(ROOT)}: {len(glyphs)} dibujos, {len(cmap)} caracteres, {OUT.stat().st_size} bytes")


if __name__ == "__main__":
    sys.exit(build())
