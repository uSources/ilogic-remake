// Las piezas puras de build-single.mjs: meter el JavaScript, la hoja de estilos y los recursos en un
// solo HTML. Aparte del script para poder probarlas (tests/singleFile.test.ts) sin compilar el juego.
import ts from 'typescript';

/** El tipo de cada recurso que se incrusta, por su extension. */
export const ASSET_MIME_TYPES = { png: 'image/png', json: 'application/json', mp3: 'audio/mpeg' };

/** El tipo de un recurso, o null si no se incrusta (la musica solo en mp3: el ogg duplicaria el peso). */
export function assetMimeType(fileName) {
  const extension = fileName.slice(fileName.lastIndexOf('.') + 1);
  return Object.hasOwn(ASSET_MIME_TYPES, extension) ? ASSET_MIME_TYPES[extension] : null;
}

/**
 * Cambia la primera vez que sale `search` por `replacement`, tal cual. No usa `String.replace` con un
 * texto: ahi `$&`, `$$` o `` $` `` del reemplazo son patrones, y el JavaScript compilado los lleva
 * (`-$&` de Preact, `$$typeof`), asi que el juego salia roto.
 */
export function replaceOnce(text, search, replacement) {
  const at = text.indexOf(search);
  if (at < 0) throw new Error(`No encuentro ${JSON.stringify(search.slice(0, 60))}`);
  return text.slice(0, at) + replacement + text.slice(at + search.length);
}

/** Lo que cerraria la etiqueta <script> en la que va el codigo. */
const SCRIPT_CLOSE = /<\/script/gi;

/**
 * El JavaScript listo para ir dentro de `<script>`: `</script` lo cerraria, asi que pasa a `<\/script`,
 * que significa lo mismo dentro de un texto, una plantilla, una expresion regular o un comentario. Si
 * saliera en el codigo en si (`a </script/`), el cambio lo romperia: se comprueba que sigue siendo
 * JavaScript valido y, si no, falla aqui en vez de en el navegador.
 */
export function scriptSafe(js) {
  if (!SCRIPT_CLOSE.test(js)) return js;
  const escaped = js.replace(SCRIPT_CLOSE, (closing) => `<\\${closing.slice(1)}`);
  const problems = syntaxErrorsOf(escaped);
  if (problems.length > 0) throw new Error(`Al escapar </script el JavaScript deja de valer: ${problems[0]}`);
  return escaped;
}

/** Los errores de sintaxis de un modulo de JavaScript (los da el compilador de TypeScript, sin tipos). */
export function syntaxErrorsOf(js) {
  const output = ts.transpileModule(js, {
    reportDiagnostics: true,
    fileName: 'bundle.js',
    compilerOptions: { allowJs: true, target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
  });
  return (output.diagnostics ?? []).map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
}

/** Las secuencias que `String.replace` trataria como patrones: tienen que llegar tal cual al HTML. */
const REPLACEMENT_PATTERNS = ['$$', '$&', '$`', "$'"];

/** Cuantas veces sale cada patron de reemplazo en un texto. */
export function replacementPatternCounts(text) {
  return Object.fromEntries(REPLACEMENT_PATTERNS.map((pattern) => [pattern, text.split(pattern).length - 1]));
}

/** Falla si el HTML no lleva el JavaScript entero (con sus `$&`, `$$`...): el que va dentro de `<script>`. */
export function assertScriptKept(html, js) {
  if (!html.includes(js)) throw new Error('El HTML no lleva el JavaScript tal cual');
  const before = replacementPatternCounts(js);
  const after = replacementPatternCounts(html);
  const lost = REPLACEMENT_PATTERNS.filter((pattern) => after[pattern] < before[pattern]);
  if (lost.length > 0) throw new Error(`Se han perdido ${lost.join(', ')} del JavaScript`);
}

/** Las etiquetas de la PWA, que por file:// no sirven (el icono de la pestaña va incrustado aparte). */
const PWA_LINKS = [/\s*<link rel="(?:manifest|apple-touch-icon)"[^>]*>/g, /\s*<link rel="icon"[^>]*>/g];

/**
 * El HTML de un solo fichero: sin la etiqueta del script ni la de la hoja de estilos (van dentro), sin
 * lo de la PWA y con el icono, los recursos y el codigo incrustados.
 */
export function singleFileHtml({ html, scriptTag, styleTag, css, js, assets, favicon }) {
  const safeJs = scriptSafe(js);
  let page = replaceOnce(html, scriptTag, '');
  page = replaceOnce(page, styleTag, `<style>${css}</style>`);
  for (const link of PWA_LINKS) page = page.replace(link, () => '');
  page = replaceOnce(page, '</head>', `  <link rel="icon" type="image/png" href="${favicon}" />\n  </head>`);
  const scripts = `<script>window.__ILOGIC_ASSETS__=${JSON.stringify(assets)};</script>\n<script type="module">${safeJs}</script>\n`;
  page = replaceOnce(page, '</body>', `${scripts}</body>`);
  assertScriptKept(page, safeJs);
  return page;
}
