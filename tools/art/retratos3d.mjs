// Renders de las unidades desde sus modelos 3D (los GLB de public/assets/models/units/), en el
// playground (units3d.html). Cada una sale en tres cuartos desde delante, con fondo magenta para
// quitarlo luego en tools/art/retratos_pixel.py, que lo convierte en pixel art para la interfaz.
//
//   npm run retratos     → tools/art/retratos/3d/<lado>_<Unidad>.png  (own = azul, enemy = rojo)
//
// Hace falta navegador (Playwright). Lo que sale se guarda en el repo: el build no lo necesita.
/* global window, requestAnimationFrame, fetch, setTimeout */
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT = fileURLToPath(new URL('./retratos/3d/', import.meta.url));
const SIDES = ['own', 'enemy'];

const PORT = 5181;
const URL_BASE = `http://localhost:${PORT}/`;

/** Arranca el servidor de desarrollo (vite) y espera a que conteste; devuelve la URL y como pararlo. */
async function startServer() {
  const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  for (let attempt = 0; attempt < 120; attempt++) {
    if (await responds()) return { url: URL_BASE, stop: () => vite.kill() };
    await new Promise((done) => setTimeout(done, 500));
  }
  vite.kill();
  throw new Error(`El servidor de desarrollo no contesta en ${URL_BASE}`);
}

async function responds() {
  try {
    return (await fetch(URL_BASE)).ok;
  } catch {
    return false;
  }
}

/** Lo que se ve en el playground, sin suelo, cielo ni niebla, sobre magenta, encuadrado en tres cuartos. */
function frameUnit(id, side) {
  const { world, stage, catalog } = window.ilogicPlayground;
  if (!catalog.units.includes(id)) throw new Error(`No hay unidad ${id}`);
  stage.show([{ kind: 'unit', id }], side);
  world.scene.background = null;
  world.scene.fog = null;
  world.renderer.setClearColor(0xff00ff, 1);
  for (const child of world.scene.children) if (child !== stage.object && !child.isLight) child.visible = false;
  stage.object.children[0].visible = false;
  // Las baldosas (planos bajo cada modelo) son hijas de los modelos y no salen en el retrato.
  for (const child of stage.object.children[1].children) if (child.isMesh) child.visible = false;
  const { center, radius } = stage.bounds();
  const dir = { x: 0.6, y: 0.25, z: 0.9 };
  const length = Math.hypot(dir.x, dir.y, dir.z);
  const distance = radius * 3.2;
  world.camera.position.set(
    center.x + (dir.x / length) * distance,
    center.y + (dir.y / length) * distance,
    center.z + (dir.z / length) * distance,
  );
  world.camera.lookAt(center.x, center.y + radius * 0.55, center.z);
}

/** Espera a que el GLB este cargado y se haya dibujado un fotograma con la vista puesta. */
async function settle(page) {
  await page.waitForTimeout(400);
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const dev = await startServer();
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } });
  try {
    await page.goto(`${dev.url}units3d.html?model=Soldier`);
    await page.waitForFunction('window.ilogicPlayground !== undefined', null, { timeout: 120000 });
    const units = await page.evaluate(() => window.ilogicPlayground.catalog.units);
    for (const side of SIDES) {
      for (const id of units) {
        await page.evaluate(`(${frameUnit})(${JSON.stringify(id)}, ${JSON.stringify(side)})`);
        await settle(page);
        await page
          .locator('canvas')
          .first()
          .screenshot({ path: `${OUT}${side}_${id}.png` });
        console.log(`${side}_${id}`);
      }
    }
  } finally {
    await browser.close();
    dev.stop();
  }
}

await main();
