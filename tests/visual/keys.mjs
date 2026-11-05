// Teclado de verdad en el navegador: abre dist-single/ilogic.html por file:// y comprueba lo que los
// tests unitarios no ven, el camino de la tecla entre el navegador, main.ts y Phaser
// (src/controls/browserKeys.ts). Sobre todo Tab: "siguiente unidad" en el mapa y "siguiente" en la
// pantalla final, sin que el navegador mueva el foco, ni en los cuadros de texto.
//
//   npm run keys     (compila dist-single y lo comprueba)
//
// Sale con error si alguna tecla no hace lo que debe. Sin red y sin animaciones (ilogicDebug.freeze).
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../../', import.meta.url));
const GAME = `file://${root}dist-single/ilogic.html`;
if (!existsSync(`${root}dist-single/ilogic.html`)) throw new Error('Falta dist-single/ilogic.html: npm run build:ci');

const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'MAL '} ${what}`);
  if (!ok) failures.push(what);
};

async function open(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => failures.push(`error en la pagina: ${e.message}`));
  await page.route(/^https?:\/\//, (r) => r.abort());
  await page.addInitScript(() => localStorage.setItem('ilogic.settings', JSON.stringify({ menuBg: 'classic', music: false })));
  await page.goto(GAME);
  await page.evaluate(() => window.ilogicDebug.ready());
  await page.evaluate(() => window.ilogicDebug.freeze());
  return page;
}

const game = (page) => page.evaluate(() => window.ilogicDebug.game());
const focused = (page) => page.evaluate(() => document.activeElement?.tagName ?? null);
const press = async (page, key) => {
  await page.keyboard.press(key);
  await page.waitForTimeout(80);
};

/** Mueve la seleccion del menu de la partida (ui().menu) hasta la opcion `id`. */
async function menuTo(page, id) {
  for (let i = 0; i < 12; i++) {
    const m = await page.evaluate(() => window.ilogicDebug.ui().menu);
    if (m?.items[m.selected]?.id === id) return true;
    await press(page, 'ArrowDown');
  }
  return false;
}

/** Mapa 7: tres unidades propias sin mover; Tab las recorre y Mayusculas+Tab tambien (no hay "anterior"). */
async function mapTab(page) {
  await page.evaluate(() => window.ilogicDebug.startGame({ seed: 7, size: 20, theme: 'Plains', fog: false }));
  const idle = await page.evaluate(() =>
    window.ilogicDebug
      .state()
      .units.filter((u) => u.team === 0 && u.turnState !== 'done')
      .map((u) => `${u.x},${u.y}`),
  );
  const seen = new Set();
  let last = (await game(page)).cursor;
  for (let i = 0; i < idle.length; i++) {
    await press(page, 'Tab');
    const c = (await game(page)).cursor;
    check(c.x !== last.x || c.y !== last.y, `mapa: Tab mueve el cursor (${last.x},${last.y} -> ${c.x},${c.y})`);
    seen.add(`${c.x},${c.y}`);
    last = c;
  }
  check(
    idle.every((p) => seen.has(p)),
    `mapa: Tab pasa por todas las unidades sin mover (${[...seen].join(' ')})`,
  );
  await press(page, 'Shift+Tab');
  const c = (await game(page)).cursor;
  check(c.x !== last.x || c.y !== last.y, 'mapa: Mayusculas+Tab tambien salta de unidad');
  check((await focused(page)) === 'BODY', 'mapa: el foco del navegador no se ha movido');
}

/** Rendirse desde el menu de la partida y recorrer los botones de la pantalla final con Tab. */
async function endTab(page) {
  await press(page, 'Escape');
  check(await menuTo(page, 'surrender'), 'menu de la partida: llega a Rendirse');
  await press(page, 'Enter');
  await press(page, 'Enter');
  await page.waitForFunction(() => window.ilogicDebug.ui().screen === 'end', null, { timeout: 15000 });
  await page.waitForTimeout(300);
  const sel = () => page.evaluate(() => window.ilogicDebug.ui().end?.selected);
  // Phaser atiende las teclas en cola, una vez por fotograma; en CI (sin pantalla) los fotogramas
  // tardan y dos pulsaciones muy seguidas se pisaban. Se espera a ver el cambio (hasta 3 s) y un poco mas.
  const changed = async (from) => {
    for (let i = 0; i < 60 && (await sel()) === from; i++) await page.waitForTimeout(50);
    await page.waitForTimeout(250);
    return sel();
  };
  const s0 = await sel();
  await press(page, 'Tab');
  const s1 = await changed(s0);
  check(s1 !== s0, `pantalla final: Tab pasa al siguiente boton (${s0} -> ${s1})`);
  await press(page, 'Shift+Tab');
  check((await changed(s1)) !== s1, 'pantalla final: Mayusculas+Tab tambien');
  check((await focused(page)) === 'BODY', 'pantalla final: el foco del navegador no se ha movido');
}

/** Codigo de mapa en Partida nueva: Tab no saca el foco del cuadro hacia los botones. */
async function codeTab(page) {
  await page.evaluate(() => window.ilogicDebug.toMenu());
  await page.evaluate(() => window.ilogic.scene.getScene('Menu').openSetup());
  const input = page.locator('input.ng-code');
  await input.click();
  await page.keyboard.type('12');
  await press(page, 'Tab');
  check(
    await page.evaluate(() => document.activeElement?.classList.contains('ng-code') ?? false),
    'codigo de mapa: Tab deja el foco en el cuadro',
  );
  check((await input.inputValue()) === '12', 'codigo de mapa: lo escrito sigue ahi');
}

/** Nombre de escuadra (el cuadro corta la propagacion de las teclas): Tab tampoco saca el foco. */
async function squadTab(page) {
  const st = await page.evaluate(async () => {
    await window.ilogicDebug.startGame({ seed: 7, size: 20, theme: 'Plains', fog: false });
    const s = window.ilogicDebug.state();
    const mine = s.units.filter((u) => u.team === 0);
    for (const u of mine) u.squad = 1;
    s.squads = [{ id: 1, team: 0, name: 'Alfa' }];
    await window.ilogicDebug.startGame({ state: s });
    return mine.map((u) => u.uid);
  });
  // El menu de grupo sale al elegir con Mayusculas + recuadro; aqui se abre directamente.
  await page.evaluate((uids) => {
    const g = window.ilogic.scene.getScene('Game');
    g.group = new Set(uids);
    g.openGroupMenu();
  }, st);
  check(await menuTo(page, 'squadRename'), 'menu de grupo: llega a Cambiar nombre');
  await press(page, 'Enter');
  await page.waitForFunction(() => document.activeElement?.tagName === 'INPUT', null, { timeout: 5000 });
  await press(page, 'Tab');
  check((await focused(page)) === 'INPUT', 'nombre de escuadra: Tab deja el foco en el cuadro');
}

/** [CAMBIO] Grupos con numero: 1 elige la escuadra, Ctrl+2 hace el grupo 2 y 2 dos veces lleva la camara. */
async function groupKeys(page) {
  // Cierra el cuadro del nombre de escuadra de la prueba anterior.
  await press(page, 'Escape');
  await page.evaluate(async () => {
    await window.ilogicDebug.startGame({ seed: 7, size: 20, theme: 'Plains', fog: false });
    const s = window.ilogicDebug.state();
    const mine = s.units.filter((u) => u.team === 0);
    for (const u of mine) u.squad = 1;
    // Una partida de ahora: cada escuadra con su tecla (leerla ya no se la da).
    s.squads = [{ id: 1, team: 0, name: 'Alfa', key: 1 }];
    await window.ilogicDebug.startGame({ state: s });
  });
  const n = await page.evaluate(() => window.ilogicDebug.state().units.filter((u) => u.team === 0).length);
  await press(page, 'Digit1');
  check((await page.evaluate(() => window.ilogicDebug.ui().multi)) === n, `grupos: 1 elige la escuadra (${n} unidades)`);
  await press(page, 'Control+Digit2');
  const squads = await page.evaluate(() => window.ilogicDebug.state().squads ?? []);
  check(squads.length === 1 && squads[0].key === 2, `grupos: Ctrl+2 hace el grupo 2 (${JSON.stringify(squads.map((q) => q.key))})`);
  await press(page, 'Escape');
  check((await page.evaluate(() => window.ilogicDebug.ui().multi)) === null, 'grupos: Esc suelta la seleccion');
  await page.evaluate(() => {
    const g = window.ilogic.scene.getScene('Game');
    g.view.cursor = { x: 19, y: 0 };
  });
  await press(page, 'Digit2');
  await press(page, 'Digit2');
  const c = (await game(page)).cursor;
  check(c.x < 10, `grupos: 2 dos veces lleva el cursor a la escuadra (${c.x},${c.y})`);
}

const browser = await chromium.launch();
try {
  const page = await open(browser);
  await mapTab(page);
  await endTab(page);
  await codeTab(page);
  await squadTab(page);
  await groupKeys(page);
} finally {
  await browser.close();
}
if (failures.length) {
  console.error(`\n${failures.length} fallo(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('\nTeclado: todo bien');
