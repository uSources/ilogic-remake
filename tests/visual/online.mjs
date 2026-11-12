// Una partida por la red de verdad, de punta a punta: el servidor (`wrangler dev` desde server/, en un
// puerto libre y solo mientras dura el test) y dos navegadores con dist-single/ilogic.html por file://
// (la URL del servidor se le deja al juego en localStorage, `ilogic.server`, como haria quien tiene
// el suyo). A crea la sala, B entra por el enlace de invitacion, juegan dos turnos cada uno, B pierde
// la conexion a mitad y vuelve, y al final los dos ven la misma partida.
//
//   npm run online     (compila dist-single y lo comprueba)
//
// Sale con error si algo no cuadra. Sin animaciones (ilogicDebug.freeze).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Un puerto libre del sistema. */
const freePort = () =>
  new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

/** Arranca `wrangler dev` en ese puerto y espera a que conteste. Devuelve como pararlo. */
async function startServer(port) {
  const args = ['wrangler', 'dev', '--port', String(port), '--inspector-port', '0', '--show-interactive-dev-session=false'];
  const child = spawn('npx', args, { cwd: `${root}server`, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let log = '';
  child.stdout.on('data', (chunk) => (log += chunk));
  child.stderr.on('data', (chunk) => (log += chunk));
  const stop = () => {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      // ya no estaba
    }
    if (failures.length || process.exitCode) console.log(`\nlo que dijo el servidor:\n${log}`);
  };
  // Listo cuando crea una sala y contesta rapido (las primeras peticiones de wrangler pueden tardar:
  // intenta traer el objeto `cf` de internet; aqui solo tiene que contestar lo local).
  const warmUp = { match: { seed: 1, size: 20, teams: [{ controller: 'human' }, { controller: 'ai' }] } };
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    try {
      const started = Date.now();
      const response = await fetch(`http://127.0.0.1:${port}/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(warmUp),
        signal: AbortSignal.timeout(5000),
      });
      if (response.status === 201 && Date.now() - started < 2000) return stop;
    } catch {
      // aun no escucha, o tarda demasiado
    }
    if (child.exitCode !== null) break;
    await sleep(500);
  }
  stop();
  throw new Error(`wrangler dev no ha arrancado en el puerto ${port}:\n${log}`);
}

/** Espera a que `fn` (en la pagina) devuelva algo verdadero. */
async function until(page, fn, what, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await page.evaluate(fn);
    if (value) return value;
    await sleep(100);
  }
  const state = await page.evaluate(() => ({
    screen: window.ilogicDebug.screen(),
    game: window.ilogicDebug.game(),
    net: window.ilogicDebug.ui().net,
    turn: window.ilogicDebug.ui().turn,
    online: window.ilogicDebug.ui().online.error,
    mode: window.ilogicDebug.ui().online.mode,
  }));
  throw new Error(`Esperando ${what}: no ha llegado en ${timeoutMs} ms (${JSON.stringify(state)})`);
}

async function open(browser, serverUrl, hash = '') {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => failures.push(`error en la pagina: ${e.message}`));
  await page.addInitScript((server) => {
    localStorage.setItem('ilogic.settings', JSON.stringify({ menuBg: 'classic', music: false, warnIdle: false }));
    // Sin niebla: los dos tienen que ver lo mismo, asi se puede comparar.
    localStorage.setItem('ilogic.newgame', JSON.stringify({ fog: false, size: 20, preset: 'custom' }));
    localStorage.setItem('ilogic.server', server);
  }, serverUrl);
  await page.goto(GAME + hash);
  await until(page, () => window.ilogicDebug && window.ilogic?.scene?.getScene('Menu')?.sys.isActive(), 'el menu');
  await page.evaluate(() => window.ilogicDebug.freeze());
  return page;
}

const ui = (page) => page.evaluate(() => window.ilogicDebug.ui());
const screen = (page) => page.evaluate(() => window.ilogicDebug.screen());
const game = (page) => page.evaluate(() => window.ilogicDebug.game());

/** Lo que los dos tienen que ver igual (sin niebla): unidades, dueños de los edificios, dia y turno. */
const comparable = (page) =>
  page.evaluate(() => {
    const s = window.ilogicDebug.state();
    return JSON.stringify({
      day: s.day,
      turn: s.turn,
      units: [...s.units].sort((a, b) => a.uid - b.uid).map((u) => [u.uid, u.type, u.team, u.x, u.y, u.life, u.turnState]),
      owners: s.buildings.map((b) => [b.x, b.y, b.owner]),
    });
  });

/** Espera a que le toque a la persona de esa pagina y hace algo: la primera unidad sin mover espera. */
async function playTurn(page, who) {
  await until(
    page,
    () => window.ilogicDebug.game() && !window.ilogicDebug.game().busy && window.ilogicDebug.ui().turn === 'own',
    `el turno de ${who}`,
    60000,
  );
  const acted = await page.evaluate(() => {
    const scene = window.ilogic.scene.getScene('Game');
    const s = window.ilogicDebug.state();
    const unit = s.units.find((u) => u.team === s.turn && u.turnState === 'ready');
    if (!unit) return null;
    const events = scene.act({ kind: 'wait', uid: unit.uid });
    return events ? unit.uid : null;
  });
  check(acted !== null, `${who} manda una accion en su turno`);
  await sleep(300);
  await page.evaluate(() => window.ilogic.scene.getScene('Game').turns.requestEndTurn());
  return acted;
}

const port = await freePort();
const serverUrl = `http://127.0.0.1:${port}`;
console.log(`servidor en ${serverUrl}`);
const stopServer = await startServer(port);
const browser = await chromium.launch();
try {
  // A crea una sala de dos personas.
  const a = await open(browser, serverUrl);
  await a.evaluate(() => window.ilogicDebug.ready());
  check((await ui(a)).home.online, 'con servidor configurado, Inicio ofrece «Jugar en línea»');
  await a.evaluate(() => window.ilogic.scene.getScene('Menu').home.actions().homePick('online'));
  check((await screen(a)) === 'online', 'se abre la pantalla de Jugar en línea');
  await a.evaluate(() => {
    const actions = window.ilogic.scene.getScene('Menu').online.actions();
    actions.onlinePick('create');
    actions.onlineSet('seat-1-kind', 0);
    actions.onlinePick('start');
  });
  const lobby = await until(
    a,
    () => {
      const online = window.ilogicDebug.ui().online;
      return online.lobby && online.lobby.seats.length === 2 && online.lobby.seats[1].invite ? online.lobby : null;
    },
    'el vestibulo con el enlace del asiento 2',
    60000,
  );
  check(/^[A-Z2-9]{6}$/.test(lobby.code), `la sala tiene codigo (${lobby.code})`);
  const invite = lobby.seats[1].invite;
  check(invite.includes(`#/sala/${lobby.code}/`), 'el enlace de invitacion lleva el codigo');
  check(lobby.seats[1].canHandToAi, 'quien crea puede dar a la IA el asiento que falta');

  // B entra por el enlace: con los dos dentro, la partida empieza en las dos pantallas.
  const b = await open(browser, serverUrl, invite.slice(invite.indexOf('#')));
  await until(b, () => window.ilogicDebug.screen() === 'game', 'la partida en B', 40000);
  await until(a, () => window.ilogicDebug.screen() === 'game', 'la partida en A', 40000);
  check((await ui(a)).net?.status === 'online', 'A ve la conexion');
  check((await ui(b)).net?.status === 'online', 'B ve la conexion');
  const rooms = await b.evaluate(() => JSON.parse(localStorage.getItem('ilogic.online.rooms')));
  check(rooms?.[0]?.code === lobby.code, 'B apunta la sala en «Mis partidas en línea»');

  // Dos turnos cada uno (empieza A; B mientras tanto espera, y lo dice).
  const waiting = await until(b, () => window.ilogicDebug.ui().net?.waiting ?? null, 'el cartel de espera en B');
  check(/1/.test(waiting), `B espera al equipo 1 («${waiting}»)`);
  await playTurn(a, 'A');
  await playTurn(b, 'B');
  await until(a, () => !window.ilogicDebug.game().busy, 'que vuelva a tocar a A', 60000);
  check((await comparable(a)) === (await comparable(b)), 'tras la primera ronda los dos ven lo mismo');

  // B pierde la conexion a mitad de la partida (un corte seco: el navegador no llega a despedirse) y vuelve sola.
  await b.evaluate(() => {
    const link = window.ilogic.scene.getScene('Game').online.link;
    const socket = link.socket;
    socket.close();
    socket.onclose({ code: 1006 });
  });
  await until(b, () => window.ilogicDebug.ui().net?.status === 'reconnecting', 'B reconectando', 10000);
  await until(b, () => window.ilogicDebug.ui().net?.status === 'online', 'B de vuelta', 20000);
  check(true, 'B ha vuelto a conectar sola');

  await playTurn(a, 'A');
  await playTurn(b, 'B');
  await until(a, () => !window.ilogicDebug.game().busy && window.ilogicDebug.game().day === 3, 'el dia 3 en A', 60000);
  await until(b, () => window.ilogicDebug.game().day === 3, 'el dia 3 en B', 60000);
  check((await comparable(a)) === (await comparable(b)), 'tras dos rondas (y la reconexion) los dos ven lo mismo');
  check((await game(a)).day === 3, 'van por el dia 3');

  // B vuelve a entrar desde cero por el enlace: la partida sigue desde el servidor.
  await b.goto(GAME + invite.slice(invite.indexOf('#')));
  await until(b, () => window.ilogicDebug && window.ilogicDebug.screen() === 'game', 'la partida en B tras recargar', 40000);
  await until(b, () => window.ilogicDebug.state()?.day === 3, 'el dia 3 en B tras recargar');
  check((await comparable(a)) === (await comparable(b)), 'tras recargar, B ve lo mismo que A');
} catch (error) {
  failures.push(String(error));
} finally {
  await browser.close();
  stopServer();
}

if (failures.length) {
  console.error(`\n${failures.length} fallo(s):\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log('\nTodo bien.');
