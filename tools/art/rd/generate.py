"""Genera una imagen con Retro Diffusion a partir de un encargo en JSON (ver prompts.json y la skill
arte-retro-diffusion). CUESTA DINERO: sin --yes solo enseña el precio (gratis).

  python3 tools/art/rd/generate.py encargo.json            # precio estimado, no gasta
  python3 tools/art/rd/generate.py encargo.json --yes      # genera (paga) y guarda la imagen
  python3 tools/art/rd/generate.py --fetch <task_id> salida.png   # recoger un resultado ya pagado (gratis)
  python3 tools/art/rd/generate.py --history               # ultimos trabajos (gratis)

Encargo: {"prompt": "...", "prompt_style": "rd_pro__default", "width": 32, "height": 32,
          "input_image": "ruta.png" (opcional), "strength": 0.85, "reference_images": ["ruta.png", ...],
          "seed": 41, "out": "tools/art/retrodiffusion/inbox/Nombre.png"}
Las rutas son relativas a la raiz del repo. Antes y despues se mira el historial para no lanzar
dos veces lo mismo (si la respuesta se pierde, el trabajo puede haberse lanzado igual).
"""
import base64, json, os, sys, time, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rdclient import call  # noqa: E402

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))


def b64(path):
    return base64.b64encode(open(os.path.join(ROOT, path), 'rb').read()).decode()


def history(limit=5):
    return call('list_inference_jobs', {'limit': limit}).get('tasks', [])


def fetch(task_id, out):
    r = call('get_inference_result', {'request_id': task_id})
    url = (r.get('output_urls') or [None])[0]
    if not url:
        raise SystemExit(f'Sin imagen para {task_id}: {r}')
    path = os.path.join(ROOT, out)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'wb').write(urllib.request.urlopen(url, timeout=60).read())
    print('guardada', out)


def main():
    a = sys.argv[1:]
    if a and a[0] == '--history':
        for t in history(10):
            print(t.get('task_id'), t.get('status'), t.get('prompt_style'), (t.get('prompt') or '')[:70])
        return
    if a and a[0] == '--fetch':
        return fetch(a[1], a[2])
    spec = json.load(open(a[0]))
    out = spec.pop('out')
    args = dict(spec)
    for k in ('input_image',):
        if k in args:
            args[k] = b64(args[k])
    if 'reference_images' in args:
        args['reference_images'] = [b64(p) for p in args['reference_images']]
    est = call('estimate_inference_cost', {k: v for k, v in args.items() if k != 'seed' and k not in ('tile_x', 'tile_y', 'remove_bg', 'upload_outputs')})
    print('precio estimado:', est)
    if '--yes' not in a:
        print('No se ha generado nada. Con --yes se genera y se cobra.')
        return
    before = {t['task_id'] for t in history()}
    try:
        tid = call('start_inference_job', args)['task_id']
    except Exception as e:  # la respuesta se puede perder aunque el trabajo se haya lanzado
        time.sleep(8)
        new = [t for t in history() if t['task_id'] not in before]
        if not new:
            raise SystemExit(f'No se lanzo: {e}')
        tid = new[0]['task_id']
    print('trabajo', tid)
    r = {}
    for _ in range(70):
        try:
            r = call('get_inference_job', {'task_id': tid})
        except Exception:
            time.sleep(5)
            continue
        if r.get('status') in ('succeeded', 'failed'):
            break
        time.sleep(6)
    new = [t for t in history() if t['task_id'] not in before]
    print('estado', r.get('status'), '· saldo', (r.get('result') or {}).get('remaining_balance'), '· trabajos nuevos', len(new))
    if len(new) > 1:
        print('AVISO: se han lanzado', len(new), 'trabajos (se han cobrado todos). Decirselo al usuario.')
    if r.get('status') == 'succeeded':
        fetch(tid, out)
    else:
        print('Ha fallado (los fallos no se cobran):', r.get('error'))


if __name__ == '__main__':
    main()
