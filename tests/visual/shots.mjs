// Capturas de referencia: abre el juego (dist-single/ilogic.html por file://), saca capturas de
// escenas fijas y las compara con las guardadas en tests/visual/ref/.
//
//   npm run shots           compila, captura y compara (falla si algo cambia de mas)
//   npm run shots:update    guarda las capturas actuales como nuevas referencias
//   node tests/visual/shots.mjs [--update] [--only=nombre,...]   sin compilar
//
// Resultado en tests/visual/out/: <nombre>.png (actual), <nombre>.diff.png (en rojo lo distinto) e
// index.html con todo junto. Pensado para que un agente de IA vea lo que ha cambiado: leer
// tests/visual/out/index.html o las imagenes .diff.png.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pixelmatch from 'pixelmatch';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const REF = `${root}tests/visual/ref/`;
const OUT = `${root}tests/visual/out/`;
const GAME = `file://${root}dist-single/ilogic.html`;
const update = process.argv.includes('--update');
const only = process.argv
  .find((a) => a.startsWith('--only='))
  ?.slice(7)
  .split(',');
/**
 * Parte de pixeles distintos que se acepta. En la maquina donde se hicieron las referencias, casi
 * nada (antialias). En GitHub Actions las fuentes y la GPU por software cambian ~1-4 % de los pixeles
 * (sobre todo textos): alli solo se detectan cambios grandes.
 */
const TOLERANCE = process.env.CI ? 0.06 : 0.004;

/** Escenas: nombre → que hacer antes de la captura (page = Playwright). Ajustes propios en SETTINGS. */
const SCENES = {
  menu: async () => {},
  'menu-novedades': async (p) => {
    await p.click('.news-link');
    await p.waitForSelector('.notes');
  },
  ...Object.fromEntries(
    [0, 1, 2, 3, 4].map((theme) => [
      `partida-tema${theme}`,
      async (p) => {
        await p.evaluate((th) => window.ilogicDebug.startGame({ seed: 7, size: 20, theme: th }), theme);
      },
    ]),
  ),
  'partida-niebla': async (p) => {
    await p.evaluate(() => window.ilogicDebug.startGame({ seed: 7, size: 20, theme: 0, fog: true }));
  },
  'partida-menu': async (p) => {
    await p.evaluate(() => window.ilogicDebug.startGame({ seed: 7, size: 20, theme: 0 }));
    await p.keyboard.press('Escape');
    await p.waitForSelector('.pop, .pause');
  },
  'partida-dinero': async (p) => {
    await p.evaluate(() => window.ilogicDebug.startGame({ seed: 7, size: 20, theme: 0 }));
    await p.hover('.top .funds');
    await p.waitForSelector('.funds .breakdown', { state: 'visible' });
  },
  'partida-dia': async (p) => {
    await p.evaluate(() => window.ilogicDebug.startGame({ seed: 7, size: 20, theme: 0, dayLimit: 20 }));
    await p.hover('.top .day');
    await p.waitForSelector('.day .breakdown', { state: 'visible' });
  },
  'partida-general': async (p) => {
    await p.evaluate(() => window.ilogicDebug.startGame({ seed: 7, size: 20, theme: 0, general: 'Brisa' }));
  },
  'partida-ataque-aereo': async (p) => {
    // Brisa con la barra llena (partida preparada) apuntando el ataque aereo cerca del enemigo.
    await p.evaluate(async () => {
      const d = window.ilogicDebug;
      await d.startGame({ seed: 7, size: 20, theme: 0, general: 'Brisa' });
      const s = d.state();
      s.generals[0].charge = 6;
      await d.startGame({ state: s });
    });
    await p.click('.gp-ab:has-text("Ataque aéreo")');
    await p.mouse.move(900, 300);
    await p.waitForTimeout(200);
  },
  'partida-ayuda': async (p) => {
    await p.evaluate(() => window.ilogicDebug.startGame({ seed: 7, size: 20, theme: 0 }));
    await p.keyboard.press('KeyH');
    await p.waitForSelector('.help');
  },
  'partida-2013': async (p) => {
    await p.evaluate(() => window.ilogicDebug.startGame({ seed: 7, size: 20, theme: 0 }));
  },
  'campana-tutorial': async (p) => {
    await p.evaluate(() => window.ilogicDebug.startGame({ mission: 'tutorial' }));
  },
};

/** Ajustes del juego (los de Opciones) para alguna escena; el resto usa BASE_SETTINGS. */
const BASE_SETTINGS = { menuBg: 'classic', music: false };
const SETTINGS = { 'partida-2013': { terrainArt: 'classic' } };

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
  const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.15 });
  const ratio = n / (a.width * a.height);
  writeFileSync(`${OUT}${name}.diff.png`, PNG.sync.write(diff));
  return { name, status: ratio > TOLERANCE ? 'changed' : 'same', ratio };
}

async function main() {
  if (!existsSync(`${root}dist-single/ilogic.html`)) throw new Error('Falta dist-single/ilogic.html: npm run build:single');
  mkdirSync(REF, { recursive: true });
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const results = [];
  const errors = [];
  for (const [name, setup] of Object.entries(SCENES)) {
    if (only && !only.includes(name)) continue;
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && !/api\.github|ERR_FAILED/.test(m.text()) && errors.push(`${name}: ${m.text()}`));
    // Sin red (notas de GitHub) y con el fondo fijo del menu: capturas siempre iguales.
    await page.route(/^https?:\/\//, (r) => r.abort());
    await page.addInitScript((st) => localStorage.setItem('ilogic.settings', JSON.stringify(st)), { ...BASE_SETTINGS, ...SETTINGS[name] });
    await page.goto(GAME);
    await page.evaluate(() => window.ilogicDebug.ready());
    await page.evaluate(() => window.ilogicDebug.freeze());
    await setup(page);
    // Que terminen los avisos de entrada (banner del dia) y las transiciones.
    await page.waitForTimeout(2600);
    const png = await page.screenshot();
    writeFileSync(`${OUT}${name}.png`, png);
    results.push(compare(name, png));
    await page.close();
  }
  await browser.close();

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
  // En GitHub Actions: avisos visibles en el run y tabla en el resumen.
  if (process.env.GITHUB_ACTIONS) {
    for (const r of results.filter((x) => x.status === 'changed' || x.status === 'size'))
      console.log(`::warning title=Captura distinta::${r.name}: ${(r.ratio * 100).toFixed(2)} % de pixeles distintos`);
    for (const e of errors) console.log(`::warning title=Error en la pagina::${e}`);
    if (process.env.GITHUB_STEP_SUMMARY)
      writeFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `| escena | estado | distinto |\n|---|---|---|\n${results.map((r) => `| ${r.name} | ${r.status} | ${(r.ratio * 100).toFixed(2)} % |`).join('\n')}\n`,
        { flag: 'a' },
      );
  }
  if (errors.length) console.log(`\nErrores en la pagina:\n${errors.join('\n')}`);
  console.log(`\nInforme: tests/visual/out/index.html`);
  const bad = results.filter((r) => r.status === 'changed' || r.status === 'size');
  if (bad.length || errors.length) {
    console.log(`\n${bad.length} captura(s) distinta(s). Si el cambio es a proposito: npm run shots:update`);
    process.exit(1);
  }
}

await main();
