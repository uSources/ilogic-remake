/* global window */
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
 * Parte de pixeles distintos que se acepta. Con el reloj parado y el azar con semilla, en la misma maquina
 * cada captura sale igual pixel a pixel: el margen solo cubre el antialias (unos 100 pixeles). En otra
 * maquina (CI) cambian las fuentes y la GPU por software, y solo se ven los cambios grandes.
 */
const TOLERANCE = process.env.CI ? 0.06 : 0.0001;

const SEED = 2013;
const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

/** Cambia Math.random por un generador con semilla (mulberry32); se ejecuta en la pagina. */
function seedMathRandom(seed) {
  let state = seed;
  Math.random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MENU_READY = 'document.querySelector("button") !== null';
const GAME_READY = 'window.ilogic3d !== undefined';
const PLAYGROUND_READY = 'window.ilogicPlayground !== undefined';

// Lo que se hace en la pagina antes de la captura (corre en el navegador: sin await, que con el reloj
// parado una promesa que espere un temporizador no acabaria nunca).
/** Elige la primera unidad del jugador: se ven su alcance y por donde puede ir. */
const selectFirstUnit = () => {
  const { session, controls } = window.ilogic3d;
  const unit = session.state.units.find((candidate) => candidate.team === 0);
  void controls.tap({ x: unit.x, y: unit.y });
};
/** Lluvia: la luz del clima y las gotas. */
const rain = () => {
  window.ilogic3d.world.setWeather('Rain');
  window.ilogic3d.weather.set('Rain');
};

/**
 * Escenas: nombre, pagina, condicion (en el navegador) que dice que ya se ha cargado y, si hace falta,
 * que hacer antes de la captura (`act`) y el tamaño de la ventana (`viewport`, por defecto escritorio).
 */
const SCENES = [
  { name: 'menu', path: '/', ready: MENU_READY },
  { name: 'menu-movil', path: '/', ready: MENU_READY, viewport: PHONE },
  { name: 'partida-2013', path: '/?seed=2013', ready: GAME_READY },
  { name: 'partida-sin-elevacion', path: '/?seed=2013&elevation=0', ready: GAME_READY },
  { name: 'partida-unidad-elegida', path: '/?seed=2013', ready: GAME_READY, act: selectFirstUnit },
  { name: 'partida-lluvia', path: '/?seed=2013', ready: GAME_READY, act: rain },
  { name: 'partida-movil', path: '/?seed=2013', ready: GAME_READY, viewport: PHONE },
  { name: 'modelo-tanque', path: '/units3d.html?model=Tank', ready: PLAYGROUND_READY },
  { name: 'modelo-soldado', path: '/units3d.html?model=Soldier', ready: PLAYGROUND_READY },
];

/**
 * Espera a que la escena haya cargado. Primero deja que baje todo lo que pide la pagina (en tiempo real,
 * con su reloj parado); si aun no esta, avanza el reloj en pasos cortos y fijos (el menu, por ejemplo,
 * espera un temporizador para dejar la pantalla de carga) hasta que lo este.
 */
async function waitUntilReady(page, readyExpression) {
  for (let attempt = 0; attempt < 400; attempt++) {
    // La pagina puede recargarse al empezar una partida: se espera a que cargue de nuevo.
    await page.waitForLoadState('networkidle').catch(() => {});
    if (await page.evaluate(readyExpression).catch(() => false)) return;
    await page.clock.runFor(100).catch(() => {});
    await page.waitForTimeout(50);
  }
  throw new Error(`La escena no ha cargado: ${readyExpression}`);
}

/**
 * Deja correr unos segundos de animacion con el reloj falso: siempre los mismos, tarde lo que tarde la
 * carga, asi que la captura sale igual cada vez.
 */
async function animate(page) {
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
  const phone = scene.viewport === PHONE;
  const page = await browser.newPage({ viewport: scene.viewport ?? DESKTOP, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone });
  page.on('pageerror', (e) => errors.push(`${scene.name}: ${e.message}`));
  // Las peticiones a fuera de localhost se cortan a proposito (ERR_FAILED): no son un fallo.
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('ERR_FAILED') && errors.push(`${scene.name}: ${m.text()}`));
  // Sin red: las capturas no dependen de GitHub ni de fuentes externas.
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  // El azar de la vista (reposo de cada unidad, particulas, lluvia, polvo) sale de Math.random: con una
  // semilla fija, cada carga sale igual. Se pone antes de cada carga de la pagina (tambien al recargar).
  await page.addInitScript(seedMathRandom, SEED);
  await page.clock.install({ time: new Date('2026-01-01T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T12:00:01Z'));
  await page.goto(base + scene.path.slice(1));
  await waitUntilReady(page, scene.ready);
  if (scene.act) await page.evaluate(scene.act);
  await animate(page);
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
