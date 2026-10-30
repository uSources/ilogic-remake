// Nada fuera de pantalla (fase V0 de docs/PLAN-MOVIL.md): abre el juego en moviles (dist-single por
// file://), en cada escena y en vertical y horizontal, y busca lo que se corta:
//   - la pagina se desplaza (scroll de pagina, no de un panel)
//   - un elemento visible sale de la pantalla y no esta dentro de algo que lo recorta o desplaza
//
//   npm run fuera     (compila dist-single y lo comprueba)
//   node tests/visual/fuera.mjs --vista=movil-vertical   (sin compilar, solo una pantalla)
//
// Sale con error si encuentra algo. Sin red y sin animaciones (ilogicDebug.freeze).
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';

const root = fileURLToPath(new URL('../../', import.meta.url));
const GAME = `file://${root}dist-single/ilogic.html`;
if (!existsSync(`${root}dist-single/ilogic.html`)) throw new Error('Falta dist-single/ilogic.html: npm run build:ci');

const VIEWPORTS = {
  'movil-vertical': { width: 393, height: 852 },
  'movil-horizontal': { width: 852, height: 393 },
  'movil-pequeno-vertical': { width: 360, height: 640 },
  'movil-pequeno-horizontal': { width: 640, height: 360 },
};

/** Escenas: que hacer antes de medir. Las mismas que las capturas, mas la fase de mover. */
const SCENES = {
  inicio: async () => {},
  novedades: async (p) => {
    await p.click('.news-link');
    await p.waitForSelector('.notes');
  },
  partida: async (p) => {
    await p.evaluate(() => window.ilogicDebug.startGame({ seed: 7, size: 20, theme: 0 }));
  },
  'partida-menu': async (p) => {
    await p.evaluate(() => window.ilogicDebug.startGame({ seed: 7, size: 20, theme: 0 }));
    await p.keyboard.press('Escape');
    await p.waitForSelector('.pop, .pause');
  },
  'partida-ayuda': async (p) => {
    await p.evaluate(() => window.ilogicDebug.startGame({ seed: 7, size: 20, theme: 0 }));
    await p.keyboard.press('KeyH');
    await p.waitForSelector('.help');
  },
  'partida-dinero': async (p) => {
    await p.evaluate(() => window.ilogicDebug.startGame({ seed: 7, size: 20, theme: 0 }));
    // Con el dedo: abrir el desglose del dinero (la barra de arriba).
    await p.locator('.top .funds').tap();
    await p.waitForTimeout(100);
  },
  'partida-unidad-elegida': async (p) => {
    await p.evaluate(() => window.ilogicDebug.startGame({ seed: 7, size: 20, theme: 0 }));
    // Elegir la primera unidad propia que pueda actuar (la ficha grande de abajo).
    await p.keyboard.press('Enter');
    await p.waitForTimeout(100);
  },
  compra: async (p) => {
    // Una fabrica propia en (11,12) con dinero para todo; tocarla abre la compra.
    await p.evaluate(() => window.ilogicDebug.startGame({ seed: 7, size: 20, theme: 0, fog: false }));
    const st = await p.evaluate(() => {
      const s = window.ilogicDebug.state();
      Object.assign(
        s.buildings.find((b) => b.x === 0 && b.y === 10),
        { x: 11, y: 12, type: 2 },
      );
      s.funds[0] = 20000;
      return s;
    });
    await p.evaluate((s) => window.ilogicDebug.startGame({ state: s }), st);
    await p.evaluate(() => window.ilogicDebug.idle());
    await p.waitForTimeout(300);
    const pt = await p.evaluate(() => {
      const v = window.ilogic.scene.getScene('Game').view;
      v.centerOn({ x: 11, y: 12 }, true);
      const r = v.tileRectCss({ x: 11, y: 12 });
      return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    });
    await p.touchscreen.tap(pt.x, pt.y);
    await p.waitForSelector('.pop-buy');
  },
  'fin-turno': async (p) => {
    await p.evaluate(() => window.ilogicDebug.startGame({ seed: 7, size: 20, theme: 0 }));
    await p.evaluate(() => window.ilogicDebug.idle());
    await p.waitForTimeout(300);
    await p.locator('.top .px-btn.end').tap();
    await p.waitForSelector('.confirm-end');
  },
  campana: async (p) => {
    await p.evaluate(() => window.ilogicDebug.startGame({ mission: 'tutorial' }));
  },
};

/** Lo que en la pagina se sale de la pantalla y no esta recortado por un contenedor. */
function measure() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const doc = document.documentElement;
  const page = {
    scrollX: doc.scrollWidth > W + 1,
    scrollY: doc.scrollHeight > H + 1,
    docW: doc.scrollWidth,
    docH: doc.scrollHeight,
  };
  // Un panel con desplazamiento propio (auto/scroll) puede tener contenido fuera: se puede mover.
  // Lo que se corta en un contenedor "hidden" o sin desplazamiento cuenta como fuera de pantalla.
  const scrolls = (el) => {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const o = window.getComputedStyle(a);
      if (/auto|scroll/.test(o.overflowX + o.overflowY)) return true;
    }
    return false;
  };
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.tagName === 'CANVAS' || el.closest('canvas')) continue;
    const cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const bad = r.right > W + 1 || r.bottom > H + 1 || r.left < -1 || r.top < -1;
    if (!bad || scrolls(el)) continue;
    const name =
      el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).join('.')}` : el.tagName.toLowerCase();
    out.push(`${name} [${Math.round(r.left)},${Math.round(r.top)} → ${Math.round(r.right)},${Math.round(r.bottom)}]`);
  }
  return { page, out: out.slice(0, 8), total: out.length };
}

// --vista=movil-vertical,movil-horizontal: solo esas pantallas (por defecto, todas).
const only = process.argv
  .find((a) => a.startsWith('--vista='))
  ?.slice(8)
  .split(',');
const browser = await chromium.launch();
let problems = 0;
for (const [vname, viewport] of Object.entries(VIEWPORTS)) {
  if (only && !only.includes(vname)) continue;
  for (const [sname, setup] of Object.entries(SCENES)) {
    try {
      await checkScene(browser, vname, viewport, sname, setup);
    } catch (e) {
      // Una escena que se rompe (pagina cerrada, espera agotada) no tapa las demas.
      console.log(`MAL  ${vname} / ${sname}\n       no se pudo medir: ${e.message.split('\n')[0]}`);
      problems++;
    }
  }
}
await browser.close();
if (problems) {
  console.error(`\n${problems} escenas con cosas fuera de pantalla o sin medir.`);
  process.exit(1);
}
console.log('\nNada fuera de pantalla.');

async function checkScene(browser, vname, viewport, sname, setup) {
  {
    const ctx = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
      userAgent: devices['Pixel 7'].userAgent,
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route(/^https?:\/\//, (r) => r.abort());
    await page.addInitScript(() => {
      localStorage.setItem('ilogic.settings', JSON.stringify({ menuBg: 'classic', music: false, autoWait: true }));
      localStorage.setItem('ilogic.touchHint', '1');
    });
    await page.goto(GAME);
    await page.evaluate(() => window.ilogicDebug.ready());
    await page.evaluate(() => window.ilogicDebug.freeze());
    await setup(page);
    await page.waitForTimeout(1200);
    const m = await page.evaluate(measure);
    const bad = m.page.scrollX || m.page.scrollY || m.total > 0 || errors.length > 0;
    console.log(`${bad ? 'MAL ' : 'ok  '} ${vname} / ${sname}`);
    if (m.page.scrollX || m.page.scrollY)
      console.log(`       la pagina se desplaza: ${m.page.docW}x${m.page.docH} en ${viewport.width}x${viewport.height}`);
    for (const o of m.out) console.log(`       fuera: ${o}`);
    if (m.total > m.out.length) console.log(`       ...y ${m.total - m.out.length} mas`);
    for (const e of errors) console.log(`       error: ${e}`);
    if (bad) problems++;
    await ctx.close();
  }
}
