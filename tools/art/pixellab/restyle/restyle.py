from PIL import Image
import sys
exec(open('gen.py').read())
A='/home/claude/ilogic-ts/public/assets/img/'
def grid(names, out, cw=40, ch=50):
    s=Image.new('RGBA',(cw*len(names),ch),(0,0,0,0))
    for i,n in enumerate(names):
        im=Image.open(A+n).convert('RGBA'); s.alpha_composite(im,(i*cw+(cw-im.width)//2, ch-im.height-2))
    s.save(out); return s
M=['flat/mount_grass_0.png','flat/mount_grass_1.png','flat/mount_snow_0.png','flat/mount_snow_1.png','flat/mount_mesa_0.png','flat/mount_mesa_1.png']
B=['flat/bld_b_City.png','flat/bld_b_Factory.png','flat/bld_b_Airport.png','flat/bld_b_Oil.png','flat/bld_b_Stronghold.png','flat/bld_b_Base.png']
grid(M,'rs_m_init.png'); grid(B,'rs_b_init.png')
# palette: terrain tilesets + building colours
pal=Image.new('RGBA',(512,32*6))
for i,n in enumerate(['ts_grass_mountain','ts_snow_mountain','ts_sand_mesa','ts_grass_forest','ts_shallow_sand','ts_ice_snow']):
    pal.paste(Image.open(A+'wang/'+n+'.png').convert('RGBA'),(0,32*i))
pal.save('rs_pal_m.png')
pb=Image.new('RGBA',(512+240,32*3)); pb.paste(pal.crop((0,0,512,96)),(0,0)); pb.paste(Image.open('rs_b_init.png').resize((240,50)),(512,0)); pb.save('rs_pal_b.png')
if 'go' in sys.argv:
    common=dict(no_background=True, view="high top-down", outline="single color outline", shading="medium shading", detail="highly detailed", init_image_strength=(120 if sys.argv[2]=="m" else 95), text_guidance_scale=8)
    which=sys.argv[2]
    if which=='m':
        r,t=run('create_image_pixflux',dict(common, description="row of 6 separate rocky mountain map tiles for a colorful 16-bit top-down strategy game in 3/4 view, each a chunky textured rock peak with grassy base, lit from top left, pixel art like the terrain tileset: 2 green grassy mountains with grey rock peaks, 2 snowy mountains with white caps, 2 orange desert mesas with layered red-orange cliffs", init_image_base64=b64('rs_m_init.png'), color_image_base64=b64('rs_pal_m.png'), seed=7))
    else:
        r,t=run('create_image_pixflux',dict(common, description="row of 6 separate small military buildings for a colorful 16-bit top-down strategy game in 3/4 view, blue team roofs and flags, textured stone and brick walls, pixel art matching a lush terrain tileset: city houses, factory with chimney, airport hangar with control tower, oil pump derrick, stone fortress stronghold, headquarters base with big flag", init_image_base64=b64('rs_b_init.png'), color_image_base64=b64('rs_pal_b.png'), seed=11))
    import re
    m=re.search(r'[0-9a-f]{8}-[0-9a-f-]{27}',t)
    if m: wait(m.group(0),f'rs_{which}_out.png')
    elif images(r):
        open(f'rs_{which}_out.png','wb').write(base64.b64decode(images(r)[0]['data']))
