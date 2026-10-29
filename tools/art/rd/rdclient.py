"""Cliente minimo del MCP de Retro Diffusion (https://mcp.retrodiffusion.ai/mcp) por HTTP.

La clave NUNCA va en el repositorio: se lee de la variable RD_API_KEY o del fichero que diga
RD_TOKEN_FILE (fuera del repo). Las herramientas gratis (estimar coste, historial, recoger un
resultado ya pagado) se pueden usar siempre; las de pago solo desde generate.py con --yes.
"""
import json, os, urllib.request

URL = 'https://mcp.retrodiffusion.ai/mcp'


def api_key() -> str:
    if os.environ.get('RD_API_KEY'):
        return os.environ['RD_API_KEY'].strip()
    path = os.environ.get('RD_TOKEN_FILE')
    if path and os.path.exists(path):
        return open(path).read().strip()
    raise SystemExit('Falta la clave de Retro Diffusion: RD_API_KEY=... o RD_TOKEN_FILE=/ruta/fuera/del/repo')


def _post(payload, sid=None):
    key = api_key()
    h = {'X-RD-Token': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json',
         'Accept': 'application/json, text/event-stream'}
    if sid:
        h['Mcp-Session-Id'] = sid
    req = urllib.request.Request(URL, data=json.dumps(payload).encode(), headers=h)
    with urllib.request.urlopen(req, timeout=300) as r:
        sid2 = r.headers.get('Mcp-Session-Id') or sid
        body = r.read().decode()
    msgs = []
    for line in body.splitlines():
        if line.startswith('data:'):
            try:
                msgs.append(json.loads(line[5:]))
            except ValueError:
                pass
    if not msgs and body.strip().startswith('{'):
        msgs.append(json.loads(body))
    return sid2, msgs


def call(tool: str, args: dict) -> dict:
    """Llama a una herramienta y devuelve su respuesta como JSON (o {'text': ...})."""
    sid, _ = _post({'jsonrpc': '2.0', 'id': 1, 'method': 'initialize',
                    'params': {'protocolVersion': '2025-11-25', 'capabilities': {}, 'clientInfo': {'name': 'ilogic', 'version': '1'}}})
    _post({'jsonrpc': '2.0', 'method': 'notifications/initialized'}, sid)
    _post({'jsonrpc': '2.0', 'id': 2, 'method': 'tools/call', 'params': {'name': 'authenticate', 'arguments': {'api_key': api_key()}}}, sid)
    _, msgs = _post({'jsonrpc': '2.0', 'id': 3, 'method': 'tools/call', 'params': {'name': tool, 'arguments': args}}, sid)
    for m in msgs:
        if m.get('id') == 3:
            if 'error' in m:
                raise RuntimeError(m['error'])
            txt = '\n'.join(c.get('text', '') for c in m.get('result', {}).get('content', []) if c.get('type') == 'text')
            try:
                return json.loads(txt)
            except ValueError:
                return {'text': txt}
    raise RuntimeError(f'Sin respuesta de {tool}')
