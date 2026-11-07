import { describe, expect, it } from 'vitest';
import { assetMimeType, replaceOnce, replacementPatternCounts, scriptSafe, singleFileHtml } from '../scripts/singleFile.mjs';

/** Un JavaScript con todo lo que `String.replace` trataria como patron (como el de Preact: `-$&`, `$$typeof`). */
const TRICKY_JS = [
  'const kebab = (name) => name.replace(/[A-Z]/g, "-$&").toLowerCase();',
  'const element = { $$typeof: Symbol.for("preact.element") };',
  'const quoted = "$`" + "$\'" + `${kebab("aB")}`;',
  'const closing = "</script>" + /<\\/script>/.source;',
].join('\n');

const PAGE = [
  '<html><head>',
  '<link rel="manifest" href="./manifest.webmanifest">',
  '<link rel="icon" href="./icons/favicon-64.png">',
  '<script type="module" crossorigin src="./assets/index.js"></script>',
  '<link rel="stylesheet" crossorigin href="./assets/index.css">',
  '</head><body><div id="app"></div></body></html>',
].join('\n');

const build = (js: string): string =>
  singleFileHtml({
    html: PAGE,
    scriptTag: '<script type="module" crossorigin src="./assets/index.js"></script>',
    styleTag: '<link rel="stylesheet" crossorigin href="./assets/index.css">',
    css: 'body{color:red}',
    js,
    assets: { 'assets/a.png': 'data:image/png;base64,AA==' },
    favicon: 'data:image/png;base64,BB==',
  });

describe('el juego en un solo HTML (scripts/singleFile.mjs)', () => {
  it("lleva el JavaScript tal cual: $&, $$, $` y $' no se tratan como patrones", () => {
    const html = build(TRICKY_JS);
    expect(replacementPatternCounts(html)).toEqual(replacementPatternCounts(TRICKY_JS));
    expect(html).toContain('"-$&"');
    expect(html).toContain('$$typeof');
  });

  it('no deja nada que cierre su <script> antes de tiempo', () => {
    const html = build(TRICKY_JS);
    const script = html.slice(html.indexOf('<script type="module">'));
    expect(script.match(/<\/script/gi)).toHaveLength(1);
  });

  it('falla en vez de romper el codigo si </script sale fuera de un texto', () => {
    expect(() => scriptSafe('const a = 1, script = 2; const b = a </script/ 3;')).toThrow(/deja de valer/);
    expect(scriptSafe('const a = "</script>";')).toBe('const a = "<\\/script>";');
  });

  it('quita lo de la PWA y mete el icono, la hoja de estilos y los recursos', () => {
    const html = build('console.log(1);');
    expect(html).not.toContain('manifest');
    expect(html).not.toContain('./assets/index');
    expect(html).toContain('<style>body{color:red}</style>');
    expect(html).toContain('href="data:image/png;base64,BB=="');
    expect(html).toContain('"assets/a.png":"data:image/png;base64,AA=="');
  });

  it('cambia el texto que se pide, una vez, y falla si no esta', () => {
    expect(replaceOnce('a $& a', 'a', '$&')).toBe('$& $& a');
    expect(() => replaceOnce('abc', 'x', 'y')).toThrow();
  });

  it('incrusta cada recurso con su tipo y solo los que tienen uno', () => {
    expect(assetMimeType('atlas/page0.png')).toBe('image/png');
    expect(assetMimeType('atlas.json')).toBe('application/json');
    expect(assetMimeType('music/theme.mp3')).toBe('audio/mpeg');
    expect(assetMimeType('music/theme.ogg')).toBeNull();
  });
});
