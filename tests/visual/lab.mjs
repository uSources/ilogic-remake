// Graba cada accion del laboratorio de animaciones (src/lab.ts) en video, para revisarlas o comparar
// antes y despues de un cambio. Necesita el juego compilado (npm run build:single).
//   node tests/visual/lab.mjs [--attacker Tank] [--defender Tank] [--slow] [--out carpeta]
// Deja <out>/<accion>.webm y, si hay ffmpeg, <out>/<accion>.gif y una hoja de fotogramas <accion>.png.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
const out = opt('out', `${root}tests/visual/out/lab`);
const attacker = opt('attacker', 'Tank');
const defender = opt('defender', 'Tank');
const slow = args.includes('--slow');
const hasFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const action of ['move', 'attack', 'counter', 'kill']) {
  const tmp = `${out}/tmp-${action}`;
  rmSync(tmp, { recursive: true, force: true });
  const ctx = await browser.newContext({
    viewport: { width: 960, height: 600 },
    recordVideo: { dir: tmp, size: { width: 960, height: 600 } },
  });
  const page = await ctx.newPage();
  await page.goto(`file://${root}dist-single/ilogic.html`);
  await page.evaluate(() => window.ilogicDebug.ready());
  const t0 = Date.now();
  await page.evaluate((o) => window.ilogicDebug.lab(o), { attacker, defender, slow, play: action });
  await page.waitForTimeout(600);
  await page.evaluate(() => window.ilogicDebug.idle(30000));
  const ms = Date.now() - t0 - 600;
  await page.waitForTimeout(400);
  await ctx.close();
  const video = `${out}/${action}.webm`;
  renameSync(`${tmp}/${readdirSync(tmp)[0]}`, video);
  rmSync(tmp, { recursive: true, force: true });
  if (hasFfmpeg) {
    // Sin la carga del juego: los ultimos segundos, que es la accion.
    const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video]).toString());
    const ss = String(Math.max(0, dur - (ms + 1200) / 1000));
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', ss, '-i', video, '-vf', 'fps=12,scale=480:-1', `${out}/${action}.gif`]);
    execFileSync('ffmpeg', [
      '-v',
      'error',
      '-y',
      '-ss',
      ss,
      '-i',
      video,
      '-vf',
      'fps=6,scale=320:200,tile=6x6',
      '-frames:v',
      '1',
      `${out}/${action}.png`,
    ]);
  }
  console.log(`${action}: ${ms} ms`);
}
await browser.close();
console.log(`Videos en ${out}`);
