import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SW_BUILD_LINE } from '../vite.config';

/** La PWA: manifest, iconos (npm run assets → tools/art/build_app_icons.py) y service worker. */
describe('PWA', () => {
  const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as {
    name: string;
    start_url: string;
    display: string;
    icons: { src: string; sizes: string; purpose: string }[];
  };

  it('el manifest tiene lo que piden los navegadores para instalar', () => {
    expect(manifest.name).toBe('Ilogic');
    expect(manifest.start_url).toBe('./');
    expect(manifest.display).toBe('fullscreen');
    for (const size of ['192x192', '512x512']) {
      for (const purpose of ['any', 'maskable']) {
        expect(manifest.icons.some((i) => i.sizes === size && i.purpose === purpose)).toBe(true);
      }
    }
  });

  it('cada icono existe y mide lo que dice', () => {
    const icons = [
      ...manifest.icons,
      { src: 'icons/apple-touch-icon.png', sizes: '180x180' },
      { src: 'icons/favicon-32.png', sizes: '32x32' },
      { src: 'icons/favicon-64.png', sizes: '64x64' },
    ];
    for (const icon of icons) {
      // Ancho y alto de la cabecera IHDR del PNG.
      const png = readFileSync(`public/${icon.src}`);
      expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.src).toBe(icon.sizes);
    }
  });

  it('index.html enlaza el manifest y los iconos', () => {
    const html = readFileSync('index.html', 'utf8');
    for (const href of [...html.matchAll(/<link rel="(?:icon|apple-touch-icon|manifest)"[^>]*href="([^"]+)"/g)].map((m) => m[1]!)) {
      expect(existsSync(`public/${href}`), href).toBe(true);
    }
    expect(html).toContain('rel="manifest"');
  });

  it('el service worker tiene la linea que cambia vite build', () => {
    expect(readFileSync('public/sw.js', 'utf8')).toContain(SW_BUILD_LINE);
  });
});
