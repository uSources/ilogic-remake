"""
Empaqueta todas las imagenes del juego (public/assets/img) en paginas de atlas de 2048x2048.
El juego carga 2-3 PNG en vez de cientos, y en la GPU todo sale de las mismas texturas.

Salida:
  public/assets/atlas/atlas-<n>.png   paginas
  public/assets/atlas/atlas-<n>.json  marcos en formato JSON Hash (el de Phaser/TexturePacker)
  src/atlasPages.ts                   numero de paginas, para el cargador

Las imagenes no se recortan ni se giran: cada marco mide lo mismo que su PNG, asi el codigo que
coloca piezas por coordenadas (laminas de costa, olas, niebla) funciona igual que con el PNG suelto.
Se colocan con MaxRects y se deja un margen transparente entre marcos para que el filtrado no mezcle piezas vecinas.

Validacion: cada marco se compara pixel a pixel con su PNG original; si algo no cuadra, falla.
Uso: python3 tools/art/pack_atlas.py (lo llama npm run assets).
"""
import glob, json, os, sys
import numpy as np
import oxipng
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.normpath(os.path.join(ROOT, '..', '..', 'public', 'assets', 'img'))
OUT = os.path.normpath(os.path.join(ROOT, '..', '..', 'public', 'assets', 'atlas'))
OUT_TS = os.path.normpath(os.path.join(ROOT, '..', '..', 'src', 'atlasPages.ts'))
SIZE, PAD = 2048, 2
# Se quedan sueltas: los punteros del raton (los usa el CSS; tools/art/icons/iconos.txt).
LOOSE = {'raton', 'raton_boton'}


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
    """MaxRects (rectpack): las piezas se colocan en el hueco que menos espacio deja libre."""
    import rectpack
    pk = rectpack.newPacker(mode=rectpack.PackingMode.Offline, pack_algo=rectpack.MaxRectsBssf,
                            sort_algo=rectpack.SORT_AREA, rotation=False)
    for i, (key, im) in enumerate(items):
        pk.add_rect(im.width + PAD, im.height + PAD, rid=i)
    for _ in range(len(items)):
        pk.add_bin(SIZE, SIZE)
    pk.pack()
    pages = []
    for b in pk:
        frames = [(items[r.rid][0], items[r.rid][1], r.x, r.y) for r in b]
        if frames:
            pages.append({'frames': sorted(frames, key=lambda f: f[0])})
    if sum(len(p['frames']) for p in pages) != len(items):
        sys.exit('El atlas no ha podido colocar todas las imagenes')
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
            # Sin recorte ni giro: a Phaser le basta con el rectangulo.
            frames[key] = {'frame': {'x': x, 'y': y, 'w': im.width, 'h': im.height}}
        name = f'atlas-{n}'
        path = os.path.join(OUT, name + '.png')
        sheet.save(path)
        # Compresion sin perdida (mismo resultado pixel a pixel, PNG mas pequeño).
        oxipng.optimize(path, level=2, strip=oxipng.StripChunks.safe())
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
