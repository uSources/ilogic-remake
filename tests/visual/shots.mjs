// Capturas de la vista 3D: abre escenas fijas en el navegador (con el reloj falso de Playwright, para
// que salgan iguales cada vez), las compara con las guardadas en tests/visual/ref/ y deja un informe.
//
//   npm run shots           captura y compara (falla si algo cambia de mas)
//   npm run shots:update    guarda las capturas actuales como nuevas referencias
//   node tests/visual/shots.mjs [--update] [--only=nombre,...]
//
// Resultado en tests/visual/out/: <nombre>.png (ahora), <nombre>.diff.png (en rojo lo distinto) e
// index.html con todo junto. Para ver un cambio, abrir index.html o mirar los .diff.png.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pixelmatch from 'pixelmatch';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { startDevServer } from '../../tools/browser/devServer.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const REF = `${root}tests/visual/ref/`;
const OUT = `${root}tests/visual/out/`;
const update = process.argv.includes('--update');
const only = process.argv
  .find((a) => a.startsWith('--only='))
  ?.slice(7)
  .split(',');

/**
 * Parte de pixeles distintos que se acepta. Los menus salen iguales; las escenas con animacion (unidades
 * que respiran, polvo, agua) cambian 0,2-2 % de pixeles en los bordes entre ejecuciones, asi que el umbral
 * solo avisa de cambios grandes (un modelo nuevo, un color distinto). Lo pequeño se mira en el informe.
 */
const TOLERANCE = process.env.CI ? 0.06 : 0.03;

/** Escenas: nombre, pagina, y la condicion (en el navegador) que dice que ya se ha cargado. */
const SCENES = [
  { name: 'menu', path: '/', ready: 'document.querySelector("button") !== null' },
  { name: 'partida-2013', path: '/?seed=2013', ready: 'window.ilogic3d !== undefined' },
  { name: 'partida-sin-elevacion', path: '/?seed=2013&elevation=0', ready: 'window.ilogic3d !== undefined' },
  { name: 'modelo-tanque', path: '/units3d.html?model=Tank', ready: 'window.ilogicPlayground !== undefined' },
  { name: 'modelo-soldado', path: '/units3d.html?model=Soldier', ready: 'window.ilogicPlayground !== undefined' },
];

/**
 * Espera a que la escena cargue (en tiempo real) con el reloj parado, y luego deja correr unos segundos
 * de animacion. Asi el tiempo que tarda la carga no cambia la captura.
 */
async function settle(page, readyExpression) {
  for (let attempt = 0; attempt < 400; attempt++) {
    // La pagina puede recargarse al empezar una partida: se espera a que cargue de nuevo.
    if (await page.evaluate(readyExpression).catch(() => false)) break;
    await page.waitForLoadState('load').catch(() => {});
    await page.waitForTimeout(50);
  }
  await page.clock.runFor(3000);
  await page.waitForTimeout(300);
}

function compare(name, actual) {
  const refPath = `${REF}${name}.png`;
  if (update || !existsSync(refPath)) {
    writeFileSync(refPath, actual);
    return { name, status: update ? 'updated' : 'new', ratio: 0 };
  }
  const a = PNG.sync.read(actual);
  const b = PNG.sync.read(readFileSync(refPath));
  if (a.width !== b.width || a.height !== b.height) return { name, status: 'size', ratio: 1 };
  const diff = new PNG({ width: a.width, height: a.height });
  const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
  const ratio = n / (a.width * a.height);
  writeFileSync(`${OUT}${name}.diff.png`, PNG.sync.write(diff));
  return { name, status: ratio > TOLERANCE ? 'changed' : 'same', ratio };
}

async function captureScene(browser, base, scene, errors) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => errors.push(`${scene.name}: ${e.message}`));
  // Las peticiones a fuera de localhost se cortan a proposito (ERR_FAILED): no son un fallo.
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('ERR_FAILED') && errors.push(`${scene.name}: ${m.text()}`));
  // Sin red: las capturas no dependen de GitHub ni de fuentes externas.
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await page.clock.install({ time: new Date('2026-01-01T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T12:00:01Z'));
  await page.goto(base + scene.path.slice(1));
  await settle(page, scene.ready);
  const png = await page.screenshot();
  await page.close();
  return png;
}

async function main() {
  mkdirSync(REF, { recursive: true });
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const server = await startDevServer();
  const browser = await chromium.launch();
  const results = [];
  const errors = [];
  try {
    for (const scene of SCENES) {
      if (only && !only.includes(scene.name)) continue;
      const png = await captureScene(browser, server.url, scene, errors);
      writeFileSync(`${OUT}${scene.name}.png`, png);
      results.push(compare(scene.name, png));
    }
  } finally {
    await browser.close();
    server.stop();
  }

  const rows = results
    .map(
      (r) =>
        `<tr><td>${r.name}</td><td class="${r.status}">${r.status} ${(r.ratio * 100).toFixed(2)} %</td>` +
        `<td><img src="${r.name}.png"></td><td><img src="../ref/${r.name}.png"></td>` +
        `<td>${existsSync(`${OUT}${r.name}.diff.png`) ? `<img src="${r.name}.diff.png">` : ''}</td></tr>`,
    )
    .join('\n');
  writeFileSync(
    `${OUT}index.html`,
    `<!doctype html><meta charset="utf-8"><title>Capturas</title><style>body{font:14px sans-serif;background:#111;color:#eee}
img{width:420px}td{vertical-align:top;padding:4px}.changed,.size{color:#f66}.same{color:#6f6}</style>
<table><tr><th>escena</th><th>estado</th><th>ahora</th><th>referencia</th><th>diferencias</th></tr>${rows}</table>`,
  );
  for (const r of results) console.log(`${r.status.padEnd(8)} ${r.name} (${(r.ratio * 100).toFixed(2)} % distinto)`);
  if (errors.length) console.log(`\nErrores en la pagina:\n${errors.join('\n')}`);
  console.log('\nInforme: tests/visual/out/index.html');
  const bad = results.filter((r) => r.status === 'changed' || r.status === 'size');
  if (bad.length || errors.length) {
    console.log(`\n${bad.length} captura(s) distinta(s). Si el cambio es a proposito: npm run shots:update`);
    process.exit(1);
  }
}

await main();
