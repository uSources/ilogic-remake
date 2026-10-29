"""Ajusta los sprites de terreno y edificios a la regla de Advance Wars:
  - nunca mas anchos que la casilla (32 px): si se pasan, se reducen enteros (sin deformar)
    con el K-Centroid de Retro Diffusion, que respeta el pixel art;
  - como mucho 1,5 casillas de alto (48 px): pueden asomar por arriba, nunca por los lados;
  - apoyados en el borde de abajo de su casilla.
Se ejecuta despues de rd_terrain.py y rd_buildings.py. Las reducciones se guardan en
tools/art/retrodiffusion/fit/ para no volver a pedirlas (y no volver a pagarlas).
La reduccion necesita la clave de Retro Diffusion en RD_TOKEN_FILE (fuera del repositorio).
"""
import base64, glob, json, os, sys, urllib.request
import numpy as np
from PIL import Image

D = os.path.dirname(os.path.abspath(__file__))
FLAT = D + '/../../public/assets/img/flat/'
CACHE = D + '/retrodiffusion/fit/'
TILE, MAX_H = 32, 48
os.makedirs(CACHE, exist_ok=True)
sys.path.insert(0, D)


def trim(im):
    a = np.array(im)[..., 3] > 0
    ys, xs = np.where(a)
    return im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def _mcp(tok, name, args):
    """Llamada minima al MCP de Retro Diffusion (HTTP)."""
    url = 'https://mcp.retrodiffusion.ai/mcp'
    def post(payload, sid=None):
        h = {'X-RD-Token': tok, 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream'}
        if sid:
            h['Mcp-Session-Id'] = sid
        with urllib.request.urlopen(urllib.request.Request(url, data=json.dumps(payload).encode(), headers=h), timeout=180) as r:
            sid2, body = r.headers.get('Mcp-Session-Id') or sid, r.read().decode()
        msgs = [json.loads(l[5:]) for l in body.splitlines() if l.startswith('data:')] or ([json.loads(body)] if body.strip().startswith('{') else [])
        return sid2, msgs
    sid, _ = post({'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {'protocolVersion': '2025-11-25', 'capabilities': {}, 'clientInfo': {'name': 'ilogic', 'version': '1'}}})
    post({'jsonrpc': '2.0', 'method': 'notifications/initialized'}, sid)
    _, msgs = post({'jsonrpc': '2.0', 'id': 2, 'method': 'tools/call', 'params': {'name': name, 'arguments': args}}, sid)
    txt = ''.join(c.get('text', '') for m in msgs if m.get('id') == 2 for c in m['result']['content'])
    return json.loads(txt)


def rd_downscale(im, w, h, name):
    path = CACHE + f'{name}_{w}x{h}.png'
    if os.path.exists(path):
        return Image.open(path).convert('RGBA')
    tok = open(os.environ['RD_TOKEN_FILE']).read().strip()
    import io
    buf = io.BytesIO()
    im.save(buf, 'PNG')
    args = {'tool_id': 'k_centroid_downscale', 'input_image': base64.b64encode(buf.getvalue()).decode(), 'width': w, 'height': h}
    d = _mcp(tok, 'run_edit_tool', args)
    if d.get('base64_images'):
        data = base64.b64decode(d['base64_images'][0].split(',')[-1])
    else:
        data = urllib.request.urlopen(d['output_urls'][0], timeout=60).read()
    out = Image.open(io.BytesIO(data)).convert('RGBA')
    out.save(path)
    return out


def fit(im, name):
    im = trim(im)
    s = min(1.0, TILE / im.width, MAX_H / im.height)
    if s < 1:
        w, h = max(1, round(im.width * s)), max(1, round(im.height * s))
        small = rd_downscale(im, w, h, name)
        # K-Centroid devuelve el fondo opaco: la transparencia sale de reducir la del original.
        alpha = im.split()[3].resize((w, h), Image.BOX).point(lambda v: 255 if v > 110 else 0)
        small.putalpha(alpha)
        im = trim(small)
    cv = Image.new('RGBA', (TILE, im.height))
    cv.alpha_composite(im, ((TILE - im.width) // 2, 0))
    return cv


def front(cv, H=14):
    """Franja de abajo de la casilla, para tapar los pies de la unidad."""
    tile = Image.new('RGBA', (TILE, TILE))
    tile.alpha_composite(cv, (0, TILE - cv.height) if cv.height <= TILE else (0, 0), (0, max(0, cv.height - TILE)))
    return tile.crop((0, TILE - H, TILE, TILE))


if __name__ == '__main__':
    for f in sorted(glob.glob(FLAT + 'mount_*.png') + glob.glob(FLAT + 'tree_*.png')):
        n = os.path.basename(f)[:-4]
        cv = fit(Image.open(f).convert('RGBA'), n)
        cv.save(f)
        front(cv).save(FLAT + 'front_' + n + '.png')
        print(n, cv.size)
    # Los edificios ya se generan a su tamaño (rd_buildings32.py): aqui no se tocan.
