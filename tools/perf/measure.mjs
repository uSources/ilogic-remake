/* global window, performance, requestAnimationFrame */
// Medidas de la vista 3D en el navegador: cuanto tarda en cargar una partida, cuantos fotogramas por
// segundo da, cuantas llamadas de dibujo y triangulos manda a la GPU y cuanto pesan los modelos.
//
//   npm run perf              mide y compara con tools/perf/baseline.json (si existe)
//   npm run perf -- --save    guarda estas medidas como linea base
//
// Las cifras son de este ordenador y de su navegador (sin GPU en CI, el dibujo va por software): sirven
// para comparar antes y despues de un cambio aqui, no entre maquinas. Resultado en tools/perf/out/.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startDevServer } from '../browser/devServer.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const OUT = `${root}tools/perf/out/`;
const BASELINE = `${root}tools/perf/baseline.json`;
const save = process.argv.includes('--save');
const GAME_PATH = '/?seed=2013';
const SAMPLE_MS = 5000;

/** Todos los .glb de public/assets/models (en sus subcarpetas): lo que baja el navegador para la vista 3D. */
function glbFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return glbFiles(path);
    return entry.name.endsWith('.glb') ? [path] : [];
  });
}

function assetWeight() {
  const bytes = glbFiles(`${root}public/assets/models`).map((file) => statSync(file).size);
  return { models: bytes.length, modelBytes: bytes.reduce((a, b) => a + b, 0), biggestModelBytes: Math.max(0, ...bytes) };
}

/** Carga una partida y mide la carga y los fotogramas que da en unos segundos. */
async function measureGame(browser, base) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  const started = Date.now();
  await page.goto(base + GAME_PATH.slice(1));
  await page.waitForFunction(() => window.ilogic3d !== undefined, null, { timeout: 120000 });
  const loadMs = Date.now() - started;
  // Cuenta los fotogramas que pinta el navegador durante unos segundos, con el reloj real.
  const frames = await page.evaluate(
    (ms) =>
      new Promise((done) => {
        let count = 0;
        const t0 = performance.now();
        const tick = () => {
          count++;
          if (performance.now() - t0 < ms) requestAnimationFrame(tick);
          else done({ count, elapsed: performance.now() - t0 });
        };
        requestAnimationFrame(tick);
      }),
    SAMPLE_MS,
  );
  const info = await page.evaluate(() => {
    const { calls, triangles } = window.ilogic3d.world.renderer.info.render;
    const { geometries, textures } = window.ilogic3d.world.renderer.info.memory;
    return { calls, triangles, geometries, textures };
  });
  await page.close();
  return {
    loadMs,
    fps: Math.round((frames.count / frames.elapsed) * 1000 * 10) / 10,
    frameMs: Math.round((frames.elapsed / frames.count) * 10) / 10,
    drawCalls: info.calls,
    triangles: info.triangles,
    geometries: info.geometries,
    textures: info.textures,
  };
}

/** Diferencia con la linea base, en porcentaje (con signo). */
function compareWith(current, base) {
  const out = {};
  for (const key of Object.keys(current)) {
    if (typeof current[key] !== 'number' || typeof base?.[key] !== 'number' || base[key] === 0) continue;
    out[key] = Math.round(((current[key] - base[key]) / base[key]) * 1000) / 10;
  }
  return out;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const server = await startDevServer();
  const browser = await chromium.launch();
  let game;
  try {
    game = await measureGame(browser, server.url);
  } finally {
    await browser.close();
    server.stop();
  }
  const result = { game, assets: assetWeight(), measuredAt: new Date().toISOString() };
  writeFileSync(`${OUT}latest.json`, JSON.stringify(result, null, 2));
  if (save) writeFileSync(BASELINE, JSON.stringify(result, null, 2) + '\n');
  const base = !save && existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;
  if (save) console.log('Linea base guardada en tools/perf/baseline.json');

  console.log('\nVista 3D (partida 2013):');
  for (const [key, value] of Object.entries(game)) {
    const delta = base ? compareWith(game, base.game)[key] : undefined;
    const change = delta === undefined ? '' : `   (${delta > 0 ? '+' : ''}${delta} % frente a la linea base)`;
    console.log(`  ${key.padEnd(12)} ${value}${change}`);
  }
  console.log(
    `\nModelos: ${result.assets.models} ficheros, ${(result.assets.modelBytes / 1024).toFixed(0)} KB en total, el mayor ${(result.assets.biggestModelBytes / 1024).toFixed(0)} KB`,
  );
  if (!base && !save) console.log('\nNo hay linea base: npm run perf -- --save para guardarla.');
  console.log('\nCifras de este ordenador y navegador: comparar solo con la linea base de aqui.');
  console.log('Detalle: tools/perf/out/latest.json');
}

await main();
