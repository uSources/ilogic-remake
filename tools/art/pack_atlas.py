"""
Empaqueta todas las imagenes del juego (public/assets/img) en paginas de atlas de 2048x2048.
El juego carga 2-3 PNG en vez de cientos, y en la GPU todo sale de las mismas texturas.

Salida:
  public/assets/atlas/atlas-<n>.png   paginas
  public/assets/atlas/atlas-<n>.json  marcos en formato JSON Hash (el de Phaser/TexturePacker)
  src/atlasPages.ts                   numero de paginas, para el cargador

Las imagenes no se recortan ni se giran: cada marco mide lo mismo que su PNG, asi el codigo que
coloca piezas por coordenadas (laminas de costa, olas, niebla) funciona igual que con el PNG suelto.
Se deja un margen transparente entre marcos para que el filtrado no mezcle piezas vecinas.

Validacion: cada marco se compara pixel a pixel con su PNG original; si algo no cuadra, falla.
Uso: python3 tools/art/pack_atlas.py (lo llama npm run assets).
"""
import glob, json, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.normpath(os.path.join(ROOT, '..', '..', 'public', 'assets', 'img'))
OUT = os.path.normpath(os.path.join(ROOT, '..', '..', 'public', 'assets', 'atlas'))
OUT_TS = os.path.normpath(os.path.join(ROOT, '..', '..', 'src', 'atlasPages.ts'))
SIZE, PAD = 2048, 2
# Se quedan sueltas: el cursor del raton (lo usa el CSS) y el icono de la pestaña.
LOOSE = {'mouse'}


def load():
    items = []
    for f in sorted(glob.glob(os.path.join(IMG, '**', '*.png'), recursive=True)):
        key = os.path.relpath(f, IMG).replace(os.sep, '/')[:-4]
        if key in LOOSE:
            continue
        im = Image.open(f).convert('RGBA')
        if im.width > SIZE or im.height > SIZE:
            sys.exit(f'{key}: {im.size} no cabe en una pagina de {SIZE}')
        items.append((key, im))
    return items


def pack(items):
    """Estanterias: de mas alta a mas baja, de izquierda a derecha; pagina nueva cuando no cabe."""
    order = sorted(items, key=lambda it: (-it[1].height, -it[1].width, it[0]))
    pages, cur = [], None
    for key, im in order:
        w, h = im.width + PAD, im.height + PAD
        placed = False
        for page in pages:
            for shelf in page['shelves']:
                if h <= shelf['h'] and shelf['x'] + w <= SIZE:
                    page['frames'].append((key, im, shelf['x'], shelf['y']))
                    shelf['x'] += w
                    placed = True
                    break
            if placed:
                break
            if page['top'] + h <= SIZE:
                page['shelves'].append({'y': page['top'], 'h': h, 'x': w})
                page['frames'].append((key, im, 0, page['top']))
                page['top'] += h
                placed = True
                break
        if not placed:
            cur = {'shelves': [{'y': 0, 'h': h, 'x': w}], 'frames': [(key, im, 0, 0)], 'top': h}
            pages.append(cur)
    return pages


def main():
    os.makedirs(OUT, exist_ok=True)
    for old in glob.glob(os.path.join(OUT, 'atlas-*')):
        os.remove(old)
    items = load()
    pages = pack(items)
    seen = set()
    for n, page in enumerate(pages):
        used_h = max(y + im.height for _, im, _, y in page['frames'])
        used_w = max(x + im.width for _, im, x, _ in page['frames'])
        # Paginas en potencias de dos (lo mas compatible con la GPU), sin pasarse de lo necesario.
        pw = 1 << (used_w - 1).bit_length()
        ph = 1 << (used_h - 1).bit_length()
        sheet = Image.new('RGBA', (pw, ph))
        frames = {}
        for key, im, x, y in page['frames']:
            sheet.paste(im, (x, y))
            frames[key] = {'frame': {'x': x, 'y': y, 'w': im.width, 'h': im.height}, 'rotated': False, 'trimmed': False,
                           'spriteSourceSize': {'x': 0, 'y': 0, 'w': im.width, 'h': im.height},
                           'sourceSize': {'w': im.width, 'h': im.height}}
        name = f'atlas-{n}'
        sheet.save(os.path.join(OUT, name + '.png'), optimize=True)
        meta = {'image': name + '.png', 'format': 'RGBA8888', 'size': {'w': pw, 'h': ph}, 'scale': 1}
        json.dump({'frames': dict(sorted(frames.items())), 'meta': meta}, open(os.path.join(OUT, name + '.json'), 'w'),
                  separators=(',', ':'))
        # Validacion: cada marco es identico a su PNG y no pisa a ningun otro.
        arr = np.array(Image.open(os.path.join(OUT, name + '.png')).convert('RGBA'))
        owner = np.zeros(arr.shape[:2], bool)
        for key, im, x, y in page['frames']:
            src = np.array(im)
            got = arr[y:y + im.height, x:x + im.width]
            same = (got == src).all(-1) | ((got[..., 3] == 0) & (src[..., 3] == 0))
            if not same.all():
                sys.exit(f'{key}: el marco del atlas no coincide con el PNG')
            if owner[y:y + im.height, x:x + im.width].any():
                sys.exit(f'{key}: se solapa con otro marco')
            owner[y:y + im.height, x:x + im.width] = True
            seen.add(key)
        print(f'{name}: {pw}x{ph}, {len(frames)} marcos')
    missing = {k for k, _ in items} - seen
    if missing:
        sys.exit(f'Faltan en el atlas: {sorted(missing)}')
    open(OUT_TS, 'w').write(
        '// Generado por tools/art/pack_atlas.py. No editar a mano.\n'
        f'/** Paginas del atlas: public/assets/atlas/atlas-0..{len(pages) - 1}.png + .json */\n'
        f'export const ATLAS_PAGES = {len(pages)};\n'
        f'/** Imagenes que se cargan sueltas (no van en el atlas). */\n'
        f'export const LOOSE_IMAGES: readonly string[] = {json.dumps(sorted(LOOSE))};\n')


if __name__ == '__main__':
    main()
