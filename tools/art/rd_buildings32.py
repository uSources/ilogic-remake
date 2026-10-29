"""Edificios generados uno a uno con Retro Diffusion (RD Pro, 32x48, sin reducir), neutros con el color
del bando en magenta y sobre fondo blanco. Se quita el fondo (blanco unido al borde) y se sacan los bandos
con team_key.recolor: flat/bld_b_<Nombre> azul, flat/bld_r_<Nombre> rojo, flat/bld_n_<Nombre> gris (neutral).
El cuartel general (Base) no tiene version neutral. Entrada: tools/art/retrodiffusion/buildings32/<Nombre>.png."""
import glob, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

D = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, D)
from team_key import recolor  # noqa: E402
from fit_tile import trim  # noqa: E402

SRC = D + '/retrodiffusion/buildings32/'
OUT = D + '/../../public/assets/img/flat/'
for f in sorted(glob.glob(SRC + '*.png')):
    name = os.path.basename(f)[:-4]
    a = np.array(Image.open(f).convert('RGBA'))
    white = a[..., :3].min(-1) > 235
    lab, _ = ndimage.label(white)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    a[np.isin(lab, list(border)), 3] = 0
    spr = trim(Image.fromarray(a))
    cv = Image.new('RGBA', (32, spr.height))
    cv.alpha_composite(spr, ((32 - spr.width) // 2, 0))
    recolor(cv, 'b').save(OUT + f'bld_b_{name}.png')
    recolor(cv, 'r').save(OUT + f'bld_r_{name}.png')
    if name != 'Base':
        recolor(cv, 'i').save(OUT + f'bld_n_{name}.png')
    print(name, cv.size)
