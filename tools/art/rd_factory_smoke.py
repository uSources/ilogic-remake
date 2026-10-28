"""Humo de la fabrica a partir de la animacion de Retro Diffusion (subtle_motion, 8 fotogramas de 64x64).
- Se queda solo con lo que cambia respecto al edificio quieto (humo y luces).
- El humo se pasa a una gama de grises por brillo (sale igual en los tres bandos).
- La bocanada de RD empieza y acaba; para que el bucle no salte, cada fotograma suma la
  secuencia desfasada medio ciclo (siempre hay humo saliendo).
Salida: public/assets/img/flat/fx_Factory.png (8 fotogramas de 64x64 en fila).
En el fotograma, la fabrica esta en x=16 y su base en y=58."""
import os
import numpy as np
from PIL import Image

D = os.path.dirname(os.path.abspath(__file__))
SRC = D + '/retrodiffusion/'
sheet = Image.open(SRC + 'factory_anim_raw.png').convert('RGBA')
base = np.array(Image.open(SRC + 'factory_anim_in.png').convert('RGBA')).astype(int)
N = 8
frames = [np.array(sheet.crop(((i % 4) * 64, (i // 4) * 64, (i % 4) * 64 + 64, (i // 4) * 64 + 64))).astype(int) for i in range(N)]
RAMP = np.array([[0x5a, 0x63, 0x6c], [0x9a, 0xa3, 0xab], [0xcf, 0xd6, 0xdc], [0xf4, 0xf6, 0xf8]])


def smoke(f):
    out = np.zeros_like(f)
    inside = base[..., 3] > 0
    diff = np.abs(f[..., :3] - base[..., :3]).sum(-1)
    keep = (f[..., 3] > 0) & (~inside | (diff > 60))
    lum = (f[..., :3] * [0.3, 0.59, 0.11]).sum(-1)
    idx = np.clip(((lum - 60) / 195 * 4).astype(int), 0, 3)
    out[keep, :3] = RAMP[idx[keep]]
    out[keep, 3] = 255
    return out


layers = [smoke(f) for f in frames]
row = Image.new('RGBA', (64 * N, 64))
for i in range(N):
    a = layers[i].copy()
    b = layers[(i + N // 2) % N]
    m = (a[..., 3] == 0) & (b[..., 3] > 0)
    a[m] = b[m]
    row.paste(Image.fromarray(a.astype(np.uint8)), (i * 64, 0))
row.save(D + '/../../public/assets/img/flat/fx_Factory.png')
print('ok')
