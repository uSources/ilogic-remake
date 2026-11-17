/* global window, document, performance, requestAnimationFrame */
// Medidas de la vista 3D en el navegador: cuanto tarda en cargar una partida, cuanto tarda cada
// fotograma (mediana y el 5 % peor), cuantas llamadas de dibujo y triangulos manda a la GPU y cuanto
// pesan los modelos. Con lluvia tambien, porque las particulas del clima son lo que mas cuesta.
//
//   npm run perf              mide y compara con tools/perf/baseline.json (si existe)
//   npm run perf -- --save    guarda estas medidas como linea base
//   npm run perf -- --check   ademas falla si algo ha empeorado de mas (ver LIMITS)
//
// Usa la GPU de la maquina si la hay (Chromium completo, sin ventana); si no, el dibujo va por software
// y los tiempos son mucho peores. Por eso solo se compara con una linea base de la misma GPU: el
// informe dice cual es. Resultado en tools/perf/out/latest.json.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startDevServer } from '../browser/devServer.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const OUT = `${root}tools/perf/out/`;
const BASELINE = `${root}tools/perf/baseline.json`;
const save = process.argv.includes('--save');
const check = process.argv.includes('--check');
const SAMPLE_MS = 5000;
/** Lo que se tarda en cuenta antes de medir: la luz del clima se funde y las particulas aparecen. */
const WARMUP_MS = 1500;

/** Escenas que se miden: la partida de siempre, en calma y con lluvia. */
const SCENARIOS = [
  { name: 'partida', path: '/?seed=2013' },
  { name: 'partida-lluvia', path: '/?seed=2013', weather: 'Rain' },
];

/**
 * Cuanto puede empeorar cada medida frente a la linea base antes de que `--check` falle (en tanto por
 * uno). Lo que se cuenta (llamadas, triangulos...) es exacto; los tiempos varian de una vez a otra.
 */
const LIMITS = { drawCalls: 0.1, triangles: 0.1, geometries: 0.1, textures: 0.1, frameP95Ms: 0.3, loadMs: 0.5 };

/**
 * Sin el limite de la pantalla (60 fotogramas por segundo), para que el tiempo de cada fotograma sea lo
 * que de verdad cuesta dibujarlo y no lo que se espera al refresco.
 */
const UNCAPPED = ['--disable-gpu-vsync', '--disable-frame-rate-limit'];

/** Abre Chromium con la GPU de la maquina; si no se puede (sin Chromium completo), el de siempre. */
async function launchWithGpu() {
  try {
    return await chromium.launch({ channel: 'chromium', args: UNCAPPED });
  } catch {
    return chromium.launch({ args: UNCAPPED });
  }
}

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
  return {
    models: bytes.length,
    modelKB: Math.round(bytes.reduce((a, b) => a + b, 0) / 1024),
    biggestModelKB: Math.round(Math.max(0, ...bytes) / 1024),
  };
}

/** El nombre de la GPU con la que dibuja la pagina (corre en el navegador). */
function gpuName() {
  const gl = document.createElement('canvas').getContext('webgl2');
  const info = gl?.getExtension('WEBGL_debug_renderer_info');
  return gl ? gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) : 'sin WebGL';
}

/** Lo que tarda cada fotograma durante `ms` milisegundos, con el reloj real (corre en el navegador). */
function frameTimes(ms) {
  return new Promise((done) => {
    const times = [];
    const start = performance.now();
    let last = start;
    const tick = (now) => {
      times.push(now - last);
      last = now;
      if (now - start < ms) requestAnimationFrame(tick);
      else done(times);
    };
    requestAnimationFrame(tick);
  });
}

/** Lo que manda la vista a la GPU en un fotograma, y lo que tiene cargado (corre en el navegador). */
function rendererCounts() {
  const { render, memory } = window.ilogic3d.world.renderer.info;
  return { drawCalls: render.calls, triangles: render.triangles, geometries: memory.geometries, textures: memory.textures };
}

/** Pone un clima en la vista (luz y particulas; corre en el navegador). */
function setWeather(kind) {
  window.ilogic3d.world.setWeather(kind);
  window.ilogic3d.weather.set(kind);
}

const round = (value) => Math.round(value * 10) / 10;
const percentile = (sorted, share) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))];

/** Carga una escena y la mide. */
async function measureScenario(browser, base, scenario) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  const started = Date.now();
  await page.goto(base + scenario.path.slice(1));
  await page.waitForFunction(() => window.ilogic3d !== undefined, null, { timeout: 120000 });
  const loadMs = Date.now() - started;
  if (scenario.weather) await page.evaluate(setWeather, scenario.weather);
  await page.waitForTimeout(WARMUP_MS);
  const times = (await page.evaluate(frameTimes, SAMPLE_MS)).slice(1).sort((a, b) => a - b);
  const counts = await page.evaluate(rendererCounts);
  await page.close();
  const total = times.reduce((a, b) => a + b, 0);
  return {
    loadMs,
    fps: round((times.length / total) * 1000),
    frameP50Ms: round(percentile(times, 0.5)),
    frameP95Ms: round(percentile(times, 0.95)),
    frameWorstMs: round(times.at(-1)),
    ...counts,
  };
}

/** Cuanto ha cambiado cada medida frente a la linea base (en tanto por uno, con signo). */
function changesFrom(current, base) {
  return Object.fromEntries(
    Object.entries(current)
      .filter(([key, value]) => typeof value === 'number' && base?.[key] > 0)
      .map(([key, value]) => [key, (value - base[key]) / base[key]]),
  );
}

/** Las medidas que han empeorado mas de lo que permite LIMITS. */
function regressions(name, changes) {
  return Object.entries(LIMITS)
    .filter(([key, limit]) => changes[key] > limit)
    .map(([key, limit]) => `${name}: ${key} ${(changes[key] * 100).toFixed(1)} % peor (limite ${limit * 100} %)`);
}

function printScenario(name, measures, changes) {
  console.log(`\n${name}:`);
  for (const [key, value] of Object.entries(measures)) {
    const change = changes[key] === undefined ? '' : `   (${changes[key] > 0 ? '+' : ''}${(changes[key] * 100).toFixed(1)} %)`;
    console.log(`  ${key.padEnd(13)} ${value}${change}`);
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const server = await startDevServer();
  const browser = await launchWithGpu();
  const scenarios = {};
  let gpu;
  try {
    const page = await browser.newPage();
    gpu = await page.evaluate(gpuName);
    await page.close();
    for (const scenario of SCENARIOS) scenarios[scenario.name] = await measureScenario(browser, server.url, scenario);
  } finally {
    await browser.close();
    server.stop();
  }
  const result = { gpu, scenarios, assets: assetWeight(), measuredAt: new Date().toISOString() };
  writeFileSync(`${OUT}latest.json`, JSON.stringify(result, null, 2));
  if (save) writeFileSync(BASELINE, JSON.stringify(result, null, 2) + '\n');

  const saved = !save && existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;
  const base = saved?.gpu === gpu ? saved : null;
  console.log(`GPU: ${gpu}`);
  if (saved && !base) console.log(`La linea base es de otra GPU (${saved.gpu}): no se compara.`);
  const problems = [];
  for (const [name, measures] of Object.entries(scenarios)) {
    const changes = base ? changesFrom(measures, base.scenarios?.[name]) : {};
    printScenario(name, measures, changes);
    problems.push(...regressions(name, changes));
  }
  const { models, modelKB, biggestModelKB } = result.assets;
  console.log(`\nModelos: ${models} ficheros, ${modelKB} KB en total, el mayor ${biggestModelKB} KB`);
  if (save) console.log('\nLinea base guardada en tools/perf/baseline.json');
  else if (!saved) console.log('\nNo hay linea base: npm run perf -- --save para guardarla.');
  console.log('Detalle: tools/perf/out/latest.json');
  if (problems.length) {
    console.log(`\nHa empeorado:\n  ${problems.join('\n  ')}`);
    if (check) process.exit(1);
  }
}

await main();
