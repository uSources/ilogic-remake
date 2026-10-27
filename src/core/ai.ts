/**
 * Inteligencia artificial del rival (IA.java), con sus fallos corregidos.
 * Cada unidad decide sola, en orden: retirarse (si esta debil o sin combustible),
 * atacar, capturar, avanzar hacia edificios ajenos y, si nada de eso, moverse al azar.
 * Al final fabrica unidades en sus edificios.
 * Es un generador: devuelve un GameEvent tras cada accion para que la interfaz la anime.
 */
import { AI, BUILDING, FUELER, HEALER, HQ, RULES, POWER, UNIT } from './data';
import { diamond, manhattan, samePos } from './geom';
import {
  attackFull,
  buildingAt,
  buyOptions,
  canCapture,
  capture,
  expectedDamage,
  groundDistance,
  hasAmmo,
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
} from './rules';
import type { GameEvent, GameState, Pos, Rng, Team, Unit } from './types';

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
  const dd = groundDistance(s, dest, UNIT.movtype[u.type]!, occupancyWithout(s, u));
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
  yield { kind: 'move', uid: u.uid, path, ...(path.ambush ? { ambush: path.ambush } : {}) };
  return !!path.ambush;
}

/** Necesita volver a un edificio: poca vida, o aereo con poco combustible. */
function needsRepair(u: Unit): 'life' | 'fuel' | null {
  if (u.life < AI.LIFETOBACK) return 'life';
  const burn = UNIT.fuelperturn[u.type]!;
  if (burn > 0 && u.fuel <= burn * 3 + UNIT.mover[u.type]!) return 'fuel';
  return null;
}

function repairsHere(s: GameState, u: Unit, x: number, y: number, need: 'life' | 'fuel'): boolean {
  const b = buildingAt(s, x, y);
  if (!b || b.owner !== u.team) return false;
  return need === 'life' ? HEALER[u.type]![b.type]! && BUILDING.heals[b.type]! > 0 : FUELER[u.type]![b.type]!;
}

function* retreat(s: GameState, u: Unit, need: 'life' | 'fuel', range: MoveRange): Generator<GameEvent, boolean> {
  // 1) Unirse a una unidad igual si la suma de vidas no pasa de 130.
  if (need === 'life') {
    const mates = mergeTargets(s, u, range).filter((o) => o.life + u.life <= AI.MAXMERGELIFE);
    if (mates.length) {
      const target = mates.sort((a, b) => manhattan(u, a) - manhattan(u, b))[0]!;
      const path = merge(s, u, target);
      if (path) {
        if (path.ambush) yield { kind: 'move', uid: u.uid, path, ambush: path.ambush };
        else yield { kind: 'merge', uid: u.uid, into: target.uid, path };
        return true;
      }
    }
  }
  // 2) [CAMBIO] Si ya esta en un edificio que la repara, se queda (antes se marchaba a otro).
  if (repairsHere(s, u, u.x, u.y, need)) {
    wait(u);
    return true;
  }
  // 3) Ir al edificio propio mas cercano que la repare y este libre.
  const dist = groundDistance(s, u, UNIT.movtype[u.type]!);
  let goal: Pos | null = null;
  let goalD = Infinity;
  for (const b of s.buildings) {
    if (!repairsHere(s, u, b.x, b.y, need)) continue;
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
  const value = UNIT.cost[t.type]! / 1000;
  let score = dmg * value + (dmg >= t.life ? 50 * value : 0);
  // [CAMBIO] Reglas nuevas: restar lo que devolveria el contraataque.
  if (RULES.counterattack && dmg < t.life) {
    const left = { ...t, life: Math.max(1, Math.round(t.life - dmg)) };
    if (canCounter(left, atk)) score -= expectedDamage(s, left, atk) * (UNIT.cost[u.type]! / 1000);
  }
  // Quien defiende su Base encima de ella impide capturarla: hay que echarlo aunque cueste.
  const tb = buildingAt(s, t.x, t.y);
  if (tb && tb.type === HQ && tb.owner === t.team) score += 200 * Math.max(0.5, dmg / 50);
  // Echar a quien esta capturando un edificio propio (sobre todo la Base).
  const b = buildingAt(s, t.x, t.y);
  if (b && b.owner === ME && captureProgress(s, b)) score += (b.type === HQ ? 400 : 60) * Math.max(0.5, dmg / 50);
  return score;
}

function* tryAttack(s: GameState, u: Unit, range: MoveRange, rng: Rng): Generator<GameEvent, boolean> {
  // [CAMBIO] el original atacaba aunque la unidad no pudiera luchar o no hiciera dano.
  if (!UNIT.canfight[u.type] || !hasAmmo(u) || !u.canFire) return false;
  const vis = visibility(s, ME);
  const reach = UNIT.mover[u.type]! + UNIT.alcance[u.type]!;
  const enemies = s.units.filter(
    (t) => t.team !== ME && t.carrier === null && t.life > 0 && vis[t.x]![t.y] && manhattan(u, t) <= reach,
  );
  if (!enemies.length) return false;

  // Opciones: (casilla desde la que dispara, objetivo). Las unidades a distancia no pueden mover y disparar.
  let best: { from: Pos; target: Unit; score: number } | null = null;
  const ranged = UNIT.minalc[u.type]! > 0;
  const froms: Pos[] = [{ x: u.x, y: u.y }];
  if (!ranged) {
    for (let x = 0; x < range.steps.length; x++)
      for (let y = 0; y < range.steps[x]!.length; y++) if (range.steps[x]![y]! > 0) froms.push({ x, y });
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
    const targetPos = { x: best.target.x, y: best.target.y };
    const r = attackFull(s, u, best.target, rng);
    yield { kind: 'attack', attacker: u.uid, target: targetPos, damage: r.damage, killed: r.killed, counter: r.counter, attackerKilled: r.attackerKilled };
    return true;
  }
  // Nadie a tiro este turno: acercarse al enemigo visible mas cercano al que pueda danar.
  const chase = enemies
    .filter((t) => attackTargetsPossible(u, t))
    .sort((a, b) => manhattan(u, a) - manhattan(u, b))[0];
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
  yield { kind: 'capture', uid: u.uid, at: { x: b.x, y: b.y }, owner: b.owner, left: r.left, total: r.total };
  return true;
}

function* tryCapture(s: GameState, u: Unit, range: MoveRange): Generator<GameEvent, boolean> {
  if (!UNIT.cancapt[u.type]) return false;
  if (yield* captureHere(s, u)) return true;
  const vis = visibility(s, ME);
  const dist = groundDistance(s, u, UNIT.movtype[u.type]!);
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
  const dist = groundDistance(s, u, UNIT.movtype[u.type]!, occupancyWithout(s, u));
  // Las que capturan: edificios ajenos, con prioridad a la Base enemiga y a los del jugador.
  const bonus = (g: Pos): number => {
    const b = buildingAt(s, g.x, g.y);
    if (!b || !UNIT.cancapt[u.type]) return 0;
    return b.type === HQ && b.owner !== null ? 12 : b.owner !== null ? 4 : 0;
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
  const options: Pos[] = [];
  for (let x = 0; x < range.steps.length; x++)
    for (let y = 0; y < range.steps[x]!.length; y++) if (range.steps[x]![y]! > 0) options.push({ x, y });
  if (options.length) yield* doMove(s, u, options[Math.floor(rng() * options.length)]!, range);
  wait(u);
}

/** Tipos que no combaten: como mucho uno de cada a la vez. */
const SUPPORT_TYPES = new Set([5, 7, 13, 15]); // Blocker, Transport, Supplier, THelicopter

/**
 * Fabricar en cada edificio propio libre.
 * [CAMBIO] el original elegia al azar entre todo lo pagable y acababa lleno de unidades que
 * no combaten. Ahora: elige al azar dando mas peso a lo mas caro, sin repetir unidades de
 * apoyo, y asegura infanteria para capturar.
 */
function* produce(s: GameState, rng: Rng): Generator<GameEvent> {
  for (const b of s.buildings) {
    if (b.owner !== ME || teamUnits(s, ME).length >= RULES.maxUnits || unitAt(s, b.x, b.y)) continue;
    const mine = teamUnits(s, ME);
    let opts = buyOptions(s, b).filter(
      (o) => o.affordable && !(SUPPORT_TYPES.has(o.type) && mine.some((u) => u.type === o.type)),
    );
    if (!opts.length) continue;
    const capturers = mine.filter((u) => UNIT.cancapt[u.type]).length;
    if (capturers < 4 && opts.some((o) => UNIT.cancapt[o.type])) opts = opts.filter((o) => UNIT.cancapt[o.type]);
    const weights = opts.map((o) => Math.sqrt(o.cost));
    let r = rng() * weights.reduce((a, w) => a + w, 0);
    let type = opts[opts.length - 1]!.type;
    for (let i = 0; i < opts.length; i++) {
      r -= weights[i]!;
      if (r < 0) {
        type = opts[i]!.type;
        break;
      }
    }
    const u = spawn(s, b, type);
    if (u) yield { kind: 'spawn', uid: u.uid, at: { x: b.x, y: b.y } };
  }
}

/** Turno completo de la IA. Deja todas sus unidades inactivas; el mantenimiento va aparte (endRound). */
export function* aiTurn(s: GameState, rng: Rng = Math.random, team: Team = 1): Generator<GameEvent> {
  ME = team;
  const order = teamUnits(s, ME).map((u) => u.uid);
  for (const uid of order) {
    const u = unitById(s, uid);
    if (!u || !u.active || u.carrier !== null || u.life <= 0) continue;
    // [CAMBIO] Reglas nuevas: una captura a medias se termina antes que nada (si se va, se pierde).
    // Con captura por puntos, una unidad que ya esta sobre un edificio capturable lo empieza a capturar.
    const here = buildingAt(s, u.x, u.y);
    if (here && (yield* captureHere(s, u))) continue;
    const range = moveRange(s, u);
    // [CAMBIO] Una unidad que no captura y esta encima de la Base enemiga se aparta para dejar sitio.
    if (here && here.type === HQ && here.owner !== ME && here.owner !== null && !UNIT.cancapt[u.type]) {
      const dest = bestMoveToward(s, u, here, range, true);
      if (dest) {
        yield* doMove(s, u, dest, range);
        const after = moveRange(s, u);
        if (!(yield* tryAttack(s, u, after, rng))) wait(u);
        continue;
      }
    }
    const need = needsRepair(u);
    if (need && (yield* retreat(s, u, need, range))) continue;
    if (yield* tryAttack(s, u, range, rng)) continue;
    if (yield* tryCapture(s, u, range)) continue;
    if (yield* advance(s, u, range)) continue;
    yield* randomMove(s, u, range, rng);
  }
  yield* produce(s, rng);
  for (const u of teamUnits(s, ME)) wait(u);
}
