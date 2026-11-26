/* global window, document, localStorage, setTimeout, fetch, AbortSignal */
// Una partida por la red de punta a punta en la vista 3D: arranca el servidor de Node (con las salas
// en una carpeta temporal) y uno de desarrollo (vite), y juegan dos personas en dos navegadores de
// verdad: A crea la sala, B entra por el enlace de la sala (pide un asiento con el codigo), juegan
// turnos (los dos tienen que ver lo mismo), «Mis partidas» de A dice que le toca, B recarga la pagina a
// mitad (vuelve a la sala sola) y A se rinde (los dos ven el final, y «Mis partidas», que acabo).
// La sala de A no tiene reloj: no sale el reloj del turno. Despues, «Buscar rival»: C busca por turnos
// y espera en su sala, D busca y se queda su asiento (los dos ven «¡Rival encontrado!» mientras carga;
// la partida empieza en los dos, juega primero D y los dos ven su reloj de un dia contar), y E busca en
// vivo y cancela (la sala se cierra).
//
//   npm run online
//   ILOGIC_SERVER_URL=https://ilogic-servidor.<cuenta>.workers.dev npm run online   # contra el publicado
//
// Con ILOGIC_SERVER_URL no arranca el de Node: juega contra ese servidor (para comprobar el de
// Cloudflare tras publicarlo; el juego en localhost entra siempre por CORS).
//
// Deja capturas de cada pantalla en tests/visual/out/online-*.png, para mirar como se ve.
//
// Sin niebla, para poder comparar lo que ve cada uno. Lo que mira de la partida, por `window.ilogic3d`
// (docs/AGENTES.md); en el menu, el estado de la interfaz (el store, importado de vite: es su propio
// servidor, sin recargas en caliente, asi que el import da el mismo modulo que usa el juego).
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { freePort, startDevServer } from '../../tools/browser/devServer.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const OUT = `${root}tests/visual/out/`;
const VIEWPORT = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
const SERVER_START_MS = 60000;
const MATCH_START_MS = 60000;
const TURN_MS = 60000;
const ROUNDS = 2;
/** Lo que tarda «¡Rival encontrado!» en entrar (sus animaciones), para capturarlo quieto. */
const INTRO_SETTLE_MS = 900;

const failures = [];
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function check(condition, what) {
  console.log(`${condition ? 'ok  ' : 'MAL '} ${what}`);
  if (!condition) failures.push(what);
}

// --- Servidores ----------------------------------------------------------------------------------

/** El servidor de Node en un puerto libre, con las salas en una carpeta que se borra al acabar. */
async function startRoomServer() {
  const port = await freePort();
  const dataDir = mkdtempSync(join(tmpdir(), 'ilogic-salas-'));
  const env = { ...process.env, PORT: String(port), ILOGIC_DATA_DIR: dataDir, ILOGIC_WEB_DIR: '' };
  const child = spawn('npm', ['run', 'server:node'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let log = '';
  child.stdout.on('data', (chunk) => (log += chunk));
  child.stderr.on('data', (chunk) => (log += chunk));
  const stop = () => {
    killGroup(child);
    rmSync(dataDir, { recursive: true, force: true });
    if (failures.length) console.log(`\nlo que dijo el servidor:\n${log}`);
  };
  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + SERVER_START_MS;
  while (Date.now() < deadline && child.exitCode === null) {
    if (await answers(url)) return { url, stop };
    await sleep(300);
  }
  stop();
  throw new Error(`El servidor de Node no ha arrancado en ${url}:\n${log}`);
}

/** El servidor que diga ILOGIC_SERVER_URL (ya publicado: no hay nada que parar) o uno de Node. */
function roomServerToUse() {
  const published = process.env.ILOGIC_SERVER_URL;
  return published ? { url: published, stop: () => {} } : startRoomServer();
}

/** Contesta algo (sin el juego, la raiz es un 404: basta con que escuche). */
async function answers(url) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
}

/** Para npm y lo que haya arrancado (tsx, el servidor): van en su propio grupo de procesos. */
function killGroup(child) {
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    // ya no estaba
  }
}

// --- Paginas -------------------------------------------------------------------------------------

/** Antes de cargar: el servidor de salas, sin pedir confirmar el fin de turno y una partida pequeña sin niebla. */
function prepareStorage(server) {
  localStorage.setItem('ilogic.server', server);
  localStorage.setItem('ilogic.settings', JSON.stringify({ warnIdle: false, speedOwn: 'fast', speedEnemy: 'fast' }));
  localStorage.setItem('ilogic.newgame', JSON.stringify({ fog: false, size: 20, preset: 'custom' }));
}

/** Una persona: su propio navegador (contexto: sus propias salas apuntadas) en esa direccion. */
async function openPlayer(browser, name, url, server) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  await context.addInitScript(prepareStorage, server);
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`${name}: error en la pagina: ${error.message}`));
  await page.goto(url);
  return page;
}

/**
 * Espera a que `fn` (en la pagina, con `arg`) devuelva algo verdadero. Aguanta que la pagina se
 * recargue mientras (al empezar la partida, al volver a entrar).
 */
async function until(page, fn, arg, what, timeoutMs = TURN_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await page.evaluate(fn, arg).catch(() => null);
    if (value) return value;
    await sleep(150);
  }
  const seen = await page.evaluate(describePage).catch((error) => error.message);
  throw new Error(`Esperando ${what}: no ha llegado en ${timeoutMs} ms (${JSON.stringify(seen)})`);
}

/** Lo que se ve, para saber donde se ha quedado si algo no llega. */
async function describePage() {
  const game = window.ilogic3d;
  if (!game) {
    const { ui } = await import('/src/hud/store.ts');
    return { screen: ui.get().screen, online: ui.get().online };
  }
  const s = game.session.state;
  const { screen, net, toast } = game.ui.get();
  return { screen, net, toast, day: s.day, turn: s.turn, awaiting: game.session.awaitingInput, busy: game.controls.busy };
}

/** Una accion de la interfaz del menu (las que pulsan sus botones). */
async function menuAction(page, name, ...args) {
  await page.evaluate(
    async ({ name, args }) => {
      const { ui } = await import('/src/hud/store.ts');
      ui.actions[name](...args);
    },
    { name, args },
  );
}

/** Una captura de como se ve ahora esa pagina. */
async function shot(page, name) {
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: `${OUT}online-${name}.png` });
}

const menuState = (page) => page.evaluate(async () => (await import('/src/hud/store.ts')).ui.get());

// --- La partida ----------------------------------------------------------------------------------

/** En la partida, conectada y con la sala atendida. */
const inMatch = () => window.ilogic3d?.online && window.ilogic3d.ui.get().net?.status === 'online';

/** Le toca a quien mira esta pagina y no se esta animando nada. */
const ownTurnReady = () => {
  const game = window.ilogic3d;
  return game?.online && game.session.awaitingInput === game.viewer && !game.controls.busy;
};

/** El reloj del turno que se ve en la pantalla (la pastilla bajo el dia), o null si no sale. */
const turnClock = () => window.ilogic3d.ui.get().turnClock;

/** Los efectos que ha pedido la pagina de la partida desde que cargo (para comprobar el sonido sin oirlo). */
const heardSounds = () => window.ilogic3d.recentSounds().map((sound) => sound.name);

/** La partida suena al empezar en las dos pantallas (lo apunta el vestibulo y suena al cargar la partida). */
async function heardBegin(first, second, when) {
  const heard = await Promise.all([first.evaluate(heardSounds), second.evaluate(heardSounds)]);
  check(
    heard.every((names) => names.includes('match_begins')),
    `${when}, suena que la partida empieza en las dos pantallas`,
  );
}

/** El reloj, cuando ya ha cambiado de lo que enseñaba (`time`): cuenta. */
const clockMovedFrom = (time) => {
  const clock = window.ilogic3d.ui.get().turnClock;
  return clock && clock.time !== time ? clock : null;
};

/** Lo que tienen que ver igual los dos (sin niebla): dia, turno, unidades y dueños de los edificios. */
const comparable = () => {
  const s = window.ilogic3d.session.state;
  const units = [...s.units].sort((a, b) => a.uid - b.uid).map((u) => [u.uid, u.type, u.team, u.x, u.y, u.life, u.turnState]);
  return JSON.stringify({ day: s.day, turn: s.turn, units, owners: s.buildings.map((b) => [b.x, b.y, b.owner]) });
};

/**
 * Con niebla (las reglas de siempre, como en «Buscar rival») cada uno ve sus unidades y no las del
 * otro: lo que tienen que ver igual es el dia, el turno y los edificios con sus dueños.
 */
const comparableInFog = () => {
  const s = window.ilogic3d.session.state;
  const owners = s.buildings.map((building) => [building.x, building.y, building.owner]);
  return JSON.stringify({ day: s.day, turn: s.turn, owners });
};

/** Mueve la primera unidad propia que llega a una casilla vacia, como lo haria la persona (dos toques). */
async function moveOneUnit() {
  const rules = await import('/src/core/rules.ts');
  const { session, controls, viewer } = window.ilogic3d;
  const s = session.state;
  for (const unit of s.units.filter((candidate) => candidate.team === viewer && rules.canMoveNow(candidate))) {
    const goal = rules.reachableTiles(rules.moveRange(s, unit)).find((tile) => !rules.unitAt(s, tile));
    if (!goal) continue;
    await controls.tap({ x: unit.x, y: unit.y });
    await controls.tap(goal);
    return { uid: unit.uid, x: goal.x, y: goal.y };
  }
  return null;
}

/** La unidad esta en esa casilla en la partida que ve esta pagina. */
const unitIsAt = ({ uid, x, y }) => {
  const unit = window.ilogic3d.session.state.units.find((candidate) => candidate.uid === uid);
  return unit?.x === x && unit?.y === y;
};

/** Un turno: espera a que toque, mueve una unidad (la otra pagina lo ve) y lo acaba. */
async function playTurn(page, other, who) {
  await until(page, ownTurnReady, null, `el turno de ${who}`);
  const moved = await page.evaluate(moveOneUnit);
  check(moved !== null, `${who} mueve una unidad en su turno`);
  if (!moved) return;
  await until(page, unitIsAt, moved, `que el servidor dé por buena la jugada de ${who}`);
  await until(other, unitIsAt, moved, `que la otra pagina vea la jugada de ${who}`);
  await until(page, () => !window.ilogic3d.controls.busy, null, `que acabe la animacion de ${who}`);
  await page.evaluate(() => window.ilogic3d.controls.endTurn());
}

/** Los dos ven la misma partida (cuando los dos han acabado de animar); `view`, lo que se compara de ella. */
async function sameMatch(a, b, when, view = comparable) {
  const deadline = Date.now() + TURN_MS;
  let seen = [];
  while (Date.now() < deadline) {
    seen = await Promise.all([a.evaluate(view), b.evaluate(view)]).catch(() => []);
    if (seen.length && seen[0] === seen[1]) return check(true, `${when}, los dos ven lo mismo`);
    await sleep(200);
  }
  check(false, `${when}, los dos ven lo mismo\n  A: ${seen[0]}\n  B: ${seen[1]}`);
}

/** Rendirse desde la pausa (pide pulsarlo dos veces). */
const surrenderFromPause = () => {
  const { pause, ui } = window.ilogic3d;
  pause.open();
  const index = ui.get().menu.items.findIndex((item) => item.id === 'surrender');
  if (index < 0) return false;
  pause.pick(index);
  pause.pick(index);
  return true;
};

const endOutcome = () => window.ilogic3d?.ui.get().screen === 'end' && window.ilogic3d.ui.get().end.outcome;

/** El vestibulo, cuando ya sabe quien hay en la sala (y tiene su enlace). */
async function lobbyWithSeats() {
  const lobby = (await import('/src/hud/store.ts')).ui.get().online?.lobby;
  return lobby?.link && lobby.seats.length > 0 ? lobby : null;
}

/** El vestibulo de la propia busqueda de rival, cuando ya sabe quien hay en la sala. */
async function searchingLobby() {
  const lobby = (await import('/src/hud/store.ts')).ui.get().online?.lobby;
  return lobby?.searching && lobby.seats.length > 0 ? lobby : null;
}

/** «¡Rival encontrado!» mientras carga la partida recien emparejada (null si se ve otra cosa). */
async function foundIntro() {
  const s = (await import('/src/hud/store.ts')).ui.get();
  return s.screen === 'loading' && s.intro ? s.intro : null;
}

/** La entrada «En línea» de Inicio, cuando ya dice que te toca (null si aun no). */
async function homeEntryYourTurn() {
  const entry = (await import('/src/hud/store.ts')).ui.get().home.entries.find((candidate) => candidate.id === 'online');
  return entry?.urgent ? entry : null;
}

/** El tablero 3D del fondo del menu ya se ve: tiene lienzo y despues ha pasado un fotograma entero. */
const menuBoardDrawn = () =>
  document.querySelector('#game canvas') !== null &&
  new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve(true))));

/**
 * El menu de inicio de `who`, ya listo: con la entrada «En línea» y el tablero del fondo dibujado (montar
 * la escena 3D bloquea la pagina un rato, mucho mas sin GPU: hasta entonces ni se pulsa ni se captura).
 */
async function menuReady(page, who) {
  await until(page, () => document.querySelector('.entry-online') !== null, null, `el menu en ${who}`);
  await until(page, menuBoardDrawn, null, `el tablero del fondo del menu en ${who}`, MATCH_START_MS);
}

/** «Jugar en línea» esta en su menu (no en el vestibulo de una sala). */
const isOnlineMenu = async () => (await import('/src/hud/store.ts')).ui.get().online?.mode === 'menu';

/** La linea de la sala `code` en «Mis partidas», cuando ya se sabe lo que dice el servidor de ella. */
async function knownRoomLine(code) {
  const rooms = (await import('/src/hud/store.ts')).ui.get().online?.rooms ?? [];
  const line = rooms.find((room) => room.code === code);
  return line && line.state !== 'unknown' ? line : null;
}

// --- El guion ------------------------------------------------------------------------------------

/** Donde se pulsa la entrada «En línea» de Inicio: su nombre o la linea de debajo (el clic sube al mismo boton). */
const ONLINE_ENTRY_SPOTS = {
  title: { selector: '.entry-online .text-entry-title', name: 'su nombre' },
  note: { selector: '.entry-online .text-entry-note', name: 'la linea de debajo' },
};

/** Cuantas veces se usa algo de Inicio desde ahora (lo que hace la entrada al pulsarla). */
async function countHomePicks(page) {
  await page.evaluate(async () => {
    const { ui } = await import('/src/hud/store.ts');
    const homePick = ui.actions.homePick;
    window.homePicks = 0;
    ui.actions.homePick = (id) => {
      window.homePicks++;
      homePick(id);
    };
  });
}

/**
 * Del menu de inicio a «Jugar en línea», con un clic de verdad en su entrada: se usa una sola vez
 * (pulsar el texto de dentro sube hasta el boton, y no tiene que abrirse dos veces).
 */
async function openOnline(page, who, spot = 'title') {
  await menuReady(page, who);
  check((await menuState(page)).screen === 'menu', `${who} esta en el menu de inicio`);
  await countHomePicks(page);
  const { selector, name } = ONLINE_ENTRY_SPOTS[spot];
  await page.click(selector);
  const picks = await page.evaluate(() => window.homePicks);
  check(picks === 1, `pulsar ${name} de «En línea» la usa una vez en ${who} (${picks})`);
  check((await menuState(page)).online?.error === null, `con servidor, «Jugar en línea» se abre sin aviso en ${who}`);
}

/** A crea una partida de dos personas y espera en el vestibulo: devuelve el vestibulo (con el enlace de la sala). */
async function createRoom(a) {
  await openOnline(a, 'A');
  await shot(a, 'menu');
  await a.setViewportSize(PHONE);
  await shot(a, 'menu-movil');
  await a.setViewportSize(VIEWPORT);
  await menuAction(a, 'onlinePick', 'create');
  const create = (await menuState(a)).online.create;
  check(create.seats[1]?.index === 0, 'sin tocar nada, el otro asiento es de una persona (no de la IA)');
  await shot(a, 'crear');
  await menuAction(a, 'onlinePick', 'start');
  const lobby = await until(a, lobbyWithSeats, null, 'el vestibulo con el enlace de la sala');
  await shot(a, 'vestibulo');
  await a.setViewportSize(PHONE);
  await shot(a, 'vestibulo-movil');
  await a.setViewportSize(VIEWPORT);
  check(/^[A-Z2-9]{6}$/.test(lobby.code), `la sala tiene codigo (${lobby.code})`);
  check(lobby.link.endsWith(`#/sala/${lobby.code}`), 'el enlace de la sala lleva el codigo y ninguna ficha');
  return lobby;
}

/**
 * «Mis partidas» de A en otra pestaña (sin entrar en la sala): la linea de la sala dice `state` y, si
 * le toca, ya lo dice la entrada «En línea» de Inicio.
 */
async function checkMyRooms(a, gameUrl, code, state, name) {
  const page = await a.context().newPage();
  await page.goto(gameUrl);
  await menuReady(page, 'otra pestaña de A');
  if (state === 'yourTurn') {
    const entry = await until(page, homeEntryYourTurn, null, 'que la entrada «En línea» de Inicio diga que le toca');
    check(true, `la entrada «En línea» de Inicio de A dice «${entry.note}»`);
    await shot(page, 'inicio-te-toca');
  }
  await menuAction(page, 'homePick', 'online');
  const line = await until(page, knownRoomLine, code, `la sala en «Mis partidas» (${state})`);
  check(line.state === state, `«Mis partidas» de A dice «${line.title}» (${line.detail})`);
  await shot(page, name);
  await page.close();
}

async function playOnline(browser, gameUrl, server) {
  const a = await openPlayer(browser, 'A', gameUrl, server);
  const lobby = await createRoom(a);
  const b = await openPlayer(browser, 'B', lobby.link, server);
  await until(b, inMatch, null, 'la partida en B', MATCH_START_MS);
  await until(a, inMatch, null, 'la partida en A', MATCH_START_MS);
  check(true, 'con los dos dentro, la partida empieza en las dos pantallas');
  await heardBegin(a, b, 'al entrar B');
  const rooms = await b.evaluate(() => JSON.parse(localStorage.getItem('ilogic.online.rooms') ?? '[]'));
  check(rooms[0]?.code === lobby.code, 'B apunta la sala en «Mis partidas en línea»');
  const waiting = await until(b, () => window.ilogic3d.ui.get().net?.waiting, null, 'el cartel de espera en B');
  check(/1/.test(waiting), `B espera al equipo 1 («${waiting}»)`);
  await until(a, ownTurnReady, null, 'el primer turno de A');
  const clocks = await Promise.all([a.evaluate(turnClock), b.evaluate(turnClock)]);
  check(
    clocks.every((clock) => clock === null),
    'la sala no tiene reloj: no sale el reloj del turno en ninguna pantalla',
  );
  await Promise.all([shot(a, 'a-su-turno'), shot(b, 'b-espera')]);
  await checkMyRooms(a, gameUrl, lobby.code, 'yourTurn', 'mis-partidas-te-toca');
  await b.setViewportSize(PHONE);
  await shot(b, 'b-espera-movil');
  await b.setViewportSize(VIEWPORT);

  for (let round = 1; round <= ROUNDS; round++) {
    await playTurn(a, b, 'A');
    await playTurn(b, a, 'B');
    await until(a, ownTurnReady, null, 'que vuelva a tocar a A');
    await sameMatch(a, b, `tras la ronda ${round}`);
  }

  // B recarga a mitad del turno de A: la partida sigue en su pagina y vuelve a la sala sola.
  await b.reload();
  await until(b, inMatch, null, 'que B vuelva a la sala tras recargar', MATCH_START_MS);
  check(true, 'B recarga la pagina y vuelve a la partida');
  check(!(await b.evaluate(heardSounds)).includes('match_begins'), 'al volver tras recargar, B no la oye empezar otra vez');
  await shot(b, 'b-tras-recargar');
  await sameMatch(a, b, 'tras recargar B');
  await playTurn(a, b, 'A');
  await until(b, ownTurnReady, null, 'el turno de B tras recargar');
  await sameMatch(a, b, 'con el turno de B tras recargar');
  await b.evaluate(() => window.ilogic3d.controls.endTurn());

  // A se rinde: la sala acaba y los dos ven el final.
  await until(a, ownTurnReady, null, 'el turno de A para rendirse');
  check(await a.evaluate(surrenderFromPause), 'A encuentra «Rendirse» en la pausa');
  check((await until(a, endOutcome, null, 'el final en A')) === 'lost', 'A ve que ha perdido');
  check((await until(b, endOutcome, null, 'el final en B')) === 'won', 'B ve que ha ganado');
  await Promise.all([shot(a, 'a-final'), shot(b, 'b-final')]);
  await checkMyRooms(a, gameUrl, lobby.code, 'ended', 'mis-partidas-acabada');
}

/** «Buscar rival»: C espera por turnos y D llega (la partida empieza, y juega primero D); E busca en vivo y cancela. */
async function searchRivals(browser, gameUrl, server) {
  const c = await openPlayer(browser, 'C', gameUrl, server);
  await openOnline(c, 'C', 'note');
  await menuAction(c, 'onlinePick', 'pace-daily');
  await menuAction(c, 'onlinePick', 'search');
  const daily = await until(c, searchingLobby, null, 'el vestibulo de la busqueda de C');
  check(!daily.canInvite, 'buscando rival no se invita: no hay enlace que repartir');
  check((daily.seats[1]?.handToAiId ?? null) !== null, `C puede jugar contra la IA mientras espera («${daily.handToAiLabel}»)`);
  await shot(c, 'buscando');
  await c.setViewportSize(PHONE);
  await shot(c, 'buscando-movil');
  await c.setViewportSize(VIEWPORT);

  const d = await openPlayer(browser, 'D', gameUrl, server);
  await openOnline(d, 'D');
  await menuAction(d, 'onlinePick', 'pace-daily');
  await menuAction(d, 'onlinePick', 'search');
  // Al emparejar, la carga de la partida de los dos es «¡Rival encontrado!» (se ve un rato corto: se captura al verla).
  const [introD, introC] = await Promise.all([
    until(d, foundIntro, null, '«¡Rival encontrado!» en D', MATCH_START_MS).then(async (intro) => {
      await sleep(INTRO_SETTLE_MS);
      await shot(d, 'rival-encontrado');
      return intro;
    }),
    until(c, foundIntro, null, '«¡Rival encontrado!» en C', MATCH_START_MS).then(async (intro) => {
      await c.setViewportSize(PHONE);
      await sleep(INTRO_SETTLE_MS);
      await shot(c, 'rival-encontrado-movil');
      await c.setViewportSize(VIEWPORT);
      return intro;
    }),
  ]);
  check(introD.youStart && !introC.youStart, '«¡Rival encontrado!» en los dos al cargar: D sabe que empieza y C, que empieza el rival');
  check(introD.chips.join() === introC.chips.join(), `los dos ven lo mismo de la partida (${introD.chips.join(' · ')})`);
  await until(d, inMatch, null, 'la partida en D', MATCH_START_MS);
  await until(c, inMatch, null, 'la partida en C', MATCH_START_MS);
  check(true, 'D se queda el asiento de la sala de C: la partida empieza en las dos pantallas');
  await heardBegin(c, d, 'al emparejar');
  await until(d, ownTurnReady, null, 'el primer turno de D (quien llega juega primero)');
  await sameMatch(c, d, 'al emparejar', comparableInFog);
  await shot(d, 'd-emparejado');
  await checkTurnClocks(d, c);

  const e = await openPlayer(browser, 'E', gameUrl, server);
  await openOnline(e, 'E');
  await menuAction(e, 'onlinePick', 'pace-live');
  await shot(e, 'menu-en-vivo');
  await menuAction(e, 'onlinePick', 'search');
  const live = await until(e, searchingLobby, null, 'el vestibulo de la busqueda en vivo de E');
  check(live.code !== daily.code && live.searching !== daily.searching, `E busca en vivo en su propia sala («${live.searching}»)`);
  await shot(e, 'buscando-en-vivo');
  await menuAction(e, 'onlinePick', 'cancelSearch');
  await until(e, isOnlineMenu, null, 'que E vuelva al menu al cancelar');
  check((await fetch(`${server}/rooms/${live.code}`)).status === 404, 'al cancelar, la sala de E se cierra en el servidor');
  const rooms = (await menuState(e)).online.rooms;
  check(!rooms.some((room) => room.code === live.code), 'y sale de «Mis partidas» de E');
}

/**
 * Por turnos, el reloj (un dia) sale y cuenta en las dos pantallas: en la de quien juega, azul con el
 * dia; en la del rival, oscuro («Juega el rojo»).
 */
async function checkTurnClocks(player, rival) {
  const [own, other] = await Promise.all([player.evaluate(turnClock), rival.evaluate(turnClock)]);
  check(own?.mood === 'calm' && /^2[34]:\d\d:\d\d$/.test(own.time), `D ve su reloj de un dia («${own?.time} · ${own?.caption}»)`);
  check(other?.mood === 'waiting' && other.side === 'enemy', `C ve el reloj del turno de D («${other?.time} · ${other?.caption}»)`);
  const [ownLater, otherLater] = await Promise.all([
    until(player, clockMovedFrom, own?.time ?? '', 'que el reloj de D cuente'),
    until(rival, clockMovedFrom, other?.time ?? '', 'que el reloj de C cuente'),
  ]);
  check(
    ownLater.time < own.time && otherLater.time < other.time,
    `los dos relojes cuentan hacia atras (${ownLater.time}, ${otherLater.time})`,
  );
  await Promise.all([shot(player, 'd-reloj'), shot(rival, 'c-reloj')]);
}

const roomServer = await roomServerToUse();
console.log(`salas en ${roomServer.url}`);
const dev = await startDevServer();
console.log(`juego en ${dev.url}`);
const browser = await chromium.launch();
try {
  await playOnline(browser, dev.url, roomServer.url);
  await searchRivals(browser, dev.url, roomServer.url);
} catch (error) {
  failures.push(error.message);
  console.log(`MAL  ${error.message}`);
} finally {
  await browser.close();
  dev.stop();
  roomServer.stop();
}
console.log(failures.length ? `\n${failures.length} fallos` : '\nTodo bien');
process.exitCode = failures.length ? 1 : 0;
