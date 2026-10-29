"""
Laminas precompiladas para que el juego no calcule nada pixel a pixel al cargar ni en cada fotograma.
Todas son piezas de 32x32 que dependen solo de la casilla y sus 8 vecinos, asi que encajan entre si:

  blob/org_<set>.png   Borde organico entre dos aguas (profunda->normal, normal->poco profunda o hielo):
                       la textura lisa del agua de arriba donde toca, con su linea clara en el borde.
                       Clave de 9 bits: casilla (256) + vecinos N1 E2 S4 W8 NE16 SE32 SW64 NW128.
  blob/fog.png         Niebla de guerra con el borde tramado. Misma clave (1 = no se ve).
  anim/water.png       Olas y brillos del agua: 4 variantes (2 de agua, 2 de agua profunda) x 12 fotogramas.
  anim/shore_<set>.png Espuma que llega a la orilla: una fila por pieza de costa de la lamina blob del
                       terreno (mismo orden) x 12 fotogramas.

Ademas escribe src/ui/sheets.ts con las tablas. El ruido que hace serpentear los bordes se repite
cada 32 px, para que las piezas casen. Uso: python3 tools/art/build_sheets.py (lo llama npm run assets).
"""
import math, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)
import build_blob as bb  # noqa: E402

IMG = os.path.join(ROOT, '..', '..', 'public', 'assets', 'img')
OUT_TS = os.path.join(ROOT, '..', '..', 'src', 'ui', 'sheets.ts')
T, COLS, FRAMES = 32, 16, 12
N8 = [('N', 0, -1, 1), ('E', 1, 0, 2), ('S', 0, 1, 4), ('W', -1, 0, 8),
      ('NE', 1, -1, 16), ('SE', 1, 1, 32), ('SW', -1, 1, 64), ('NW', -1, -1, 128)]


def grid3(key):
    """Clave de 9 bits -> casillas 3x3 (g[y][x])."""
    g = [[False] * 3 for _ in range(3)]
    g[1][1] = bool(key & 256)
    for _, dx, dy, bit in N8:
        g[1 + dy][1 + dx] = bool(key & bit)
    return g


def hash01(i, j):
    """Mismo hash que el juego, pero con la rejilla repetida cada 32 px (4 celdas de 8 o 3,2 de 10)."""
    h = (i * 374761393 + j * 668265263) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFFFFFF) / 4294967296 - 0.5


def periodic_noise(S, G):
    """Ruido suave (rejilla de G px) que se repite cada 32 px, sobre un lienzo de S x S."""
    P = T // G
    ys, xs = np.mgrid[0:S, 0:S].astype(float)
    i = np.floor(xs / G).astype(int)
    j = np.floor(ys / G).astype(int)
    fx = xs / G - i
    fy = ys / G - j
    sx = fx * fx * (3 - 2 * fx)
    sy = fy * fy * (3 - 2 * fy)
    hv = np.vectorize(lambda a, b: hash01(a % P, b % P))
    h00, h10, h01, h11 = hv(i, j), hv(i + 1, j), hv(i, j + 1), hv(i + 1, j + 1)
    a = h00 + (h10 - h00) * sx
    b = h01 + (h11 - h01) * sx
    return a + (b - a) * sy


S3 = 3 * T
NOISE8 = periodic_noise(S3, 8)
NOISE_FOG = periodic_noise(S3, 8)
YS, XS = np.mgrid[0:S3, 0:S3].astype(float)


def field(g):
    """Campo suave entre centros de casilla (0 abajo, 1 arriba) en el trozo 3x3."""
    v = np.array([[1.0 if g[y][x] else 0.0 for x in range(3)] for y in range(3)])
    gx = (XS + 0.5) / T - 0.5
    gy = (YS + 0.5) / T - 0.5
    cx = np.clip(np.floor(gx).astype(int), -1, 2)
    cy = np.clip(np.floor(gy).astype(int), -1, 2)
    fx = gx - np.floor(gx)
    fy = gy - np.floor(gy)
    sx = fx * fx * (3 - 2 * fx)
    sy = fy * fy * (3 - 2 * fy)
    V = lambda x, y: v[np.clip(y, 0, 2), np.clip(x, 0, 2)]
    a = V(cx, cy) + (V(cx + 1, cy) - V(cx, cy)) * sx
    b = V(cx, cy + 1) + (V(cx + 1, cy + 1) - V(cx, cy + 1)) * sx
    return a + (b - a) * sy


def organic_tile(key, tex):
    """Agua de arriba con borde organico (igual que el antiguo organicPass del juego)."""
    f = field(grid3(key)) + NOISE8 * 0.42
    inside = f > 0.5
    edge = inside & ~(np.roll(inside, 1, 0) & np.roll(inside, -1, 0) & np.roll(inside, 1, 1) & np.roll(inside, -1, 1))
    c = slice(T, 2 * T)
    ins, ed = inside[c, c], edge[c, c]
    out = np.zeros((T, T, 4), np.uint8)
    out[ins, :3] = tex[ins, :3]
    out[ins, 3] = 255
    light = np.minimum(255, tex[..., :3].astype(int) + [70, 70, 60])
    out[ed, :3] = light[ed]
    return out


FOG = (16, 24, 44)
ALPHA = 150
BAYER = np.array([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]).reshape(4, 4)


def fog_tile(key):
    """Niebla: velo azul oscuro con el borde tramado (Bayer 4x4), como el antiguo paintFog."""
    f = field(grid3(key)) + NOISE_FOG * 0.38
    t = (f - 0.35) / 0.3
    by = BAYER[(YS.astype(int) & 3), (XS.astype(int) & 3)]
    on = (t >= 1) | ((t > 0) & (t * 16 > by))
    c = slice(T, 2 * T)
    out = np.zeros((T, T, 4), np.uint8)
    m = on[c, c]
    out[m] = FOG + (ALPHA,)
    return out


def sheet(tiles, cols=COLS):
    rows = max(1, math.ceil(len(tiles) / cols))
    im = Image.new('RGBA', (cols * T, rows * T))
    for i, t in enumerate(tiles):
        im.paste(Image.fromarray(t), ((i % cols) * T, (i // cols) * T))
    return im


def keyed_sheet(make):
    """Pieza para cada una de las 512 claves, sin repetir las iguales. Devuelve (piezas, indice por clave; -1 = vacia)."""
    tiles, index, seen = [], [], {}
    for key in range(512):
        t = make(key)
        if not t[..., 3].any():
            index.append(-1)
            continue
        h = t.tobytes()
        if h not in seen:
            seen[h] = len(tiles)
            tiles.append(t)
        index.append(seen[h])
    return tiles, index


# --- Olas y brillos del agua ------------------------------------------------------------------

def lcg(seed):
    r = [seed or 1]
    def rnd():
        r[0] = (r[0] * 1664525 + 1013904223) & 0xFFFFFFFF
        return r[0] / 4294967296
    return rnd


def blend(px, x, y, rgb, a):
    if 0 <= x < T and 0 <= y < T:
        px[y, x] = (*rgb, int(round(a * 255)))


def water_frames(seed, deep):
    """Una variante de casilla de agua en 12 fotogramas (mismas olas y brillos que el antiguo drawWater)."""
    rnd = lcg(seed)
    marks = []
    n = 3 if deep else 2
    for i in range(n):
        marks.append(('wave', 3 + math.floor(rnd() * 18), 4 + math.floor(((i + rnd() * 0.8) * 24) / n), rnd(), 5 + math.floor(rnd() * 5)))
    if rnd() < 0.85:
        marks.append(('spark', 4 + math.floor(rnd() * 24), 4 + math.floor(rnd() * 24), rnd(), 0))
    out = []
    for f in range(FRAMES):
        px = np.zeros((T, T, 4), np.uint8)
        for kind, mx, my, ph, ln in marks:
            p = (f / FRAMES + ph) % 1
            if kind == 'wave':
                if p > 0.75:
                    continue
                q = p / 0.75
                a = 0.35 if q < 0.2 or q > 0.8 else 0.7
                off = round(q * 3)
                l = ln - 2 if q < 0.2 or q > 0.8 else ln
                x = min(mx + off, T - l)
                for k in range(1, l - 1):
                    blend(px, x + k, my, (255, 255, 255), a)
                    blend(px, x + k, my + 1, (11, 58, 107), a * 0.45)
                blend(px, x, my + 1, (255, 255, 255), a)
                blend(px, x + l - 1, my + 1, (255, 255, 255), a)
            else:
                W = (255, 255, 255)
                if p < 0.05 or 0.2 <= p < 0.25:
                    blend(px, mx, my, W, 1)
                elif 0.05 <= p < 0.1 or 0.15 <= p < 0.2:
                    for d in (-1, 0, 1):
                        blend(px, mx + d, my, W, 1)
                        blend(px, mx, my + d, W, 1)
                elif 0.1 <= p < 0.15:
                    for dx in (-1, 0, 1):
                        for dy in (-1, 0, 1):
                            blend(px, mx + dx, my + dy, W, 0.5)
                    for d in (-2, -1, 0, 1, 2):
                        blend(px, mx + d, my, W, 1)
                        blend(px, mx, my + d, W, 1)
        out.append(px)
    return out


# --- Espuma de la orilla ----------------------------------------------------------------------

SHORE_MAX = 6


def _gap(x, y):
    """Huecos fijos en la espuma (mismo hash que el juego, con coordenadas dentro de la casilla)."""
    h = ((x >> 1) * 374761393 + (y >> 1) * 668265263) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFFFFFF) % 100 < 18


GAP = np.array([[_gap(x, y) for x in range(T)] for y in range(T)])
WAVE_AT = [6, 5, 4, 3, 2, 1, 1, 2, 3, 0, 0, 0]


def shore_frames(land_tile, l3):
    """Espuma en 12 fotogramas para una casilla de agua con costa (como el antiguo drawShore).
    La tierra es la pieza de costa de la casilla (franja incluida) y las casillas de tierra vecinas."""
    mask = np.zeros((S3, S3), bool)
    for y in range(3):
        for x in range(3):
            if l3[y][x]:
                mask[y * T:(y + 1) * T, x * T:(x + 1) * T] = True
    mask[T:2 * T, T:2 * T] |= land_tile[..., 3] > 0
    dist = np.where(mask, 255, 0).astype(int)
    front = mask.copy()
    for d in range(1, SHORE_MAX + 1):
        grow = np.zeros_like(front)
        grow[1:] |= front[:-1]
        grow[:-1] |= front[1:]
        grow[:, 1:] |= front[:, :-1]
        grow[:, :-1] |= front[:, 1:]
        new = grow & (dist == 0)
        dist[new] = d
        front = new
    c = slice(T, 2 * T)
    dc = dist[c, c]
    gap = GAP
    frames = []
    for f in range(FRAMES):
        px = np.zeros((T, T, 4), np.uint8)
        hit = WAVE_AT[f] == 1
        m1 = (dc == 1) & ~gap
        px[m1] = (255, 255, 255, int((0.85 if hit else 0.45) * 255))
        r = WAVE_AT[f]
        if r > 1:
            back = f >= 6
            a = (0.35 if back else 0.55) + (SHORE_MAX - r) * 0.06
            mr = (dc == r) & ~gap
            px[mr] = (255, 255, 255, int(a * 255))
        frames.append(px)
    return frames


def main():
    os.makedirs(os.path.join(IMG, 'blob'), exist_ok=True)
    os.makedirs(os.path.join(IMG, 'anim'), exist_ok=True)
    ts = ['// Generado por tools/art/build_sheets.py. No editar a mano.',
          '/** Piezas por clave de 9 bits (casilla 256 + vecinos N1 E2 S4 W8 NE16 SE32 SW64 NW128); -1 = nada que pintar. */',
          f'export const SHEET_COLS = {COLS};', f'export const ANIM_FRAMES = {FRAMES};']
    # Bordes organicos entre aguas.
    org = {}
    for name in ('ts_deep_water', 'ts_water_shallow2', 'ts_water_ice'):
        wang = np.array(Image.open(os.path.join(IMG, 'wang', name + '.png')).convert('RGBA'))
        tex = wang[:, 15 * T:16 * T]
        tiles, index = keyed_sheet(lambda k: organic_tile(k, tex))
        sheet(tiles).save(os.path.join(IMG, 'blob', f'org_{name}.png'))
        org[name] = index
        print('org', name, len(tiles), 'piezas')
    ts.append('export const ORG_SHEETS: Record<string, number[]> = {')
    for n, idx in org.items():
        ts.append(f'  {n}: [{", ".join(map(str, idx))}],')
    ts.append('};')
    # Niebla.
    tiles, index = keyed_sheet(fog_tile)
    sheet(tiles).save(os.path.join(IMG, 'blob', 'fog.png'))
    ts.append(f'export const FOG_SHEET: number[] = [{", ".join(map(str, index))}];')
    print('fog', len(tiles), 'piezas')
    # Olas y brillos: filas 0-1 agua, 2-3 agua profunda.
    rows = [water_frames(s, d) for s, d in ((11, False), (29, False), (47, True), (83, True))]
    sheet([f for r in rows for f in r], FRAMES).save(os.path.join(IMG, 'anim', 'water.png'))
    ts.append('/** anim/water.png: fila 0-1 agua, 2-3 agua profunda; columnas = fotogramas. */')
    ts.append('export const WATER_ROWS = { water: [0, 1], deep: [2, 3] };')
    # Espuma de la orilla: una fila por pieza de costa (mismo orden que BLOB_SETS[set].water).
    ts.append('/** anim/shore_<set>.png: fila por mascara de costa (la de BLOB_SETS[set].water); columnas = fotogramas. */')
    ts.append('export const SHORE_ROWS: Record<string, Record<number, number>> = {')
    for name in bb.SETS:
        blob = np.array(Image.open(os.path.join(IMG, 'blob', name + '.png')).convert('RGBA'))
        water_idx = {}
        for m in range(256):
            r = bb.reduce_mask(m)
            if r and r not in water_idx:
                water_idx[r] = None
        # Reproduce el orden de build_blob: 16 piezas de tierra y luego las de agua por mascara reducida.
        order, rows_out, mapping = [], [], {}
        i = 16
        for m in range(256):
            r = bb.reduce_mask(m)
            if r == 0 or r in mapping:
                continue
            l3 = [[False] * 3 for _ in range(3)]
            for n, dx, dy, bit in N8:
                if r & bit:
                    l3[1 + dy][1 + dx] = True
            tile = blob[(i // 8) * T:(i // 8 + 1) * T, (i % 8) * T:(i % 8 + 1) * T]
            mapping[r] = len(rows_out)
            rows_out.append(shore_frames(tile, l3))
            i += 1
        sheet([f for r in rows_out for f in r], FRAMES).save(os.path.join(IMG, 'anim', f'shore_{name}.png'))
        ts.append(f'  {name}: {{ {", ".join(f"{k}: {v}" for k, v in mapping.items())} }},')
        print('shore', name, len(rows_out), 'filas')
    ts.append('};')
    open(OUT_TS, 'w').write('\n'.join(ts) + '\n')


if __name__ == '__main__':
    main()
