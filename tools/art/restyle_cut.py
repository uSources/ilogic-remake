"""Corta las montañas y edificios repintados con PixelLab (img2img sobre los dibujos planos)
y genera las variantes de bando: azul tal cual, rojo por giro de tono, neutral en gris."""
from PIL import Image
import colorsys, os
D=os.path.dirname(__file__); S=D+'/pixellab/restyle/'; O=D+'/../../public/assets/img/flat/'
def cells(p):
    im=Image.open(p).convert('RGBA'); return [im.crop((i*40,0,i*40+40,48)) for i in range(6)]
for im,n in zip(cells(S+'rs_m_out.png'),['grass_0','grass_1','snow_0','snow_1','mesa_0','mesa_1']):
    im.save(O+f'mount_{n}.png')
def recolor(im, mode):
    out=im.copy(); px=out.load()
    for y in range(im.height):
        for x in range(im.width):
            r,g,b,a=px[x,y]
            if not a: continue
            h,s,v=colorsys.rgb_to_hsv(r/255,g/255,b/255)
            if 0.52<h<0.72 and s>0.3:
                if mode=='r': h=(h-0.6)%1.0; s=min(1,s*1.05)
                else: s*=0.12; v*=0.9
                r,g,b=[int(c*255) for c in colorsys.hsv_to_rgb(h,s,v)]
                px[x,y]=(r,g,b,a)
    return out
for im,n in zip(cells(S+'rs_b_out.png'),['City','Factory','Airport','Oil','Stronghold','Base']):
    im.save(O+f'bld_b_{n}.png'); im2=recolor(im,'r'); im2.save(O+f'bld_r_{n}.png')
    if n!='Base': recolor(im,'n').save(O+f'bld_n_{n}.png')
