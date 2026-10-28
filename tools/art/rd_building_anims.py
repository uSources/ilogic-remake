"""Animaciones de edificios hechas con Retro Diffusion sobre la version NEUTRAL (gris) de cada edificio,
y pasadas a los tres bandos por codigo (una sola generacion por edificio).

Entradas (tools/art/retrodiffusion/anims/): an_<Nombre>.png (8 fotogramas de 64x64, 4x2) y
an_<Nombre>_in.png (el edificio neutral quieto en un lienzo de 64x64: x=16, base en y=58).
Salida: public/assets/img/flat/anim_{b|r|n}_<Nombre>.png, fotogramas de 64x64 en fila.

Modos:
  overlay: solo cambian luces; lo que cambia se pega encima del edificio de cada bando.
  full:    se mueve el propio dibujo; se recolorea el fotograma entero (gris -> bando).
"""
import os, sys
import numpy as np
from PIL import Image

D = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, D)
from rd_buildings_colors import recolor  # noqa: E402

SRC = D + '/retrodiffusion/anims/'
FLAT = D + '/../../public/assets/img/flat/'
TEAM_LIGHT = {'b': (58, 168, 255), 'r': (255, 77, 69), 'n': None}
# nombre: (modo, fotogramas, solo dentro del edificio)
SPEC = {
    'Stronghold': ('overlay', list(range(8)), True),
    'City': ('overlay', list(range(8)), True),
    'Airport': ('overlay', list(range(8)), False),
    # La refineria se anima aparte (oil_pump.py): RD no sabia hacer el balancin.
    'Base': ('full', list(range(1, 8)), False),
}


def pad(im):
    cv = Image.new('RGBA', (64, 64))
    cv.alpha_composite(im, (16, 58 - im.height))
    return np.array(cv).astype(int)


def team_sprite(name, t):
    if name == 'Base' and t == 'n':
        return recolor(Image.open(FLAT + 'bld_b_Base.png').convert('RGBA'), 'n')
    return Image.open(FLAT + f'bld_{t}_{name}.png').convert('RGBA')


def color_map(neutral, team):
    """Tabla color neutral -> color de bando, sacada de los dos dibujos quietos (mismo pixel)."""
    m = {}
    for a, b in zip(neutral.reshape(-1, 4), team.reshape(-1, 4)):
        if a[3] and b[3]:
            m.setdefault(tuple(a[:3]), {}).setdefault(tuple(b[:3]), 0)
            m[tuple(a[:3])][tuple(b[:3])] += 1
    keys = np.array(list(m.keys()))
    vals = np.array([max(v, key=v.get) for v in m.values()])
    return keys, vals


def remap(px, keys, vals, tol=30):
    out = px.copy()
    rgb = px[..., :3].reshape(-1, 3)
    d = np.abs(rgb[:, None, :] - keys[None]).sum(-1)
    j = d.argmin(1)
    ok = (d.min(1) <= tol) & (px[..., 3].reshape(-1) > 0)
    flat = out[..., :3].reshape(-1, 3)
    flat[ok] = vals[j[ok]]
    out[..., :3] = flat.reshape(px.shape[:2] + (3,))
    return out


for name, (mode, order, inside_only) in SPEC.items():
    sheet = Image.open(SRC + f'an_{name}.png').convert('RGBA')
    frames = [np.array(sheet.crop(((i % 4) * 64, (i // 4) * 64, (i % 4) * 64 + 64, (i // 4) * 64 + 64))).astype(int) for i in range(8)]
    base_n = np.array(Image.open(SRC + f'an_{name}_in.png').convert('RGBA')).astype(int)
    mask = base_n[..., 3] > 0
    for t in 'brn':
        if name == 'Base' and t == 'n':
            continue  # la Base no tiene version neutral en partida
        static = pad(team_sprite(name, t))
        keys, vals = color_map(base_n, static)
        row = Image.new('RGBA', (64 * len(order), 64))
        for k, i in enumerate(order):
            f = frames[i]
            if mode == 'overlay':
                diff = (np.abs(f[..., :3] - base_n[..., :3]).sum(-1) > 50) & (f[..., 3] > 0)
                if inside_only:
                    diff &= mask
                out = static.copy()
                rec = remap(f, keys, vals)
                out[diff] = rec[diff]
            else:
                out = remap(f, keys, vals)
                if TEAM_LIGHT[t]:
                    # Tela de la bandera (clara y fuera del dibujo quieto) con el color del bando.
                    rgb = out[..., :3]
                    lum = rgb.mean(-1)
                    sat = rgb.max(-1) - rgb.min(-1)
                    flag = (~mask) & (out[..., 3] > 0) & (lum > 150) & (sat < 40)
                    shade = np.clip(lum[flag] / 255, 0.6, 1.0)[:, None]
                    out[flag, :3] = (np.array(TEAM_LIGHT[t])[None] * shade).astype(int)
            row.paste(Image.fromarray(out.astype(np.uint8)), (k * 64, 0))
        row.save(FLAT + f'anim_{t}_{name}.png')
    print(name, len(order), 'fotogramas')
