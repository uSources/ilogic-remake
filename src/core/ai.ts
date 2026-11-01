/**
 * Inteligencia artificial del rival (IA.java), con sus fallos corregidos.
 * Cada unidad decide sola, en orden: retirarse (si esta debil o sin combustible),
 * atacar, capturar, avanzar hacia edificios ajenos y, si nada de eso, moverse al azar.
 * Al final fabrica unidades en sus edificios.
 * Es un generador: devuelve un GameEvent tras cada accion para que la interfaz la anime.
 */
import { aiGeneral } from './aiGenerals';
import { AI, BUILDING, HEALER, HQ, RULES, POWER, UNIT, UNIT_SUPPORT, Movement } from './data';
import { diamond, grid, manhattan, samePos } from './geom';
import {
  attackEvent,
  buildingAt,
  buyOptions,
  buildingIncome,
  upkeepOf,
  type BuyOption,
  canCapture,
  capture,
  expectedDamage,
  groundDistance,
  inAttackRange,
  merge,
  mergeTargets,
  moveRange,
  moveUnit,
  occupancy,
  spawn,
  teamUnits,
  unitAt,
  unitById,
  visibility,
  wait,
  type MoveRange,
  canCounter,
  captureProgress,
  captureEvent,
  moveEvent,
  reachableTiles,
} from './rules';
import { sameFormation } from './squads';
import type { Building, GameEvent, GameState, Pos, Rng, Team, Unit } from './types';

/**
 * Bando que juega el turno en curso. Se fija al empezar aiTurn; un turno de IA termina
 * antes de empezar el siguiente, asi que no se mezclan.
 */
let ME: Team = 1;

/** Ocupacion sin contar a la propia unidad (para medir distancias desde su sitio). */
function occupancyWithout(s: GameState, u: Unit): boolean[][] {
  const occ = occupancy(s);
  occ[u.x]![u.y] = false;
  return occ;
}

/**
 * Mejor casilla alcanzable este turno para acercarse a `dest` (IA.getBestMove).
 * [CAMBIO] la cercania se mide con el tipo de movimiento de la unidad (antes siempre "a pie")
 * y si ya esta tan cerca como puede, se queda.
 */
function bestMoveToward(s: GameState, u: Unit, dest: Pos, range: MoveRange, avoidDest = false): Pos | null {
  if (samePos(u, dest) && !avoidDest) return null;
  if (!avoidDest && range.steps[dest.x]![dest.y]! > 0) return dest;
  const dd = groundDistance(s, dest, Movement.of(u.type), occupancyWithout(s, u));
  let best: Pos | null = null;
  let bestD = dd[u.x]![u.y]! || Infinity;
  for (let x = 0; x < dd.length; x++) {
    for (let y = 0; y < dd[x]!.length; y++) {
      const d = dd[x]![y]!;
      if (range.steps[x]![y]! > 0 && d > 0 && d < bestD && !(avoidDest && x === dest.x && y === dest.y)) {
        best = { x, y };
        bestD = d;
      }
    }
  }
  return best;
}

/** Mueve y avisa. Devuelve true si ha caido en una emboscada (la unidad ya no puede hacer nada). */
function* doMove(s: GameState, u: Unit, dest: Pos | null, range: MoveRange): Generator<GameEvent, boolean> {
  if (!dest) return false;
  const path = moveUnit(s, u, dest, range);
  if (!path) return false;
  yield moveEvent(u.uid, path);
  return !!path.ambush;
}

/** Necesita volver a curarse a un edificio. */
const needsRepair = (u: Unit): boolean => u.life < AI.LIFETOBACK;

function repairsHere(s: GameState, u: Unit, x: number, y: number): boolean {
  const b = buildingAt(s, x, y);
  return !!b && b.owner === u.team && HEALER[u.type]![b.type]! && BUILDING.heals[b.type]! > 0;
}

function* retreat(s: GameState, u: Unit, range: MoveRange): Generator<GameEvent, boolean> {
  // 1) Unirse a una unidad igual si la suma de vidas no pasa de 130.
  const mates = mergeTargets(s, u, range).filter((o) => o.life + u.life <= AI.MAXMERGELIFE);
  if (mates.length) {
    const target = mates.sort((a, b) => manhattan(u, a) - manhattan(u, b))[0]!;
    const path = merge(s, u, target);
    if (path) {
      if (path.ambush) yield moveEvent(u.uid, path);
      else yield { kind: 'merge', uid: u.uid, into: target.uid, path };
      return true;
    }
  }

  // 2) [CAMBIO] Si ya esta en un edificio que la repara, se queda (antes se marchaba a otro).
  if (repairsHere(s, u, u.x, u.y)) {
    wait(u);
    return true;
  }
  // 3) Ir al edificio propio mas cercano que la repare y este libre.
  const dist = groundDistance(s, u, Movement.of(u.type));
  let goal: Pos | null = null;
  let goalD = Infinity;
  for (const b of s.buildings) {
    if (!repairsHere(s, u, b.x, b.y)) continue;
    const d = dist[b.x]![b.y]!;
    if (d > 0 && d < goalD) {
      goal = b;
      goalD = d;
    }
  }
  if (!goal) return false;
  yield* doMove(s, u, bestMoveToward(s, u, goal, range), range);
  wait(u);
  return true;
}

/** Valor de un ataque: dano esperado ponderado por el precio del objetivo, y extra si lo mata. */
function attackScore(s: GameState, u: Unit, t: Unit, from: Pos = u): number {
  const atk = { ...u, x: from.x, y: from.y };
  const dmg = expectedDamage(s, atk, t);
  const value = UNIT.cost[t.type]! / AI.COSTSCALE;
  // [CAMBIO] Con botin, destruirla ademas da dinero (100 de vida = su precio entero).
  let score = dmg * value + (dmg >= t.life ? (AI.KILLBONUS + 100 * RULES.bounty) * value : 0);
  // [CAMBIO] Reglas nuevas: restar lo que devolveria el contraataque.
  if (RULES.counterattack && dmg < t.life) {
    const left = { ...t, life: Math.max(1, Math.round(t.life - dmg)) };
    if (canCounter(left, atk)) score -= expectedDamage(s, left, atk) * (UNIT.cost[u.type]! / AI.COSTSCALE);
  }
  // Quien defiende su Base encima de ella impide capturarla: hay que echarlo aunque cueste.
  const tb = buildingAt(s, t.x, t.y);
  if (tb && tb.type === HQ && tb.owner === t.team) score += AI.HQDEFENDER * Math.max(0.5, dmg / AI.BONUSDAMAGE);
  // Echar a quien esta capturando un edificio propio (sobre todo la Base).
  const b = buildingAt(s, t.x, t.y);
  if (b && b.owner === ME && captureProgress(s, b))
    score += (b.type === HQ ? AI.STOPCAPTUREHQ : AI.STOPCAPTURE) * Math.max(0.5, dmg / AI.BONUSDAMAGE);
  return score;
}

/**
 * Opciones de tryAttack para las ordenes del jugador: `zone` limita a que enemigos se mira (defender),
 * `chase: false` no persigue a nadie fuera de tiro y `stay` solo dispara desde donde esta.
 */
interface AttackOpts {
  zone?: (t: Unit) => boolean;
  chase?: boolean;
  stay?: boolean;
  /** Casillas desde las que puede disparar si se mueve (formacion: sin adelantarse a su escuadra). */
  from?: (p: Pos) => boolean;
}

/** Atacar al mejor objetivo a tiro o, si no hay, acercarse al mas cercano (ver AttackOpts). */
function* tryAttack(s: GameState, u: Unit, range: MoveRange, rng: Rng, opts: AttackOpts = {}): Generator<GameEvent, boolean> {
  const { zone, chase: follow = true, stay = false, from: allowed } = opts;
  // [CAMBIO] el original atacaba aunque la unidad no pudiera luchar o no hiciera dano.
  if (!UNIT.canfight[u.type] || !u.canFire) return false;
  const vis = visibility(s, ME);
  const reach = UNIT.mover[u.type]! + UNIT.alcance[u.type]!;
  const enemies = s.units.filter(
    (t) => t.team !== ME && t.carrier === null && t.life > 0 && vis[t.x]![t.y] && manhattan(u, t) <= reach && (!zone || zone(t)),
  );
  if (!enemies.length) return false;

  // Opciones: (casilla desde la que dispara, objetivo). Las unidades a distancia no pueden mover y disparar.
  let best: { from: Pos; target: Unit; score: number } | null = null;
  const ranged = UNIT.minalc[u.type]! > 0;
  const froms: Pos[] = [{ x: u.x, y: u.y }];
  if (!ranged && !stay) {
    froms.push(...reachableTiles(range).filter((p) => !allowed || allowed(p)));
  }
  for (const t of enemies) {
    for (const from of froms) {
      if (!inAttackRange(u.type, from, t)) continue;
      const score = attackScore(s, u, t, from);
      if (score <= 0) continue;
      // A igualdad, preferir no moverse o la casilla con mas defensa (menor multiplicador).
      if (!best || score > best.score) best = { from, target: t, score };
    }
  }
  if (best) {
    if (yield* doMove(s, u, samePos(best.from, u) ? null : best.from, range)) return true;
    yield attackEvent(s, u, best.target, rng);
    return true;
  }
  // Nadie a tiro este turno: acercarse al enemigo visible mas cercano al que pueda danar.
  if (!follow) return false;
  const chase = enemies.filter((t) => attackTargetsPossible(u, t)).sort((a, b) => manhattan(u, a) - manhattan(u, b))[0];
  if (!chase) return false;
  yield* doMove(s, u, bestMoveToward(s, u, chase, range), range);
  wait(u);
  return true;
}

/** El atacante puede hacer dano a ese tipo de unidad. */
function attackTargetsPossible(u: Unit, t: Unit): boolean {
  return UNIT.canfight[u.type]! && POWER[u.type]![t.type]! > 0;
}

/** Capturar el edificio de debajo y avisar a la interfaz. */
function* captureHere(s: GameState, u: Unit): Generator<GameEvent, boolean> {
  if (!canCapture(s, u)) return false;
  const b = buildingAt(s, u.x, u.y)!;
  const r = capture(s, u);
  if (!r) return false;
  yield captureEvent(u, b, r);
  return true;
}

function* tryCapture(s: GameState, u: Unit, range: MoveRange): Generator<GameEvent, boolean> {
  if (!UNIT.cancapt[u.type]) return false;
  if (yield* captureHere(s, u)) return true;
  const vis = visibility(s, ME);
  const dist = groundDistance(s, u, Movement.of(u.type));
  let goal: Pos | null = null;
  let goalD = Infinity;
  for (const p of diamond(u, 1, AI.MAXCAPTDIST)) {
    const b = buildingAt(s, p.x, p.y);
    if (!b || b.owner === ME || !vis[p.x]![p.y]) continue;
    const occupant = unitAt(s, p.x, p.y);
    if (occupant && occupant.team === ME) continue;
    const d = dist[p.x]![p.y]!;
    // La Base enemiga vale mas: se cuenta como si estuviera mas cerca.
    const score = d - (b.type === HQ ? 4 : 0);
    if (d > 0 && score < goalD) {
      goal = p;
      goalD = score;
    }
  }
  if (!goal) return false;
  yield* doMove(s, u, bestMoveToward(s, u, goal, range), range);
  if (!(yield* captureHere(s, u))) wait(u);
  return true;
}

/**
 * Avanzar: las unidades que capturan van al edificio ajeno mas cercano; las demas, hacia
 * la unidad del jugador mas cercana o, si no hay, hacia su Base.
 * [CAMBIO] en el original este paso casi nunca se activaba y la IA paseaba al azar.
 */
function* advance(s: GameState, u: Unit, range: MoveRange): Generator<GameEvent, boolean> {
  const dist = groundDistance(s, u, Movement.of(u.type), occupancyWithout(s, u));
  // Las que capturan: edificios ajenos, con prioridad a la Base enemiga y a los del jugador.
  const bonus = (g: Pos): number => {
    const b = buildingAt(s, g.x, g.y);
    if (!b || !UNIT.cancapt[u.type]) return 0;
    return b.type === HQ && b.owner !== null ? AI.CAPTUREHQ : b.owner !== null ? AI.CAPTUREOWNED : 0;
  };
  const vis = visibility(s, ME);
  const goals: Pos[] = UNIT.cancapt[u.type]
    ? s.buildings.filter((b) => b.owner !== ME)
    : [
        ...s.units.filter((o) => o.team !== ME && o.carrier === null && vis[o.x]![o.y] && attackTargetsPossible(u, o)),
        ...s.buildings.filter((b) => b.owner !== ME && b.owner !== null && b.type === HQ),
      ];
  let goal: Pos | null = null;
  let goalD = Infinity;
  for (const g of goals) {
    // Distancia por tierra a la casilla o, si esta ocupada, a una vecina.
    let d = dist[g.x]![g.y]!;
    if (d === 0) {
      for (const p of diamond(g, 1, 1)) {
        const dn = dist[p.x]![p.y]!;
        if (dn > 0 && (d === 0 || dn < d)) d = dn;
      }
    }
    if (d > 0 && d - bonus(g) < goalD) {
      goal = g;
      goalD = d - bonus(g);
    }
  }
  if (!goal) return false;
  // [CAMBIO] Una unidad que no captura no se queda encima de la Base enemiga (taparia a los que si).
  const blocks = !UNIT.cancapt[u.type] && !!buildingAt(s, goal.x, goal.y);
  const dest = bestMoveToward(s, u, goal, range, blocks);
  if (!dest) return false;
  yield* doMove(s, u, dest, range);
  wait(u);
  return true;
}

/** [CAMBIO] eleccion uniforme (el original nunca elegia la ultima casilla). */
function* randomMove(s: GameState, u: Unit, range: MoveRange, rng: Rng): Generator<GameEvent> {
  const options: Pos[] = reachableTiles(range);
  if (options.length) yield* doMove(s, u, options[Math.floor(rng() * options.length)]!, range);
  wait(u);
}

/** Tipos que no combaten ("ai": { "support": true } en units.json): como mucho uno de cada a la vez. */
const SUPPORT_TYPES = new Set<number>(UNIT_SUPPORT.flatMap((sup, i) => (sup ? [i] : [])));

/**
 * Fabricar en cada edificio propio libre.
 * [CAMBIO] el original elegia al azar entre todo lo pagable y acababa lleno de unidades que
 * no combaten. Ahora: elige al azar dando mas peso a lo mas caro, sin repetir unidades de
 * apoyo, y asegura infanteria para capturar.
 */
function weightedPick<T>(items: readonly T[], weights: readonly number[], rng: Rng): T {
  let r = rng() * weights.reduce((a, w) => a + w, 0);
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r < 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

/** Un edificio que fabrica algo de este precio o mas fabrica "lo grande" (Fabrica, Aeropuerto). */
const BIG_UNIT = 10000;

function* produce(s: GameState, rng: Rng): Generator<GameEvent> {
  // [CAMBIO] Con puntos de mando el ejercito tiene tope y gastarlo todo cada turno lo llena de
  // soldados de 1 punto. Entonces elige entre todo lo que cabe (no solo lo que puede pagar), empieza
  // por los edificios que fabrican lo grande y, si lo elegido aun no se paga, ahorra ese turno.
  // [CAMBIO] Los edificios de lo grande (Fabrica, Aeropuerto) van en orden al azar: si el Aeropuerto
  // (Caza, 20000) iba siempre primero se llevaba el dinero o el ahorro y la Fabrica casi nunca podia
  // pagar un Tanque (0,3 % de las compras; ver balance/reports/tanques-vs-infanteria.md).
  const limited = RULES.commandPoints !== null;
  const top = (b: Building) => Math.max(0, ...buyOptions(s, b).map((o) => o.cost));
  const key = new Map(s.buildings.map((b) => [b, top(b) >= BIG_UNIT ? BIG_UNIT + rng() : top(b) / BIG_UNIT]));
  const order = limited ? [...s.buildings].sort((x, y) => key.get(y)! - key.get(x)!) : s.buildings;
  const income = s.buildings.reduce((n, b) => n + (b.owner === ME ? buildingIncome(b.type) : 0), 0) - upkeepOf(s, ME);
  for (const b of order) {
    if (b.owner !== ME || teamUnits(s, ME).length >= RULES.maxUnits || unitAt(s, b.x, b.y)) continue;
    const mine = teamUnits(s, ME);
    const fits = (o: BuyOption) => (limited ? o.blocked === undefined || o.blocked === 'funds' : o.affordable);
    let opts = buyOptions(s, b).filter((o) => fits(o) && !(SUPPORT_TYPES.has(o.type) && mine.some((u) => u.type === o.type)));
    if (!opts.length) continue;
    const capturers = mine.filter((u) => UNIT.cancapt[u.type]).length;
    if (capturers < AI.MINCAPTURERS && opts.some((o) => UNIT.cancapt[o.type] && o.affordable))
      opts = opts.filter((o) => UNIT.cancapt[o.type] && o.affordable);
    const weights = opts.map((o) => Math.sqrt(o.cost));
    let pick = weightedPick(opts, weights, rng);
    if (!pick.affordable) {
      if (pick.cost <= s.funds[ME] + income) break; // se paga el turno que viene: ahorrar para ello
      const can = opts.filter((o) => o.affordable);
      if (!can.length) continue;
      pick = weightedPick(
        can,
        can.map((o) => Math.sqrt(o.cost)),
        rng,
      );
    }
    const u = spawn(s, b, pick.type);
    if (u) yield { kind: 'spawn', uid: u.uid, at: { x: b.x, y: b.y } };
  }
}

/** Turno completo de la IA. Deja todas sus unidades inactivas; el mantenimiento va aparte (endRound). */
export function* aiTurn(s: GameState, rng: Rng = Math.random, team: Team = 1): Generator<GameEvent> {
  ME = team;
  // [CAMBIO] Primero el general (una habilidad, si merece la pena): ver aiGenerals.ts.
  yield* aiGeneral(s, ME);
  const order = teamUnits(s, ME).map((u) => u.uid);
  for (const uid of order) yield* unitTurn(s, uid, rng);
  yield* produce(s, rng);
  for (const u of teamUnits(s, ME)) wait(u);
}

/**
 * [CAMBIO] Ordenes del jugador (al terminar su turno): las unidades con orden con destino
 * (Unit.command) que siguen sin usar la cumplen. No toca las demas unidades ni compra nada.
 * Devuelve los uid de las que han cumplido su orden este turno (se quedan esperando otra).
 */
export function* assistTurn(s: GameState, rng: Rng = Math.random, team: Team = 0): Generator<GameEvent, number[]> {
  ME = team;
  const done: number[] = [];
  for (const u of commandOrder(
    s,
    teamUnits(s, ME).filter((u) => u.command),
  ))
    if (yield* commandTurn(s, u.uid, rng)) done.push(u.uid);
  return done;
}

// ---------------------------------------------------------------------------
// [CAMBIO] Formacion: una escuadra con la misma orden avanza junta. Sin ella, los jeeps y tanques
// llegaban solos antes que la infanteria y los destrozaban. Las rapidas no se adelantan mas de
// AI.SQUADSPREAD casillas a la mas retrasada (por tierra hasta el destino), salvo para atacar a algo a
// tiro; cerca del destino, o con enemigos al alcance de la mas retrasada, cada una pelea a su aire.
// ---------------------------------------------------------------------------

/** Casillas por tierra que le quedan hasta `at` desde cada sitio, con su tipo de movimiento. */
const remainingMap = (s: GameState, u: Unit, at: Pos): number[][] => groundDistance(s, at, Movement.of(u.type), grid(false));
/** Lo que queda desde `p` (Infinity si no llega). */
const remainingAt = (rem: number[][], at: Pos, p: Pos): number => (samePos(p, at) ? 0 : rem[p.x]![p.y]! || Infinity);
const remainingOf = (s: GameState, u: Unit): number => remainingAt(remainingMap(s, u, u.command!.at), u.command!.at, u);
/** Hasta donde puede llegar y disparar este turno. */
const strikeReach = (u: Unit): number => UNIT.mover[u.type]! + UNIT.alcance[u.type]!;

/** Las otras unidades de su formacion que cuentan (vivas, en el mapa, sin volver a curarse). */
function formationMates(s: GameState, u: Unit): Unit[] {
  return s.units.filter((o) => o !== u && o.carrier === null && o.life > 0 && !needsRepair(o) && sameFormation(u, o));
}

/**
 * Orden de juego de las unidades con orden: las de una misma formacion juntas, primero las mas
 * retrasadas y, a igualdad, las mas lentas; las demas, en su orden de siempre.
 */
export function commandOrder(s: GameState, units: readonly Unit[]): Unit[] {
  const out: Unit[] = [];
  const placed = new Set<Unit>();
  for (const u of units) {
    if (placed.has(u)) continue;
    const group = units.filter((o) => o === u || (!placed.has(o) && sameFormation(u, o)));
    const key = new Map(group.map((o) => [o, remainingOf(s, o)]));
    group.sort((a, b) => key.get(b)! - key.get(a)! || UNIT.mover[a.type]! - UNIT.mover[b.type]!);
    for (const o of group) placed.add(o);
    out.push(...group);
  }
  return out;
}

interface Formation {
  /** Lo que le queda a la unidad desde cada casilla. */
  rem: number[][];
  /** No puede acabar mas cerca del destino que esto. */
  minRem: number;
  /** La compañera mas retrasada: a igualdad, se coloca cerca de ella. */
  rear: Unit;
}

/** Limite de formacion para esta unidad, o null si va suelta (sin escuadra, sola o ya cerca). */
function formation(s: GameState, u: Unit): Formation | null {
  if (!u.command || needsRepair(u)) return null;
  const at = u.command.at;
  // Las que aun no han jugado este turno cuentan donde podrian acabar (si no, la mas lenta, que
  // juega primero, esperaria a una rapida que va igual de retrasada).
  const mates = formationMates(s, u)
    .map((o) => {
      const d = remainingOf(s, o);
      return { o, d, next: o.active && o.canMove ? Math.max(0, d - UNIT.mover[o.type]!) : d };
    })
    .filter((m) => m.d < Infinity);
  if (!mates.length) return null;
  const rem = remainingMap(s, u, at);
  const mine = remainingAt(rem, at, u);
  if (mine === Infinity) return null; // no llega por tierra: como siempre
  const rearMate = mates.reduce((a, b) => (b.next > a.next ? b : a));
  const behind = mates.reduce((a, b) => (b.d > a.d ? b : a));
  const rear = mine > behind.d ? { o: u, d: mine } : behind;
  // Cerca del destino (la mas retrasada ya llega a tiro) o con enemigos a su alcance: se suelta.
  if (rear.d <= strikeReach(rear.o)) return null;
  const vis = visibility(s, ME);
  const reach = strikeReach(rear.o);
  if (s.units.some((t) => t.team !== ME && t.carrier === null && t.life > 0 && vis[t.x]![t.y] && manhattan(t, rear.o) <= reach))
    return null;
  return { rem, minRem: rearMate.next - AI.SQUADSPREAD, rear: rearMate.o };
}

/**
 * Casilla a la que avanzar sin pasarse del limite de la formacion: lo mas cerca del destino que se
 * pueda y, a igualdad, junto a la mas retrasada. null = mejor quedarse (ya va por delante).
 */
function formationMove(u: Unit, at: Pos, range: MoveRange, f: Formation): Pos | null {
  let best: Pos | null = null;
  let bestR = remainingAt(f.rem, at, u);
  let bestA = manhattan(u, f.rear);
  for (const p of reachableTiles(range)) {
    const r = remainingAt(f.rem, at, p);
    if (r < f.minRem || r === Infinity) continue;
    const a = manhattan(p, f.rear);
    if (r < bestR || (r === bestR && a < bestA)) {
      best = p;
      bestR = r;
      bestA = a;
    }
  }
  return best;
}

/** Hacia el destino de su orden: en formacion si va con su escuadra, si no como siempre. */
function commandStep(s: GameState, u: Unit, at: Pos, range: MoveRange, f: Formation | null): Pos | null {
  return f ? formationMove(u, at, range, f) : bestMoveToward(s, u, at, range);
}

/** En formacion solo dispara desde donde no se adelanta a su escuadra (o desde donde esta). */
const formationFrom = (at: Pos, f: Formation | null) => (f ? (p: Pos) => remainingAt(f.rem, at, p) >= f.minRem : undefined);

/** [CAMBIO] La unidad del jugador empieza ya su orden recien dada (si aun no se ha movido). */
export function* commandNow(s: GameState, uid: number, rng: Rng = Math.random, team: Team = 0): Generator<GameEvent, boolean> {
  ME = team;
  return yield* commandTurn(s, uid, rng);
}

/**
 * [CAMBIO] Turno de una unidad del jugador con orden con destino (ver Command en types.ts).
 * Devuelve true si la orden se ha cumplido (y la quita: la unidad se queda esperando).
 */
export function* commandTurn(s: GameState, uid: number, rng: Rng): Generator<GameEvent, boolean> {
  const u = unitById(s, uid);
  if (!u || !u.command || !u.active || u.carrier !== null || u.life <= 0) return false;
  const { kind, at } = u.command;
  const finish = () => {
    delete u.command;
    return true;
  };
  if (kind === 'capture') {
    const b = buildingAt(s, at.x, at.y);
    if (!b || b.owner === ME || !UNIT.cancapt[u.type]) return finish();
    if (samePos(u, at)) {
      yield* captureHere(s, u);
      wait(u);
      return buildingAt(s, at.x, at.y)?.owner === ME ? finish() : false;
    }
    const range = moveRange(s, u);
    if (yield* doMove(s, u, commandStep(s, u, at, range, formation(s, u)), range)) return false;
    if (samePos(u, at)) {
      yield* captureHere(s, u);
    } else if (!(yield* tryAttack(s, u, moveRange(s, u), rng, { stay: true, chase: false }))) wait(u);
    wait(u);
    return buildingAt(s, at.x, at.y)?.owner === ME ? finish() : false;
  }
  const range = moveRange(s, u);
  if (needsRepair(u) && (yield* retreat(s, u, range))) return false;
  const near = (t: Pos) => manhattan(t, at) <= AI.GUARDRADIUS;
  const f = formation(s, u);
  const from = formationFrom(at, f);
  if (kind === 'defend') {
    if (yield* tryAttack(s, u, range, rng, { zone: near, from })) return false;
    if (manhattan(u, at) > 1) yield* doMove(s, u, commandStep(s, u, at, range, f), range);
    wait(u);
    return false;
  }
  // Atacar aqui: dispara a lo que tenga a tiro por el camino, sin perseguir, y avanza.
  if (yield* tryAttack(s, u, range, rng, { chase: false, from })) return false;
  if (manhattan(u, at) > 1) {
    if (yield* doMove(s, u, commandStep(s, u, at, range, f), range)) return false;
    if (!(yield* tryAttack(s, u, moveRange(s, u), rng, { stay: true, chase: false }))) wait(u);
    return false;
  }
  // Ha llegado: si no quedan enemigos a la vista cerca, la orden esta cumplida.
  wait(u);
  const vis = visibility(s, ME);
  const left = s.units.some((t) => t.team !== ME && t.carrier === null && vis[t.x]![t.y] && near(t));
  return left ? false : finish();
}

/** Lo que hace la IA con una unidad en su turno (si sigue activa). */
function* unitTurn(s: GameState, uid: number, rng: Rng): Generator<GameEvent> {
  const u = unitById(s, uid);
  if (!u || !u.active || u.carrier !== null || u.life <= 0) return;
  // [CAMBIO] Reglas nuevas: una captura a medias se termina antes que nada (si se va, se pierde).
  // Con captura por puntos, una unidad que ya esta sobre un edificio capturable lo empieza a capturar.
  const here = buildingAt(s, u.x, u.y);
  if (here && (yield* captureHere(s, u))) return;
  const range = moveRange(s, u);
  // [CAMBIO] Una unidad que no captura y esta encima de la Base enemiga se aparta para dejar sitio.
  if (here && here.type === HQ && here.owner !== ME && here.owner !== null && !UNIT.cancapt[u.type]) {
    const dest = bestMoveToward(s, u, here, range, true);
    if (dest) {
      yield* doMove(s, u, dest, range);
      const after = moveRange(s, u);
      if (!(yield* tryAttack(s, u, after, rng))) wait(u);
      return;
    }
  }
  if (needsRepair(u) && (yield* retreat(s, u, range))) return;
  if (yield* tryAttack(s, u, range, rng)) return;
  if (yield* tryCapture(s, u, range)) return;
  if (yield* advance(s, u, range)) return;
  yield* randomMove(s, u, range, rng);
}
