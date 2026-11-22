/**
 * Las piezas puras del servidor de Node: la configuracion por el entorno y que fichero del juego
 * corresponde a cada ruta (nunca uno de fuera de su carpeta).
 */
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ALLOWED_ORIGINS, DEFAULT_PORT, serverConfig } from '../src/config';
import { fileFor } from '../src/staticFiles';

const DEFAULTS = { dataDir: '/srv/ilogic/data', webDir: '/srv/ilogic/dist' };

describe('la configuracion del servidor de Node', () => {
  it('sin variables: el puerto de wrangler dev, las carpetas de siempre y las webs de wrangler.toml', () => {
    expect(serverConfig({}, DEFAULTS)).toEqual({
      ok: true,
      options: {
        port: DEFAULT_PORT,
        hostname: undefined,
        dataDir: DEFAULTS.dataDir,
        webDir: DEFAULTS.webDir,
        allowedOrigins: DEFAULT_ALLOWED_ORIGINS,
      },
    });
  });

  it('con variables: lo que digan; ILOGIC_WEB_DIR vacia es no servir el juego', () => {
    const read = serverConfig(
      { PORT: '3000', HOST: '127.0.0.1', ILOGIC_DATA_DIR: '/datos', ILOGIC_WEB_DIR: '', ALLOWED_ORIGINS: 'https://mi.web' },
      DEFAULTS,
    );
    expect(read).toEqual({
      ok: true,
      options: { port: 3000, hostname: '127.0.0.1', dataDir: '/datos', webDir: null, allowedOrigins: 'https://mi.web' },
    });
  });

  it('un puerto que no es un puerto se dice', () => {
    for (const port of ['ochenta', '70000', '80.5', '-1']) expect(serverConfig({ PORT: port }, DEFAULTS)).toMatchObject({ ok: false });
  });
});

describe('los ficheros del juego', () => {
  const root = '/srv/juego';

  it('cada ruta es su fichero; las que acaban en barra, su index.html', () => {
    expect(fileFor(root, '/')).toBe(join(root, 'index.html'));
    expect(fileFor(root, '/assets/main.js')).toBe(join(root, 'assets', 'main.js'));
    expect(fileFor(root, '/units3d.html')).toBe(join(root, 'units3d.html'));
    expect(fileFor(root, '/assets/')).toBe(join(root, 'assets', 'index.html'));
    expect(fileFor(root, '/con%20espacio.png')).toBe(join(root, 'con espacio.png'));
  });

  it('nada de fuera de la carpeta, tampoco con la ruta escondida', () => {
    for (const path of ['/../secreto', '/assets/../../secreto', '/..%2fsecreto', '/%2e%2e/secreto', '/../juego-otra/x', '/%E0%A4%A'])
      expect(fileFor(root, path)).toBeNull();
  });
});
