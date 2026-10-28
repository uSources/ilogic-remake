"""
Laminas de costa al estilo Advance Wars (autotile "blob"): todas las piezas que puede necesitar una
casilla de tierra o de agua segun sus 8 vecinos, generadas a partir del set Wang del terreno.

  - Casilla de tierra: tierra entera; cada esquina se redondea si sus dos lados y su diagonal son agua
    (16 piezas). Las casillas con edificio, arbol o montaña usan la pieza sin redondear.
  - Casilla de agua: transparente (se ve el agua de debajo) con la franja de orilla segun donde haya
    tierra alrededor (47 piezas, contando la vacia).

La franja sale de las piezas rectas del set Wang (12 tierra arriba, 3 abajo, 10 izquierda, 5 derecha):
se mide donde acaba la tierra y que lineas son acantilado o arena, y se pinta por distancia a la tierra.

Salida: public/assets/img/blob/<set>.png (piezas de 32x32 en filas de 8) y src/ui/blobSets.ts.
Las laminas se pueden retocar a mano: el juego solo las coloca. (Si se vuelve a ejecutar, se rehacen.)
Uso: python3 tools/art/build_blob.py
"""
import math, os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(ROOT, '..', '..', 'public', 'assets', 'img')
OUT_TS = os.path.join(ROOT, '..', '..', 'src', 'ui', 'blobSets.ts')
SETS = ['ts_shallow_grass', 'ts_shallow_sand', 'ts_ice_snow']
T, R, COLS = 32, 5, 8
# Vecinos: bit -> (dx, dy)
N8 = {'N': (0, -1), 'E': (1, 0), 'S': (0, 1), 'W': (-1, 0), 'NE': (1, -1), 'SE': (1, 1), 'SW': (-1, 1), 'NW': (-1, -1)}
BIT = {'N': 1, 'E': 2, 'S': 4, 'W': 8, 'NE': 16, 'SE': 32, 'SW': 64, 'NW': 128}


def reduce_mask(m):
    """Una diagonal solo cuenta si sus dos lados no son tierra (si no, no cambia el dibujo)."""
    for d, (a, b) in {'NE': ('N', 'E'), 'SE': ('S', 'E'), 'SW': ('S', 'W'), 'NW': ('N', 'W')}.items():
        if m & BIT[a] or m & BIT[b]:
            m &= ~BIT[d]
    return m


def profile(piece, mean, side):
    """Lineas desde el lado de tierra: donde acaba la tierra (e) y donde empieza la orilla (start)."""
    def line(i):
        return {'T': piece[i, :], 'B': piece[T - 1 - i, :], 'L': piece[:, i], 'R': piece[:, T - 1 - i]}[side]
    e = T
    for i in range(T):
        if (line(i)[:, 3] > 0).sum() < T / 2:
            e = i
            break
    s0 = e - 1
    while s0 > 0 and e - s0 < 10 and np.abs(line(s0 - 1)[:, :3] - mean).sum(-1).mean() > 45:
        s0 -= 1
    start = max(0, min(s0, e - 3))
    return {'line': line, 'start': start, 'len': max(3, e - start)}


def render(land3, flat, profs, band, square_center=False):
    """Pinta la casilla central de un trozo de 3x3 casillas (land3[y][x] = tierra)."""
    S = 3 * T
    mask = np.zeros((S, S), bool)
    for cy in range(3):
        for cx in range(3):
            if not land3[cy][cx]:
                continue
            mask[cy * T:(cy + 1) * T, cx * T:(cx + 1) * T] = True
            if square_center and (cx, cy) == (1, 1):
                continue
            for dx, dy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
                def L(x, y):
                    return 0 <= x < 3 and 0 <= y < 3 and land3[y][x]
                if L(cx + dx, cy) or L(cx, cy + dy) or L(cx + dx, cy + dy):
                    continue
                for j in range(R):
                    for i in range(R):
                        if (R - i - 0.5) ** 2 + (R - j - 0.5) ** 2 > R * R:
                            px = cx * T + i if dx < 0 else cx * T + T - 1 - i
                            py = cy * T + j if dy < 0 else cy * T + T - 1 - j
                            mask[py, px] = False
    out = np.zeros((T, T, 4), np.uint8)
    ys, xs = np.nonzero(mask)
    for y in range(T):
        for x in range(T):
            px, py = T + x, T + y
            if mask[py, px]:
                out[y, x] = flat[y, x]
                continue
            dy = ys - py
            dx = xs - px
            d2 = dx * dx + dy * dy
            k = d2.argmin() if len(d2) else None
            if k is None or d2[k] > band * band:
                continue
            bx, by = dx[k], dy[k]
            p = profs[('T' if by < 0 else 'B') if abs(by) >= abs(bx) else ('L' if bx < 0 else 'R')]
            d = math.ceil(math.sqrt(d2[k]))
            if d > p['len']:
                continue
            along = x if p is profs['T'] or p is profs['B'] else y
            c = p['line'](p['start'] + d - 1)[along]
            if c[3]:
                out[y, x] = c
    return out


def main():
    os.makedirs(os.path.join(IMG, 'blob'), exist_ok=True)
    ts = ['// Generado por tools/art/build_blob.py. No editar a mano.',
          '/**',
          ' * Laminas de costa (blob): pieza para cada casilla segun sus vecinos de tierra.',
          ' * land[k]: casilla de tierra, k = esquinas redondeadas (bit 1 NW, 2 NE, 4 SW, 8 SE).',
          ' * water[m]: casilla de agua, m = vecinos de tierra (1 N, 2 E, 4 S, 8 W, 16 NE, 32 SE, 64 SW, 128 NW),',
          ' * con las diagonales quitadas cuando uno de sus lados ya es tierra. Sin entrada: nada que pintar.',
          ' */',
          'export const BLOB_SETS: Record<string, { land: number[]; water: Record<number, number> }> = {']
    for name in SETS:
        sheet = np.array(Image.open(os.path.join(IMG, 'wang', name + '.png')).convert('RGBA')).astype(int)
        piece = lambda k: sheet[:, k * T:(k + 1) * T]
        flat = piece(15)
        mean = flat[..., :3].reshape(-1, 3).mean(0)
        profs = {'T': profile(piece(12), mean, 'T'), 'B': profile(piece(3), mean, 'B'),
                 'L': profile(piece(10), mean, 'L'), 'R': profile(piece(5), mean, 'R')}
        band = max(p['len'] for p in profs.values())
        tiles, land_idx, water_idx = [], [], {}
        # Tierra: 16 combinaciones de esquinas redondeadas (0 = cuadrada).
        corner_cfg = {1: ('N', 'W', 'NW'), 2: ('N', 'E', 'NE'), 4: ('S', 'W', 'SW'), 8: ('S', 'E', 'SE')}
        for k in range(16):
            l3 = [[False] * 3 for _ in range(3)]
            l3[1][1] = True
            # Para no redondear una esquina, se pone tierra en su diagonal (asi su franja no cambia).
            for bit, (a, b, d) in corner_cfg.items():
                if not k & bit:
                    dx, dy = N8[d]
                    l3[1 + dy][1 + dx] = True
            land_idx.append(len(tiles))
            tiles.append(render(l3, flat, profs, band))
        # Agua: cada mascara reducida distinta.
        for m in range(256):
            r = reduce_mask(m)
            if r in water_idx or r == 0:
                continue
            l3 = [[False] * 3 for _ in range(3)]
            for n, (dx, dy) in N8.items():
                if r & BIT[n]:
                    l3[1 + dy][1 + dx] = True
            water_idx[r] = len(tiles)
            tiles.append(render(l3, flat, profs, band))
        rows = math.ceil(len(tiles) / COLS)
        img = Image.new('RGBA', (COLS * T, rows * T))
        for i, t in enumerate(tiles):
            img.paste(Image.fromarray(t), ((i % COLS) * T, (i // COLS) * T))
        img.save(os.path.join(IMG, 'blob', name + '.png'))
        water_ts = ', '.join(f'{k}: {v}' for k, v in sorted(water_idx.items()))
        ts.append(f'  {name}: {{ land: [{", ".join(map(str, land_idx))}], water: {{ {water_ts} }} }},')
        print(name, len(tiles), 'piezas', 'franja', band)
    ts.append('};')
    open(OUT_TS, 'w').write('\n'.join(ts) + '\n')


if __name__ == '__main__':
    main()
