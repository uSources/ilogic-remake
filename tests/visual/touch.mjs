// Jugar con el dedo: abre el juego en una pantalla de movil tactil (dist-single/ilogic.html por
// file://) y comprueba los gestos del mapa (ver src/ui/touch.ts):
//   mover = tocar la unidad y el destino; atacar = tocar el enemigo dos veces; tocar una fabrica
//   compra; arrastrar desde la unidad la lleva; arrastrar desde otra casilla mueve el mapa.
//
//   npm run touch     (compila dist-single y lo comprueba)
//
// Sale con error si algun gesto no hace lo que debe. Sin red y sin animaciones (ilogicDebug.freeze).
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';

const root = fileURLToPath(new URL('../../', import.meta.url));
const GAME = `file://${root}dist-single/ilogic.html`;
if (!existsSync(`${root}dist-single/ilogic.html`)) throw new Error('Falta dist-single/ilogic.html: npm run build:ci');

const VIEWPORTS = { vertical: { width: 393, height: 852 }, horizontal: { width: 852, height: 393 } };
const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'MAL '} ${what}`);
  if (!ok) failures.push(what);
};

async function open(browser, viewport) {
  // Densidad 1: con 2, en maquinas lentas (CI) cada evento tarda tanto que un arrastre rapido
  // llega a contar como "mantener pulsado" (250 ms) y la prueba no mide lo que debe.
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    userAgent: devices['Pixel 7'].userAgent,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => failures.push(`error en la pagina: ${e.message}`));
  await page.route(/^https?:\/\//, (r) => r.abort());
  // Sin el aviso de gestos (tapa el mapa) y con "esperar sola" (lo normal).
  await page.addInitScript(() => {
    localStorage.setItem('ilogic.settings', JSON.stringify({ menuBg: 'classic', music: false, autoWait: true }));
    localStorage.setItem('ilogic.touchHint', '1');
  });
  await page.goto(GAME);
  await page.evaluate(() => window.ilogicDebug.ready());
  await page.evaluate(() => window.ilogicDebug.freeze());
  return { ctx, page, cdp: await ctx.newCDPSession(page) };
}

/**
 * Partida de prueba: mapa 7 (20x20) con el soldado propio llevado a (6,12), en medio de una llanura
 * (lejos de los bordes, que en horizontal quedan bajo la interfaz), y una fabrica propia en (11,12).
 * `enemy`: ademas, un soldado enemigo al lado (7,12).
 */
async function start(page, enemy = false) {
  await page.evaluate(() => window.ilogicDebug.startGame({ seed: 7, size: 20, theme: 0, fog: false }));
  const st = await page.evaluate((enemy) => {
    const s = window.ilogicDebug.state();
    const me = s.units.find((u) => u.x === 0 && u.y === 7);
    Object.assign(me, { x: 6, y: 12 });
    // El pozo de petroleo propio de (0,10) pasa a ser una fabrica en (11,12).
    Object.assign(
      s.buildings.find((b) => b.x === 0 && b.y === 10),
      { x: 11, y: 12, type: 2 },
    );
    if (enemy) s.units.push({ ...me, uid: s.nextUid++, team: 1, x: 7, y: 12, cargo: [], carrier: null });
    return s;
  }, enemy);
  await page.evaluate((s) => window.ilogicDebug.startGame({ state: s }), st);
  await page.evaluate(() => window.ilogicDebug.idle());
  await page.waitForTimeout(300);
}

const center = (page, x, y) =>
  page.evaluate(
    ([x, y]) => {
      const v = window.ilogic.scene.getScene('Game').view;
      v.centerOn({ x, y }, true);
      const r = v.tileRectCss({ x, y });
      return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    },
    [x, y],
  );
const at = (page, x, y) =>
  page.evaluate(
    ([x, y]) => {
      const r = window.ilogic.scene.getScene('Game').view.tileRectCss({ x, y });
      return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    },
    [x, y],
  );

async function tap(page, x, y) {
  const p = await at(page, x, y);
  await page.touchscreen.tap(p.x, p.y);
  await page.waitForTimeout(120);
  await page.evaluate(() => window.ilogicDebug.idle());
}

/** Arrastrar con un dedo de una casilla a otra (o de un punto a otro), en pasos. */
async function drag(page, cdp, from, to, holdMs = 0) {
  const steps = 8;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
  if (holdMs) await page.waitForTimeout(holdMs);
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps,
      y = from.y + ((to.y - from.y) * i) / steps;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(150);
  await page.evaluate(() => window.ilogicDebug.idle());
}

const unit = (page, uid) => page.evaluate((uid) => window.ilogicDebug.state().units.find((u) => u.uid === uid) ?? null, uid);
const phase = (page) => page.evaluate(() => window.ilogicDebug.game().phase);

/** Soldado propio (ver start) y casillas libres a su derecha. */
const SOLDIER = { x: 6, y: 12 };
const FACTORY = { x: 11, y: 12 };

async function scenarios(page, cdp, name) {
  console.log(`\n# ${name}`);

  // Mover: dos toques.
  await start(page);
  const s0 = await page.evaluate(
    ([x, y]) => window.ilogicDebug.state().units.find((u) => u.team === 0 && u.x === x && u.y === y),
    [SOLDIER.x, SOLDIER.y],
  );
  await center(page, SOLDIER.x + 1, SOLDIER.y);
  await tap(page, SOLDIER.x, SOLDIER.y);
  check((await phase(page)) === 'move', 'tocar una unidad propia la elige');
  await tap(page, SOLDIER.x + 1, SOLDIER.y);
  const s1 = await unit(page, s0.uid);
  check(s1?.x === SOLDIER.x + 1 && s1?.y === SOLDIER.y, 'tocar el destino la mueve (2 toques)');
  check((await phase(page)) === 'map' && s1?.active === false, 'sin nada mas que hacer, espera sola');

  // Fuera del alcance: se deja de elegir.
  await start(page);
  await center(page, SOLDIER.x + 2, SOLDIER.y);
  await tap(page, SOLDIER.x, SOLDIER.y);
  await tap(page, SOLDIER.x + 4, SOLDIER.y + 1);
  check((await phase(page)) === 'map', `tocar fuera del alcance deja de elegir (${await phase(page)})`);

  // Casilla vacia dos veces: no abre el menu de partida.
  await tap(page, SOLDIER.x + 4, SOLDIER.y + 1);
  check((await phase(page)) === 'map', 'tocar dos veces una casilla vacia no abre el menu');

  // Atacar: un enemigo al lado del soldado; primer toque prevision, segundo ataque.
  await start(page, true);
  const enemy = await page.evaluate(() => window.ilogicDebug.state().units.find((u) => u.team === 1 && u.x === 7 && u.y === 12));
  await center(page, SOLDIER.x + 1, SOLDIER.y);
  await tap(page, SOLDIER.x, SOLDIER.y);
  await tap(page, SOLDIER.x + 1, SOLDIER.y);
  const e1 = await unit(page, enemy.uid);
  const fc = await page.evaluate(() => !!window.ilogicDebug.ui().forecast);
  check(e1?.life === enemy.life && (await phase(page)) === 'move' && fc, 'primer toque en el enemigo: prevision, sin atacar');
  await tap(page, SOLDIER.x + 1, SOLDIER.y);
  const e2 = await unit(page, enemy.uid);
  check(!e2 || e2.life < enemy.life, 'segundo toque: ataca');

  // Comprar: tocar la fabrica libre.
  await start(page);
  await center(page, FACTORY.x, FACTORY.y);
  await tap(page, FACTORY.x, FACTORY.y);
  check((await phase(page)) === 'buy', 'tocar una fabrica propia libre abre la compra');

  // Arrastrar desde la unidad: la lleva sin mantener pulsado.
  await start(page);
  await center(page, SOLDIER.x + 1, SOLDIER.y);
  await drag(page, cdp, await at(page, SOLDIER.x, SOLDIER.y), await at(page, SOLDIER.x + 1, SOLDIER.y));
  const s2 = await unit(page, s0.uid);
  check(s2?.x === SOLDIER.x + 1 && s2?.y === SOLDIER.y, 'arrastrar desde la unidad la mueve');

  // Arrastre rapido que acaba lejos, fuera del alcance: vuelve a su sitio, sin orden de varios turnos.
  await start(page);
  await center(page, SOLDIER.x - 3, SOLDIER.y);
  const far = await at(page, SOLDIER.x - 6, SOLDIER.y);
  await drag(page, cdp, await at(page, SOLDIER.x, SOLDIER.y), far);
  const s3 = await unit(page, s0.uid);
  check(
    s3?.x === SOLDIER.x && s3?.y === SOLDIER.y && !s3?.order,
    `arrastre rapido lejos: vuelve, sin orden (${JSON.stringify([s3?.x, s3?.y, s3?.order, far])})`,
  );

  // Orden con un gesto: con la unidad elegida, mantener pulsado el destino abre el menu de ordenes.
  await start(page);
  await center(page, SOLDIER.x + 2, SOLDIER.y);
  const hold = async (x, y, ms = 650) => {
    const p = await at(page, x, y);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] });
    await page.waitForTimeout(ms);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(150);
  };
  await hold(SOLDIER.x + 4, SOLDIER.y);
  check((await phase(page)) === 'map', 'sin unidad elegida, mantener pulsado no abre ordenes');
  await tap(page, SOLDIER.x, SOLDIER.y);
  await hold(SOLDIER.x + 4, SOLDIER.y);
  const om = await page.evaluate(() => window.ilogicDebug.ui().menu?.items.map((i) => i.id));
  check(
    (await phase(page)) === 'orderMenu' && om?.join() === 'attack,defend',
    `con la unidad elegida, mantener pulsado el destino abre las ordenes (${await phase(page)}: ${om})`,
  );
  const btn = page.locator('[role=menuitem]').filter({ hasText: /Defender|Hold/ });
  if (await btn.count()) await btn.first().tap();
  await page.waitForTimeout(150);
  await page.evaluate(() => window.ilogicDebug.idle());
  const s4 = await unit(page, s0.uid);
  check(
    s4?.command?.kind === 'defend' && s4.command.at.x === SOLDIER.x + 4 && (await phase(page)) === 'map',
    `tocar «Defender allí» da la orden (${JSON.stringify(s4?.command)})`,
  );
  // Mantener pulsada la propia unidad elegida la sigue cogiendo (no abre ordenes).
  await start(page);
  await center(page, SOLDIER.x + 1, SOLDIER.y);
  await tap(page, SOLDIER.x, SOLDIER.y);
  await drag(page, cdp, await at(page, SOLDIER.x, SOLDIER.y), await at(page, SOLDIER.x + 1, SOLDIER.y), 320);
  const s5 = await unit(page, s0.uid);
  check(s5?.x === SOLDIER.x + 1 && !s5?.command, 'mantener y arrastrar la unidad elegida la sigue moviendo');

  // Arrastrar desde una casilla vacia: mueve el mapa.
  await start(page);
  await center(page, 15, 11);
  const cam = () =>
    page.evaluate(() => {
      const c = window.ilogic.scene.getScene('Game').cameras.main;
      return `${Math.round(c.scrollX)},${Math.round(c.scrollY)}`;
    });
  const cam0 = await cam();
  const a = await at(page, 15, 11);
  await drag(page, cdp, a, { x: a.x - 100, y: a.y - 100 });
  const cam1 = await cam();
  check(cam1 !== cam0 && (await phase(page)) === 'map', `arrastrar desde una casilla vacia mueve el mapa (${cam0} → ${cam1})`);

  // Pellizcar: dos dedos que se separan hacen zoom, y no eligen ni mueven nada.
  await start(page);
  const level = () => page.evaluate(() => window.ilogic.scene.getScene('Game').view.level);
  const z0 = await level();
  const c = await center(page, 10, 10);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: c.x - 30, y: c.y },
      { x: c.x + 30, y: c.y },
    ],
  });
  for (let i = 1; i <= 6; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: c.x - 30 - i * 10, y: c.y },
        { x: c.x + 30 + i * 10, y: c.y },
      ],
    });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(150);
  await page.evaluate(() => window.ilogicDebug.idle());
  const z1 = await level();
  check(z1 > z0 && (await phase(page)) === 'map', `pellizcar con dos dedos hace zoom sin elegir nada (${z0} → ${z1})`);
}

const browser = await chromium.launch();
for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  const { ctx, page, cdp } = await open(browser, viewport);
  await scenarios(page, cdp, name);
  await ctx.close();
}
await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} fallos:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nTodos los gestos bien.');
