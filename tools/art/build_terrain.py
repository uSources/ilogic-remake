"""
Convierte los tilesets Wang de PixelLab (tools/art/pixellab/<set>.png + .json, ya retocados de color)
en recursos del juego:
  - public/assets/img/wang/<set>.png  (16 piezas de 32x32 en fila)
  - src/ui/wangSets.ts                 (que pieza va con cada combinacion de esquinas)
Las capas de encima (bosque, montaña...) se recortan: lo que es suelo de abajo queda transparente.
Uso: python3 tools/art/build_terrain.py
"""
import json, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'pixellab')
OUT_IMG = os.path.join(ROOT, '..', '..', 'public', 'assets', 'img', 'wang')
OUT_TS = os.path.join(ROOT, '..', '..', 'src', 'ui', 'wangSets.ts')
# Capas que van encima de otro suelo: se recortan contra su suelo de abajo.
OVERLAYS = {'ts_grass_forest', 'ts_grass_mountain', 'ts_snow_forest', 'ts_snow_mountain', 'ts_sand_mesa',
            # Las capas de suelo de encima tambien: si no, su parte de abajo tapa en cuadrado lo de debajo.
            'ts_shallow_grass', 'ts_shallow_sand', 'ts_ice_snow', 'ts_water_ice', 'ts_water_shallow2'}
TOL = {'ts_shallow_grass': 40, 'ts_shallow_sand': 40, 'ts_ice_snow': 30, 'ts_water_ice': 30, 'ts_water_shallow2': 30}
ORDER = ('NW', 'NE', 'SW', 'SE')

def cut(tile, base, tol=38, seeds=None):
    """Transparente lo que se parece al suelo de abajo (colores de la pieza lisa).
    Con `seeds` (esquinas que son suelo de abajo) solo se quita lo conectado a esas esquinas:
    asi no se agujerean las copas de los arboles con brillos del mismo verde."""
    a = np.asarray(tile, dtype=int); b = np.asarray(base, dtype=int)
    cols = np.unique(b[..., :3].reshape(-1, 3), axis=0)
    h, w = a.shape[:2]
    d = np.abs(a[..., :3].reshape(-1, 1, 3) - cols[None]).sum(-1).min(-1).reshape(h, w)
    like = d < tol
    if seeds is not None:
        mask = np.zeros_like(like)
        stack = [(y, x) for (y, x) in seeds if like[y, x]]
        while stack:
            y, x = stack.pop()
            if mask[y, x] or not like[y, x]:
                continue
            mask[y, x] = True
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < h and 0 <= nx < w and not mask[ny, nx]:
                    stack.append((ny, nx))
        like = mask
    out = a.copy()
    out[..., 3] = np.where(like, 0, a[..., 3])
    return Image.fromarray(out.astype(np.uint8), 'RGBA')

def main():
    os.makedirs(OUT_IMG, exist_ok=True)
    sets = sorted(f[:-5] for f in os.listdir(SRC) if f.endswith('.json'))
    ts = ['// Generado por tools/art/build_terrain.py. No editar a mano.',
          '/** Piezas Wang por set: indice de pieza (0-15, en fila) para cada combinacion de esquinas NW,NE,SW,SE (bit 8,4,2,1 = terreno de arriba). */',
          'export const WANG_SETS: Record<string, number[]> = {']
    for name in sets:
        info = json.load(open(os.path.join(SRC, name + '.json')))
        png = os.path.join(SRC, name + '.png')
        sheet = Image.open(png).convert('RGBA')
        tiles = info['tiles'] if 'tiles' in info else info['meta']['tileset_data']['tiles']
        row = Image.new('RGBA', (16 * 32, 32), (0, 0, 0, 0))
        idx = [0] * 16
        crops = {}
        for t in tiles:
            key = sum(8 >> i for i, k in enumerate(ORDER) if t['corners'][k] == 'upper')
            b = t['bounding_box']
            crops[key] = sheet.crop((b['x'], b['y'], b['x'] + b['width'], b['y'] + b['height']))
        if name in OVERLAYS:
            base = crops[0]
            def seeds(k):
                # Esquinas de suelo de abajo: bits 8 NW, 4 NE, 2 SW, 1 SE (y un poco hacia dentro).
                pts = []
                for bit, (cy, cx) in ((8, (0, 0)), (4, (0, 31)), (2, (31, 0)), (1, (31, 31))):
                    if not k & bit:
                        pts += [(cy, cx), (abs(cy - 2), abs(cx - 2)), (abs(cy - 1), cx), (cy, abs(cx - 1))]
                return pts
            crops = {k: cut(v, base, tol=TOL.get(name, 60), seeds=seeds(k)) for k, v in crops.items()}
        for k in range(16):
            row.alpha_composite(crops[k], (k * 32, 0))
            idx[k] = k
        row.save(os.path.join(OUT_IMG, name + '.png'))
        ts.append(f'  {name}: {json.dumps(idx)},')
    ts.append('};')
    # Primer plano para las unidades: una tira de copas de arbol o de rocas (con el borde de arriba
    # ondulado o quebrado) que tapa los pies de la unidad y la "mete" en el bosque o la montaña.
    import math, random
    FRONTS = {'ts_grass_forest': 'leaf', 'ts_snow_forest': 'leaf', 'ts_grass_mountain': 'rock', 'ts_snow_mountain': 'rock', 'ts_sand_mesa': 'rock'}
    for name, kind in FRONTS.items():
        png = os.path.join(SRC, name + '.png')
        if not os.path.exists(png): continue
        info = json.load(open(os.path.join(SRC, name + '.json')))
        sheet = Image.open(png).convert('RGBA')
        full = None
        for t in info['tiles']:
            if all(t['corners'][k] == 'upper' for k in ORDER):
                b = t['bounding_box']; full = sheet.crop((b['x'], b['y'], b['x'] + b['width'], b['y'] + b['height']))
        a = np.asarray(full).astype(int)
        lum = a[..., :3].sum(-1)
        dark = tuple(int(v * 0.55) for v in a.reshape(-1, 4)[lum.reshape(-1).argmin()][:3]) + (255,)
        H = 14
        r = random.Random(7)
        top = []
        for x in range(32):
            if kind == 'leaf':
                # Bultos redondos de 8 px.
                c = (x % 8) - 3.5
                top.append(int(round(c * c / 3.2)))
            else:
                top.append(None)
        if kind == 'rock':
            y = 3
            for x in range(32):
                if x % 5 == 0: y = max(0, min(6, y + r.choice((-2, -1, 1, 2))))
                top[x] = y
        out = Image.new('RGBA', (32, H), (0, 0, 0, 0)); px = out.load()
        for x in range(32):
            for y in range(H):
                if y < top[x]: continue
                c = tuple(a[32 - H + y, x])
                px[x, y] = dark if y == top[x] else (c[0], c[1], c[2], 255)
        out.save(os.path.join(OUT_IMG, 'front_' + name[3:] + '.png'))
    # Los decorados sueltos los hace tools/art/decor.py.
    open(OUT_TS, 'w').write('\n'.join(ts) + '\n')
    print(len(sets), 'sets')

main()
