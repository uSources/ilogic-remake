"""Unidades generadas una a una con Retro Diffusion (RD Pro, 32x32, sin reducir), neutras con el color
del bando en magenta y sobre fondo blanco. Aqui se quita el fondo (solo el blanco unido al borde, asi se
conservan cristales y brillos) y se sacan los bandos con team_key.recolor:
  u/b_<Nombre>.png azul, u/i_<Nombre>.png gris (ya ha movido), u/r_<Nombre>.png rojo mirando a la izquierda.
Entrada: tools/art/retrodiffusion/units32/<Nombre>.png. Las unidades que no esten ahi no se tocan."""
import glob, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

D = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, D)
from team_key import recolor  # noqa: E402

SRC = D + '/retrodiffusion/units32/'
OUT = D + '/../../public/assets/img/u/'
for f in sorted(glob.glob(SRC + '*.png')):
    name = os.path.basename(f)[:-4]
    a = np.array(Image.open(f).convert('RGBA'))
    white = a[..., :3].min(-1) > 235
    lab, _ = ndimage.label(white)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    a[np.isin(lab, list(border)), 3] = 0
    im = Image.fromarray(a)
    recolor(im, 'b').save(OUT + f'b_{name}.png')
    recolor(im, 'i').save(OUT + f'i_{name}.png')
    recolor(im, 'r').transpose(Image.FLIP_LEFT_RIGHT).save(OUT + f'r_{name}.png')
    print(name, im.size)
