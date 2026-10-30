/**
 * Reglas del juego (portadas de Ilogic.java, Unit.java y Building.java).
 * Funciones puras sobre GameState: consultan o modifican el estado, sin nada de Phaser.
 * Las desviaciones respecto al original estan marcadas con [CAMBIO].
 */
import {
  AMMO_RESTORER,
  HIDING_TERRAIN,
  BUILDING,
  CAN_CARRY,
  FUELER,
  HEALER,
  HQ,
  MAX_FUNDS,
  MAX_LIFE,
  RULES,
  POWER,
  SPAWNER,
  TERRAIN,
  UNIT,
  UNIT_AMMO_RESTORER,
  UNIT_FUELER,
  UNIT_HEALS,
  UNIT_TYPES,
  Movement,
  type MoveType,
} from './data';
import { diamond, grid, inBounds, manhattan, neighbors4, samePos } from './geom';
import type { Building, GameEvent, GameState, Objective, Outcome, Pos, Rng, Team, Unit } from './types';

// ---------------------------------------------------------------------------
// Consultas basicas
// ---------------------------------------------------------------------------

export function unitById(s: GameState, uid: number | null): Unit | undefined {
  return uid === null ? undefined : s.units.find((u) => u.uid === uid);
}

/** Unidad (no transportada) en una casilla. */
export function unitAt(s: GameState, x: number, y: number): Unit | undefined {
  return s.units.find((u) => u.carrier === null && u.x === x && u.y === y);
}

export function buildingAt(s: GameState, x: number, y: number): Building | undefined {
  return s.buildings.find((b) => b.x === x && b.y === y);
}

/** Mapa de ocupacion: true donde hay una unidad no transportada. */
export function occupancy(s: GameState): boolean[][] {
  const occ = grid(false);
  for (const u of s.units) if (u.carrier === null) occ[u.x]![u.y] = true;
  return occ;
}

export function canWalk(s: GameState, x: number, y: number, moveType: MoveType): boolean {
  return inBounds(x, y) && Movement.canWalk(moveType, s.map[x]![y]!);
}

/** Transitable y libre de unidades (amigas o enemigas: no se puede atravesar a nadie). */
export function isWalkable(s: GameState, x: number, y: number, moveType: MoveType, occ = occupancy(s)): boolean {
  return canWalk(s, x, y, moveType) && !occ[x]![y];
}

export function teamUnits(s: GameState, team: Team): Unit[] {
  return s.units.filter((u) => u.team === team);
}

// ---------------------------------------------------------------------------
// Movimiento
// ---------------------------------------------------------------------------

export interface MoveRange {
  /** steps[x][y] = pasos para llegar (1..max); 0 = inalcanzable o casilla de origen. */
  steps: number[][];
  /** Casilla previa en el camino mas corto (para animar el recorrido). */
  prev: (Pos | null)[][];
  maxSteps: number;
}

/** Pasos maximos este turno: mover, limitado por el combustible si lo usa. */
export function maxSteps(u: Unit): number {
  const mover = UNIT.mover[u.type]!;
  return UNIT.maxfuel[u.type]! !== 0 ? Math.min(mover, u.fuel) : mover;
}

/** Mapa de movimiento por anchura (Ilogic.getMoveMap): cada casilla cuesta 1, las unidades bloquean. */
/**
 * Que casillas bloquean el paso a `u` y en cuales no puede terminar.
 * [CAMBIO] Reglas nuevas: se atraviesan las unidades propias, y los enemigos que el bando de `u`
 * no ve no cuentan (asi el alcance no delata donde estan; al moverse, emboscada).
 */
export function passMap(s: GameState, u: Unit): { block: boolean[][]; taken: boolean[][] } {
  const block = grid(false);
  const taken = grid(false);
  const vis = RULES.ambush ? visibility(s, u.team) : null;
  for (const o of s.units) {
    if (o.carrier !== null || o.uid === u.uid) continue;
    if (o.team === u.team) {
      taken[o.x]![o.y] = true;
      if (!RULES.passAllies) block[o.x]![o.y] = true;
    } else if (!vis || vis[o.x]![o.y]) {
      taken[o.x]![o.y] = true;
      block[o.x]![o.y] = true;
    }
  }
  return { block, taken };
}

/** Lo que cuesta entrar en una casilla (1 con las reglas clasicas). */
export function moveCost(s: GameState, moveType: MoveType, x: number, y: number): number {
  return RULES.terrainCost ? Movement.cost(moveType, s.map[x]![y]!) : 1;
}

/** Coste de recorrer un camino (sin contar la casilla de salida). */
export function pathCost(s: GameState, moveType: MoveType, path: Pos[]): number {
  let c = 0;
  for (let i = 1; i < path.length; i++) c += moveCost(s, moveType, path[i]!.x, path[i]!.y);
  return c;
}

/**
 * Alcance de movimiento: `steps` es lo que cuesta llegar a cada casilla en la que se puede terminar
 * (0 si no se llega), `prev` el camino mas barato (tambien por casillas de paso, con aliados).
 */
export function moveRange(s: GameState, u: Unit): MoveRange {
  const steps = grid(0);
  const prev = grid<Pos | null>(null);
  const max = maxSteps(u);
  const mt = Movement.of(u.type);
  const { block, taken } = passMap(s, u);
  const best = grid(Infinity);
  best[u.x]![u.y] = 0;
  // Dijkstra sencillo: los costes son pequeños (1 a 3) y el alcance tambien.
  const open: Pos[] = [{ x: u.x, y: u.y }];
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (best[open[i]!.x]![open[i]!.y]! < best[open[bi]!.x]![open[bi]!.y]!) bi = i;
    const p = open.splice(bi, 1)[0]!;
    const cp = best[p.x]![p.y]!;
    for (const n of neighbors4(p)) {
      if (!canWalk(s, n.x, n.y, mt) || block[n.x]![n.y] || (n.x === u.x && n.y === u.y)) continue;
      const c = cp + moveCost(s, mt, n.x, n.y);
      if (c > max || c >= best[n.x]![n.y]!) continue;
      if (best[n.x]![n.y] === Infinity) open.push(n);
      best[n.x]![n.y] = c;
      prev[n.x]![n.y] = p;
      // Por una casilla con un aliado se pasa, pero no se puede terminar en ella.
      steps[n.x]![n.y] = taken[n.x]![n.y] ? 0 : c;
    }
  }
  return { steps, prev, maxSteps: max };
}

/** Camino de un movimiento; si ha habido emboscada, donde estaba el enemigo escondido. */
export type MovePath = Pos[] & { ambush?: Pos };

/**
 * Recorre un camino comprobando emboscadas: si una casilla tiene un enemigo (escondido), la unidad
 * se para en la ultima casilla libre antes de el. Devuelve el camino recorrido de verdad.
 */
export function walkPath(s: GameState, u: Unit, path: Pos[]): MovePath {
  let hit = -1;
  for (let i = 1; i < path.length; i++) {
    const p = path[i]!;
    if (s.units.some((o) => o.carrier === null && o.team !== u.team && o.x === p.x && o.y === p.y)) {
      hit = i;
      break;
    }
  }
  if (hit < 0) return path;
  let stop = hit - 1;
  while (stop > 0 && s.units.some((o) => o.carrier === null && o.uid !== u.uid && o.x === path[stop]!.x && o.y === path[stop]!.y)) stop--;
  const walked = path.slice(0, stop + 1) as MovePath;
  walked.ambush = { ...path[hit]! };
  return walked;
}

/** Aplica una emboscada: la unidad acaba en el ultimo punto del camino y pierde el turno. */
function ambushed(s: GameState, u: Unit, walked: MovePath): MovePath {
  const end = walked[walked.length - 1]!;
  spendFuel(u, pathCost(s, Movement.of(u.type), walked));
  u.x = end.x;
  u.y = end.y;
  u.active = false;
  u.canMove = false;
  u.canFire = false;
  dropStaleCaptures(s);
  return walked;
}

/**
 * [CAMBIO] Una captura a medias se pierde en cuanto la unidad que capturaba se va o muere. Antes solo
 * se borraba al consultarla (captureProgress), asi que en las partidas sin pantalla (IA contra IA,
 * equilibrio) una unidad podia irse y volver sin perderla. Lo encontro el cazador de fallos
 * (npm run fuzz). Se llama al mover, unir, subir a un transporte y al quitar muertos.
 */
export function dropStaleCaptures(s: GameState): void {
  for (const b of s.buildings) if (b.capture) captureProgress(s, b);
}

/** Camino desde la unidad hasta dest (incluye ambos extremos). */
export function pathTo(range: MoveRange, from: Pos, dest: Pos): Pos[] {
  const path: Pos[] = [];
  let p: Pos | null = dest;
  while (p && !samePos(p, from)) {
    path.unshift(p);
    p = range.prev[p.x]![p.y]!;
  }
  path.unshift({ x: from.x, y: from.y });
  return path;
}

/**
 * Un camino trazado a mano es valido si empieza en la unidad, va de casilla vecina en vecina por
 * casillas del alcance (o de paso), sin repetir, no supera el movimiento y termina en un destino libre.
 */
export function validPath(s: GameState, u: Unit, path: Pos[], range: MoveRange): boolean {
  if (path.length < 2 || !samePos(path[0]!, u) || pathCost(s, Movement.of(u.type), path) > range.maxSteps) return false;
  const end = path[path.length - 1]!;
  if (!canReach(range, end.x, end.y)) return false;
  const { block } = passMap(s, u);
  const mt = Movement.of(u.type);
  const seen = new Set<string>();
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!,
      b = path[i]!;
    if (manhattan(a, b) !== 1 || !canWalk(s, b.x, b.y, mt) || block[b.x]![b.y]) return false;
    const k = `${b.x},${b.y}`;
    if (seen.has(k) || samePos(b, u)) return false;
    seen.add(k);
  }
  return true;
}

/**
 * Mejor casilla del alcance para acercarse a `goal` (por tierra, mar o aire segun la unidad),
 * sin contar a las demas unidades: la que deja menos camino por delante y, a igualdad, la mas barata.
 * null si no se puede llegar nunca o ya no se puede acercar mas.
 */
export function stepToward(s: GameState, u: Unit, goal: Pos, range = moveRange(s, u)): Pos | null {
  if (!canWalk(s, goal.x, goal.y, Movement.of(u.type))) return null;
  const dist = groundDistance(s, goal, Movement.of(u.type), grid(false));
  const here = samePos(u, goal) ? 0 : dist[u.x]![u.y]! || Infinity;
  let best: Pos | null = null;
  let bestD = here;
  let bestC = Infinity;
  for (let x = 0; x < range.steps.length; x++)
    for (let y = 0; y < range.steps[x]!.length; y++) {
      const c = range.steps[x]![y]!;
      if (c <= 0) continue;
      const d = x === goal.x && y === goal.y ? 0 : dist[x]![y]! || Infinity;
      if (d < bestD || (d === bestD && best && c < bestC)) {
        best = { x, y };
        bestD = d;
        bestC = c;
      }
    }
  return best;
}

export function canReach(range: MoveRange, x: number, y: number): boolean {
  return inBounds(x, y) && range.steps[x]![y]! > 0;
}

function spendFuel(u: Unit, steps: number): void {
  // [CAMBIO] el original tambien restaba a las unidades sin combustible (quedaba negativo).
  if (UNIT.maxfuel[u.type]! !== 0) u.fuel = Math.max(0, u.fuel - steps);
}

/** Mueve la unidad (Ilogic.Move). Devuelve el camino recorrido o null si no es valido. */
export function moveUnit(s: GameState, u: Unit, dest: Pos, range = moveRange(s, u), via?: Pos[]): MovePath | null {
  if (!u.active || !u.canMove || samePos(u, dest) || !canReach(range, dest.x, dest.y)) return null;
  // `via`: camino trazado por el jugador (si es valido); si no, el mas corto.
  const path =
    via && samePos(via[via.length - 1]!, dest) && validPath(s, u, via, range) ? via.map((p) => ({ ...p })) : pathTo(range, u, dest);
  const walked = walkPath(s, u, path);
  if (walked.ambush) return ambushed(s, u, walked);
  spendFuel(u, pathCost(s, Movement.of(u.type), path));
  u.x = dest.x;
  u.y = dest.y;
  u.canMove = false;
  // Las unidades a distancia no pueden mover y disparar en el mismo turno.
  if (UNIT.minalc[u.type]! !== 0) u.canFire = false;
  dropStaleCaptures(s);
  return path;
}

/**
 * Para unir o subir a un transporte la unidad tiene que poder llegar a una casilla
 * vecina del objetivo y dar un paso mas. Devuelve el camino hasta la casilla vecina
 * (la propia casilla si ya esta al lado) o null.
 * [CAMBIO] en el original la union y la carga se hacian "a distancia" sin mover a la unidad.
 */
export function approachPath(s: GameState, u: Unit, target: Pos, range = moveRange(s, u)): Pos[] | null {
  if (!u.canMove && manhattan(u, target) !== 1) return null;
  let best: Pos | null = null;
  let bestSteps = Infinity;
  for (const n of neighbors4(target)) {
    const st = samePos(n, u) ? 0 : range.steps[n.x]![n.y]!;
    const last = moveCost(s, Movement.of(u.type), target.x, target.y);
    if ((samePos(n, u) || (st > 0 && st + last <= range.maxSteps)) && st < bestSteps) {
      best = n;
      bestSteps = st;
    }
  }
  if (!best) return null;
  return samePos(best, u) ? [{ x: u.x, y: u.y }] : pathTo(range, u, best);
}

// ---------------------------------------------------------------------------
// Vision
// ---------------------------------------------------------------------------

/** Casillas visibles para un bando: rombo de vision de sus unidades + casillas de sus edificios. */
/** Ingresos de un edificio por ronda con las reglas actuales (multiplos de 100). */
export function buildingIncome(type: number): number {
  return Math.round((BUILDING.earning[type]! * RULES.incomeScale) / 100) * 100;
}

export function visibility(s: GameState, team: Team): boolean[][] {
  // [CAMBIO] partida sin niebla: se ve todo.
  if (!RULES.fog) return grid(true);
  const vis = grid(false);
  // [CAMBIO] Reglas nuevas: el bosque solo se ve desde al lado (o desde dentro).
  const hides = RULES.forestHides ? (x: number, y: number) => HIDING_TERRAIN.includes(s.map[x]![y]!) : () => false;
  for (const u of s.units) {
    if (u.team !== team || u.carrier !== null) continue;
    for (const p of diamond(u, 0, UNIT.vision[u.type]!)) if (!hides(p.x, p.y) || manhattan(u, p) <= 1) vis[p.x]![p.y] = true;
  }
  for (const b of s.buildings) {
    if (b.owner !== team) continue;
    for (const p of diamond(b, 0, BUILDING.vision[b.type]!)) vis[p.x]![p.y] = true;
  }
  return vis;
}

// ---------------------------------------------------------------------------
// Combate
// ---------------------------------------------------------------------------

export function hasAmmo(u: Unit): boolean {
  return UNIT.maxammo[u.type]! === 0 || u.ammo > 0;
}

export function inAttackRange(type: number, from: Pos, to: Pos): boolean {
  const d = manhattan(from, to);
  return d > UNIT.minalc[type]! && d <= UNIT.alcance[type]!;
}

/** Objetivos atacables desde la posicion actual (Ilogic.getAtkMap). */
export function attackTargets(s: GameState, u: Unit, vis = visibility(s, u.team)): Unit[] {
  if (!u.canFire || !UNIT.canfight[u.type] || !hasAmmo(u)) return [];
  return s.units.filter(
    (t) =>
      t.team !== u.team && t.carrier === null && t.life > 0 && vis[t.x]![t.y] && POWER[u.type]![t.type]! > 0 && inAttackRange(u.type, u, t),
  );
}

/**
 * Factor de proteccion de una casilla (terreno por edificio, si lo hay): multiplica la probabilidad
 * de que acierten a quien esta en ella. 1 = sin proteccion.
 */
export function tileProtection(s: GameState, p: Pos): number {
  const b = buildingAt(s, p.x, p.y);
  return TERRAIN.protection[s.map[p.x]![p.y]!]! * (b ? BUILDING.protection[b.type]! : 1);
}

/** Estrellas de defensa que se enseñan para una casilla (0..4). */
export function defenseStars(s: GameState, p: Pos): number {
  return Math.max(0, Math.min(4, Math.round(((1 - tileProtection(s, p)) * 100) / 10)));
}

/** Probabilidad de acierto de cada "disparo" (uno por punto de vida del atacante). */
export function hitChance(s: GameState, atk: Unit, def: Unit): number {
  let p = POWER[atk.type]![def.type]! * tileProtection(s, def);
  // [CAMBIO] Veterania: cada rango da +5 % de acierto al atacar y -5 % al que le ataca.
  if (RULES.veterancy) p *= (1 + VET_BONUS * rank(atk)) * (1 - VET_BONUS * rank(def));
  return p;
}

/** Bajas necesarias para cada rango (1, 2 y 3 estrellas). */
export const RANK_KILLS = [1, 3, 6] as const;
export const VET_BONUS = 0.05;

/** Rango de veterania de una unidad: 0 a 3. */
export function rank(u: Unit): number {
  const k = u.kills ?? 0;
  return RANK_KILLS.filter((n) => k >= n).length;
}

/** Dano esperado (para la IA y para mostrarlo en pantalla). */
export function expectedDamage(s: GameState, atk: Unit, def: Unit): number {
  return Math.min(def.life, atk.life * Math.min(1, hitChance(s, atk, def)));
}

/**
 * Ataque (Ilogic.Attack): una tirada por punto de vida del atacante; cada acierto quita 1.
 * Sin contraataque. Gasta 1 de municion. Devuelve el dano hecho.
 */
export interface AttackResult {
  /** Vida quitada al defensor. */
  damage: number;
  killed: boolean;
  /** Vida quitada al atacante por el contraataque (0 si no lo hay). */
  counter: number;
  attackerKilled: boolean;
}

/**
 * Daño de un ataque de `atk` (con `life` puntos de vida) a una unidad con la probabilidad `p`.
 * Original: cada punto de vida es un disparo que acierta con probabilidad p.
 * [CAMBIO] con RULES.damageSpread: el daño esperado (life x p) +- ese tanto por uno.
 */
function rollDamage(life: number, p: number, rng: Rng): number {
  if (RULES.damageSpread === null) {
    let dmg = 0;
    for (let i = 0; i < life; i++) if (rng() < p) dmg++;
    return dmg;
  }
  const expected = life * p;
  return Math.max(0, Math.round(expected * (1 + (rng() * 2 - 1) * RULES.damageSpread)));
}

/**
 * [CAMBIO] Contraataque (RULES.counterattack): el defensor que sobrevive responde si es una
 * unidad de cuerpo a cuerpo, el atacante tambien lo es y lo tiene a su alcance.
 * La artilleria y demas unidades a distancia ni contraatacan ni reciben contraataque.
 */
export function canCounter(def: Unit, atk: Unit): boolean {
  return (
    RULES.counterattack &&
    def.life > 0 &&
    !!UNIT.canfight[def.type] &&
    UNIT.minalc[def.type] === 0 &&
    UNIT.minalc[atk.type] === 0 &&
    hasAmmo(def) &&
    (POWER[def.type]![atk.type] ?? 0) > 0 &&
    inAttackRange(def.type, def, atk)
  );
}

/** Ataque completo: daño, y contraataque si las reglas lo tienen. */
export function attackFull(s: GameState, atk: Unit, def: Unit, rng: Rng): AttackResult {
  const none: AttackResult = { damage: 0, killed: false, counter: 0, attackerKilled: false };
  if (atk.team === def.team || !atk.canFire || !UNIT.canfight[atk.type] || !hasAmmo(atk)) return none;
  if (!inAttackRange(atk.type, atk, def)) return none;
  const damage = Math.min(def.life, rollDamage(atk.life, Math.min(1, hitChance(s, atk, def)), rng));
  def.life -= damage;
  if (UNIT.maxammo[atk.type]! !== 0) atk.ammo--;
  atk.active = false;
  atk.canFire = false;
  atk.canMove = false;
  let counter = 0;
  if (canCounter(def, atk)) {
    counter = Math.min(atk.life, rollDamage(def.life, Math.min(1, hitChance(s, def, atk)), rng));
    atk.life -= counter;
    if (UNIT.maxammo[def.type]! !== 0) def.ammo--;
  }
  const result = { damage, killed: def.life <= 0, counter, attackerKilled: atk.life <= 0 };
  if (result.killed && atk.life > 0) atk.kills = (atk.kills ?? 0) + 1;
  if (result.attackerKilled && def.life > 0) def.kills = (def.kills ?? 0) + 1;
  removeDead(s);
  return result;
}

/** Ataca y devuelve el daño hecho (ver attackFull para el contraataque). */
export function attack(s: GameState, atk: Unit, def: Unit, rng: Rng): number {
  return attackFull(s, atk, def, rng).damage;
}

// ---------------------------------------------------------------------------
// Captura, union, transporte, abastecimiento
// ---------------------------------------------------------------------------

/** Se puede capturar el edificio de debajo (neutral o enemigo). */
/** Puntos de captura de un edificio con las reglas actuales. */
export function capturePointsOf(b: Building): number {
  return b.type === HQ ? RULES.hqCapturePoints : RULES.capturePoints;
}

/** Puntos que resta una unidad al capturar: su vida en decenas (redondeando hacia arriba). */
export const captureStrength = (u: Unit): number => Math.ceil(u.life / 10);

/**
 * Captura a medias de un edificio, si sigue siendo valida (la unidad que la hacia sigue encima).
 * Si no, se borra.
 */
export function captureProgress(s: GameState, b: Building): { team: Team; uid: number; left: number } | null {
  const c = b.capture;
  if (!c) return null;
  const u = unitAt(s, b.x, b.y);
  if (!u || u.uid !== c.uid || u.team !== c.team || b.owner === c.team) {
    b.capture = null;
    return null;
  }
  return c;
}

export function canCapture(s: GameState, u: Unit): boolean {
  if (!u.active || !UNIT.cancapt[u.type]) return false;
  const b = buildingAt(s, u.x, u.y);
  return !!b && b.owner !== u.team;
}

/**
 * Captura instantanea (Unit.Capture): neutral -> propio; enemigo -> neutral.
 * Quitar un edificio enemigo cuesta dos capturas. Neutralizar la Base enemiga gana la partida.
 * [CAMBIO] el original tambien dejaba "capturar" (neutralizar) un edificio propio.
 */
export interface CaptureResult {
  /** El edificio ha cambiado de dueño (o ha quedado neutral, en las reglas de 2013). */
  done: boolean;
  /** Puntos que le quedan (0 si ha terminado). */
  left: number;
  total: number;
}

/**
 * Capturar el edificio de debajo.
 * Reglas de 2013: al instante; uno enemigo pasa primero a neutral y luego a tuyo.
 * [CAMBIO] Reglas nuevas: cada turno resta la vida/10 de la unidad a sus puntos (20, la Base 30);
 * al llegar a 0 pasa a ser tuyo directamente. Si la unidad se va o muere, se pierde lo avanzado.
 */
export function capture(s: GameState, u: Unit): CaptureResult | null {
  if (!canCapture(s, u)) return null;
  const b = buildingAt(s, u.x, u.y)!;
  u.active = false;
  u.canMove = false;
  const total = capturePointsOf(b);
  const prev = captureProgress(s, b);
  const left = Math.max(0, (prev && prev.uid === u.uid ? prev.left : total) - captureStrength(u));
  if (left === 0) {
    b.owner = u.team;
    b.capture = null;
    return { done: true, left: 0, total };
  }
  b.capture = { team: u.team, uid: u.uid, left };
  return { done: false, left, total };
}

/** Unidades del mismo tipo y bando con las que se puede unir este turno. */
export function mergeTargets(s: GameState, u: Unit, range = moveRange(s, u)): Unit[] {
  return s.units.filter(
    (o) =>
      o.uid !== u.uid &&
      o.carrier === null &&
      o.team === u.team &&
      o.type === u.type &&
      o.cargo.every((c) => c === null) &&
      u.cargo.every((c) => c === null) &&
      approachPath(s, u, o, range) !== null,
  );
}

/**
 * Union (Unit.Merge): la unidad se mueve hasta la otra y se funden.
 * La vida se suma (tope 100). [CAMBIO] combustible y municion: se queda el mayor de los dos.
 * Devuelve el camino recorrido.
 */
export function merge(s: GameState, u: Unit, target: Unit): MovePath | null {
  if (!u.active || u.type !== target.type || u.team !== target.team || u.uid === target.uid) return null;
  const path = approachPath(s, u, target);
  if (!path) return null;
  const walked = walkPath(s, u, path);
  if (walked.ambush) return ambushed(s, u, walked);
  spendFuel(u, pathCost(s, Movement.of(u.type), [...path, { x: target.x, y: target.y }]));
  target.life = Math.min(MAX_LIFE, target.life + u.life);
  target.fuel = Math.max(target.fuel, u.fuel);
  target.ammo = Math.max(target.ammo, u.ammo);
  // Al unirse se queda la experiencia de la mas veterana.
  if (u.kills || target.kills) target.kills = Math.max(u.kills ?? 0, target.kills ?? 0);
  target.active = false;
  target.canMove = false;
  path.push({ x: target.x, y: target.y });
  removeUnit(s, u.uid);
  dropStaleCaptures(s);
  return path;
}

export function freeSlot(t: Unit): number {
  return t.cargo.indexOf(null);
}

/** Transportes a los que puede subir. [CAMBIO] el original usaba el movimiento del transporte. */
export function loadTargets(s: GameState, u: Unit, range = moveRange(s, u)): Unit[] {
  return s.units.filter(
    (t) =>
      t.uid !== u.uid &&
      t.carrier === null &&
      t.team === u.team &&
      CAN_CARRY[t.type]![u.type] &&
      freeSlot(t) !== -1 &&
      approachPath(s, u, t, range) !== null,
  );
}

/** Subir a un transporte (Unit.Load): la unidad se mueve hasta el y queda dentro. */
export function load(s: GameState, u: Unit, t: Unit): MovePath | null {
  if (!u.active || u.team !== t.team || !CAN_CARRY[t.type]![u.type] || u.carrier !== null) return null;
  const slot = freeSlot(t);
  if (slot === -1) return null;
  const path = approachPath(s, u, t);
  if (!path) return null;
  const walked = walkPath(s, u, path);
  if (walked.ambush) return ambushed(s, u, walked);
  spendFuel(u, pathCost(s, Movement.of(u.type), [...path, { x: t.x, y: t.y }]));
  path.push({ x: t.x, y: t.y });
  t.cargo[slot] = u.uid;
  u.carrier = t.uid;
  u.x = t.x;
  u.y = t.y;
  u.active = false;
  u.canMove = false;
  dropStaleCaptures(s);
  return path;
}

export function cargoUnits(s: GameState, t: Unit): Unit[] {
  return t.cargo.map((c) => unitById(s, c)).filter((c): c is Unit => !!c);
}

/** Casillas donde se puede bajar a un pasajero: vecinas transitables y libres. */
export function unloadTiles(s: GameState, t: Unit, passenger: Unit): Pos[] {
  const mt = Movement.of(passenger.type);
  const occ = occupancy(s);
  return neighbors4(t).filter((p) => isWalkable(s, p.x, p.y, mt, occ));
}

/** Bajar a un pasajero (Unit.Unload). El pasajero y el transporte quedan sin poder actuar. */
export function unload(s: GameState, t: Unit, passenger: Unit, dest: Pos): boolean {
  if (passenger.carrier !== t.uid || manhattan(t, dest) !== 1) return false;
  if (!unloadTiles(s, t, passenger).some((p) => samePos(p, dest))) return false;
  t.cargo[t.cargo.indexOf(passenger.uid)] = null;
  passenger.carrier = null;
  passenger.x = dest.x;
  passenger.y = dest.y;
  passenger.active = false;
  passenger.canMove = false;
  t.active = false;
  t.canMove = false;
  return true;
}

function canSupplyTo(u: Unit, o: Unit): boolean {
  return (
    (UNIT_HEALS[u.type]![o.type]! > 0 && o.life < MAX_LIFE) ||
    (UNIT_FUELER[u.type]![o.type]! && o.fuel < UNIT.maxfuel[o.type]!) ||
    (UNIT_AMMO_RESTORER[u.type]![o.type]! && o.ammo < UNIT.maxammo[o.type]!)
  );
}

/** Hay alguna unidad aliada al lado a la que abastecer (en la practica solo el Supplier). */
export function canSupply(s: GameState, u: Unit): boolean {
  return neighbors4(u).some((p) => {
    const o = unitAt(s, p.x, p.y);
    return !!o && o.team === u.team && canSupplyTo(u, o);
  });
}

/** Abastecer (Unit.Heal sobre las 4 vecinas): combustible y municion al maximo. */
export function supply(s: GameState, u: Unit): number {
  let n = 0;
  for (const p of neighbors4(u)) {
    const o = unitAt(s, p.x, p.y);
    if (!o || o.team !== u.team || !canSupplyTo(u, o)) continue;
    o.life = Math.min(MAX_LIFE, o.life + UNIT_HEALS[u.type]![o.type]!);
    if (UNIT_FUELER[u.type]![o.type]) o.fuel = UNIT.maxfuel[o.type]!;
    if (UNIT_AMMO_RESTORER[u.type]![o.type]) o.ammo = UNIT.maxammo[o.type]!;
    n++;
  }
  u.active = false;
  u.canMove = false;
  return n;
}

export function wait(u: Unit): void {
  u.active = false;
  u.canMove = false;
}

// ---------------------------------------------------------------------------
// Menu de acciones de una unidad (fase 5)
// ---------------------------------------------------------------------------

export interface UnitActions {
  attack: boolean;
  capture: boolean;
  unload: boolean;
  supply: boolean;
  wait: boolean;
  /** Volver atras sin hacer nada: solo si aun no se ha movido. */
  back: boolean;
  delete: boolean;
}

export function unitActions(s: GameState, u: Unit): UnitActions {
  return {
    attack: attackTargets(s, u).length > 0,
    capture: canCapture(s, u),
    unload: UNIT.maxcarry[u.type]! > 0 && cargoUnits(s, u).some((c) => unloadTiles(s, u, c).length > 0),
    supply: canSupply(s, u),
    wait: true,
    back: u.canMove,
    delete: true,
  };
}

// ---------------------------------------------------------------------------
// Unidades: crear y eliminar
// ---------------------------------------------------------------------------

export function newUnit(s: GameState, type: number, team: Team, x: number, y: number, active = true): Unit {
  const u: Unit = {
    uid: s.nextUid++,
    type,
    team,
    x,
    y,
    active,
    canMove: active,
    canFire: active,
    life: MAX_LIFE,
    fuel: UNIT.maxfuel[type]!,
    ammo: UNIT.maxammo[type]!,
    carrier: null,
    cargo: Array<number | null>(UNIT.maxcarry[type]!).fill(null),
  };
  s.units.push(u);
  return u;
}

/** Elimina una unidad y, si es un transporte, a sus pasajeros. */
export function removeUnit(s: GameState, uid: number): void {
  const u = unitById(s, uid);
  if (!u) return;
  for (const c of u.cargo) if (c !== null) removeUnit(s, c);
  if (u.carrier !== null) {
    const t = unitById(s, u.carrier);
    if (t) t.cargo = t.cargo.map((c) => (c === uid ? null : c));
  }
  s.units = s.units.filter((o) => o.uid !== uid);
}

/** Limpieza (en el original, cada fotograma): fuera las unidades sin vida. */
export function removeDead(s: GameState): void {
  for (const u of [...s.units]) if (u.life <= 0) removeUnit(s, u.uid);
  dropStaleCaptures(s);
}

// ---------------------------------------------------------------------------
// Compra (Building.Spawn)
// ---------------------------------------------------------------------------

export interface BuyOption {
  type: number;
  cost: number;
  affordable: boolean;
}

/** Tipos que fabrica un edificio, en orden de tipo, y si se pueden pagar ahora. */
export function buyOptions(s: GameState, b: Building): BuyOption[] {
  if (b.owner === null) return [];
  const team = b.owner;
  const full = teamUnits(s, team).length >= RULES.maxUnits;
  const out: BuyOption[] = [];
  for (let t = 0; t < UNIT_TYPES; t++) {
    if (!SPAWNER[t]![b.type]) continue;
    const cost = UNIT.cost[t]!;
    out.push({ type: t, cost, affordable: !full && cost <= s.funds[team] });
  }
  return out;
}

/** El edificio puede fabricar ahora (es de alguien, fabrica algo y la casilla esta libre). */
export function canBuyAt(s: GameState, b: Building): boolean {
  return b.owner !== null && buyOptions(s, b).length > 0 && !unitAt(s, b.x, b.y);
}

/** Fabrica una unidad: nace sin poder actuar hasta la ronda siguiente. */
export function spawn(s: GameState, b: Building, type: number): Unit | null {
  if (b.owner === null || !SPAWNER[type]![b.type]) return null;
  const team = b.owner;
  const cost = UNIT.cost[type]!;
  if (cost > s.funds[team] || teamUnits(s, team).length >= RULES.maxUnits) return null;
  if (!isWalkable(s, b.x, b.y, Movement.of(type))) return null;
  s.funds[team] -= cost;
  return newUnit(s, type, team, b.x, b.y, false);
}

// ---------------------------------------------------------------------------
// Fin de ronda
// ---------------------------------------------------------------------------

export interface RoundReport {
  income: [number, number];
  /** uids de unidades aereas que se han quedado sin combustible y han caido. */
  crashed: number[];
  /** Unidades curadas en un edificio propio (uid, bando, vida recuperada). */
  healed: { uid: number; team: Team; amount: number }[];
  /** uids de unidades que han recibido combustible o municion en un edificio propio. */
  resupplied: number[];
  /** Bando de cada unidad que ha caido (se borran del estado). */
  crashedTeams: Team[];
}

/**
 * Mantenimiento tras el turno de la IA (ciclojuego, fase 2): reactivar unidades, cobrar,
 * curar/repostar/rearmar sobre edificios propios y gasto de combustible de los aereos.
 * [CAMBIO] el repostaje va antes del gasto: un avion en su aeropuerto ya no se estrella.
 */
export function endRound(s: GameState): RoundReport {
  const report: RoundReport = { income: [0, 0], crashed: [], healed: [], resupplied: [], crashedTeams: [] };
  for (const b of s.buildings) captureProgress(s, b);
  for (const u of s.units) {
    u.active = true;
    u.canMove = true;
    u.canFire = true;
  }
  const refueled = new Set<number>();
  for (const b of s.buildings) {
    if (b.owner === null) continue;
    s.funds[b.owner] += buildingIncome(b.type);
    report.income[b.owner] += buildingIncome(b.type);
    const u = unitAt(s, b.x, b.y);
    if (!u || u.team !== b.owner) continue;
    if (HEALER[u.type]![b.type]) {
      const before = u.life;
      u.life = Math.min(MAX_LIFE, u.life + BUILDING.heals[b.type]!);
      if (u.life > before) report.healed.push({ uid: u.uid, team: u.team, amount: u.life - before });
    }
    const fuelBefore = u.fuel,
      ammoBefore = u.ammo;
    if (FUELER[u.type]![b.type]) {
      u.fuel = UNIT.maxfuel[u.type]!;
      refueled.add(u.uid);
    }
    if (AMMO_RESTORER[u.type]![b.type]) u.ammo = UNIT.maxammo[u.type]!;
    if (u.fuel > fuelBefore || u.ammo > ammoBefore) report.resupplied.push(u.uid);
  }
  for (const u of [...s.units]) {
    const burn = UNIT.fuelperturn[u.type]!;
    if (burn === 0 || refueled.has(u.uid)) continue;
    u.fuel -= burn;
    if (u.fuel <= 0) {
      report.crashed.push(u.uid);
      report.crashedTeams.push(u.team);
      removeUnit(s, u.uid);
    }
  }
  s.funds = [Math.min(s.funds[0], MAX_FUNDS), Math.min(s.funds[1], MAX_FUNDS)];
  s.day++;
  return report;
}

// ---------------------------------------------------------------------------
// Victoria y derrota
// ---------------------------------------------------------------------------

function defeated(s: GameState, team: Team): boolean {
  const hasHQ = s.buildings.some((b) => b.owner === team && b.type === HQ);
  const hasAny = s.units.some((u) => u.team === team) || s.buildings.some((b) => b.owner === team);
  return !hasHQ || !hasAny;
}

/**
 * Puntos de un bando para el limite de dias: valor de su ejercito (coste x vida/100)
 * mas 1000 por cada edificio.
 */
export function score(s: GameState, team: Team): number {
  let v = 0;
  for (const u of s.units) if (u.team === team) v += (UNIT.cost[u.type]! * u.life) / 100;
  for (const b of s.buildings) if (b.owner === team) v += 1000;
  return Math.round(v);
}

/** El limite de dias (si lo hay) ya se ha cumplido. */
export const dayLimitReached = (s: GameState): boolean => RULES.dayLimit !== null && s.day > RULES.dayLimit;

/**
 * Se gana neutralizando la Base enemiga (o si el enemigo se queda sin nada). Si ambas, se pierde.
 * [CAMBIO] Con limite de dias, al acabar el ultimo gana quien tenga mas puntos (empate: mas edificios;
 * si tambien empatan, pierde el jugador).
 */
export function outcome(s: GameState): Outcome {
  if (defeated(s, 0)) return 'lost';
  if (defeated(s, 1)) return 'won';
  const obj = s.mission?.objective;
  if (obj && obj.kind !== 'hq') return objectiveOutcome(s, obj);
  if (dayLimitReached(s)) {
    const a = score(s, 0),
      b = score(s, 1);
    if (a !== b) return a > b ? 'won' : 'lost';
    const nb = (t: Team) => s.buildings.filter((x) => x.owner === t).length;
    return nb(0) > nb(1) ? 'won' : 'lost';
  }
  return 'playing';
}

/** Resultado de una mision con objetivo especial (la derrota por perder la Base ya se ha mirado). */
function objectiveOutcome(s: GameState, obj: Exclude<Objective, { kind: 'hq' }>): Outcome {
  const late = s.day > obj.days;
  switch (obj.kind) {
    case 'survive':
      return late ? 'won' : 'playing';
    case 'capture': {
      const n = s.buildings.filter((b) => b.owner === 0 && (obj.type === null || b.type === obj.type)).length;
      return n >= obj.count ? 'won' : late ? 'lost' : 'playing';
    }
    case 'destroy':
      return !s.units.some((u) => u.team === 1) ? 'won' : late ? 'lost' : 'playing';
    case 'escort': {
      const v = s.units.find((u) => u.uid === obj.uid);
      if (!v) return 'lost';
      // Dentro de un transporte cuenta donde este el transporte.
      const at = v.carrier !== null ? (s.units.find((u) => u.uid === v.carrier) ?? v) : v;
      return at.x === obj.to.x && at.y === obj.to.y ? 'won' : late ? 'lost' : 'playing';
    }
  }
}

/** Progreso del objetivo de la mision, para enseñarlo (p. ej. "2/3 ciudades", "dia 4 de 8"). */
export function objectiveProgress(s: GameState): { done: number; total: number } | null {
  const obj = s.mission?.objective;
  if (!obj || obj.kind === 'hq') return null;
  switch (obj.kind) {
    case 'survive':
      return { done: Math.min(s.day - 1, obj.days), total: obj.days };
    case 'capture':
      return { done: s.buildings.filter((b) => b.owner === 0 && (obj.type === null || b.type === obj.type)).length, total: obj.count };
    case 'destroy':
      return { done: 0, total: s.units.filter((u) => u.team === 1).length };
    case 'escort':
      return null;
  }
}

/** Por que ha terminado la partida. */
export function endReason(s: GameState): 'hq' | 'wipeout' | 'days' | 'objective' | null {
  if (outcome(s) === 'playing') return null;
  const loser: Team = outcome(s) === 'won' ? 1 : 0;
  if (!s.buildings.some((b) => b.owner === loser && b.type === HQ)) return 'hq';
  if (defeated(s, loser)) return 'wipeout';
  if (s.mission && s.mission.objective.kind !== 'hq') return 'objective';
  return 'days';
}

// ---------------------------------------------------------------------------
// Distancia por tierra (Auxiliar.getGroundRange)
// ---------------------------------------------------------------------------

/**
 * Distancia en pasos desde `from` a cada casilla para un tipo de movimiento, sin limite.
 * 0 = inalcanzable (o la propia casilla de origen). El origen no tiene que ser transitable.
 * Las unidades bloquean salvo que se pase `occ` vacio.
 */
export function groundDistance(s: GameState, from: Pos, moveType: MoveType, occ = occupancy(s)): number[][] {
  const dist = grid(0);
  const seen = grid(false);
  seen[from.x]![from.y] = true;
  let frontier: Pos[] = [from];
  for (let step = 1; frontier.length; step++) {
    const next: Pos[] = [];
    for (const p of frontier) {
      for (const n of neighbors4(p)) {
        if (seen[n.x]![n.y] || !isWalkable(s, n.x, n.y, moveType, occ)) continue;
        seen[n.x]![n.y] = true;
        dist[n.x]![n.y] = step;
        next.push(n);
      }
    }
    frontier = next;
  }
  return dist;
}

// ---------------------------------------------------------------------------
// Prevision de combate y zona de amenaza (para la interfaz)
// ---------------------------------------------------------------------------

export interface CombatForecast {
  /** Dano mas probable (media). */
  expected: number;
  /** Margen probable: percentiles 5 y 95. */
  low: number;
  high: number;
  /** Probabilidad de dejar al defensor sin vida (0..1). */
  killChance: number;
  /** Vida del defensor tras el dano esperado. */
  lifeAfter: number;
  /** Contraataque previsto (null si no lo habra). */
  counter: { expected: number; low: number; high: number; killChance: number; lifeAfter: number } | null;
}

/** Distribucion del daño: dist[k] = P(daño = k), sin tope. */
export function damageDistribution(life: number, p: number): number[] {
  const n = Math.max(0, life);
  p = Math.min(1, Math.max(0, p));
  if (RULES.damageSpread === null) {
    let dist = [1];
    for (let i = 0; i < n; i++) {
      const next = Array<number>(dist.length + 1).fill(0);
      for (let k = 0; k < dist.length; k++) {
        next[k]! += dist[k]! * (1 - p);
        next[k + 1]! += dist[k]! * p;
      }
      dist = next;
    }
    return dist;
  }
  // Daño esperado +- spread, uniforme: se muestrea con 401 puntos repartidos.
  const expected = n * p;
  const dist: number[] = [];
  const N = 401;
  for (let i = 0; i < N; i++) {
    const u = (i / (N - 1)) * 2 - 1;
    const k = Math.max(0, Math.round(expected * (1 + u * RULES.damageSpread)));
    dist[k] = (dist[k] ?? 0) + 1 / N;
  }
  for (let k = 0; k < dist.length; k++) dist[k] ??= 0;
  return dist;
}

function summarize(dist: number[], cap: number) {
  let expected = 0,
    killChance = 0,
    acc = 0,
    low = -1,
    high = -1;
  for (let k = 0; k < dist.length; k++) {
    const dmg = Math.min(k, cap);
    expected += dmg * dist[k]!;
    if (k >= cap) killChance += dist[k]!;
    acc += dist[k]!;
    if (low < 0 && acc >= 0.05 - 1e-9) low = dmg;
    if (high < 0 && acc >= 0.95 - 1e-9) high = dmg;
  }
  if (high < 0) high = Math.min(dist.length - 1, cap);
  if (low < 0) low = 0;
  return { expected, killChance, low, high };
}

export function combatForecast(s: GameState, atk: Unit, def: Unit): CombatForecast {
  const dist = damageDistribution(atk.life, hitChance(s, atk, def));
  const main = summarize(dist, def.life);
  const exp = Math.round(main.expected);
  let counter: CombatForecast['counter'] = null;
  if (canCounter(def, atk)) {
    // Para cada vida que le pueda quedar al defensor, el daño que devolveria.
    const pc = hitChance(s, def, atk);
    const total: number[] = [];
    for (let k = 0; k < dist.length; k++) {
      const left = def.life - Math.min(k, def.life);
      if (left <= 0 || !dist[k]) continue;
      const d = damageDistribution(left, pc);
      for (let j = 0; j < d.length; j++) total[j] = (total[j] ?? 0) + dist[k]! * d[j]!;
    }
    for (let j = 0; j < total.length; j++) total[j] ??= 0;
    const noCounter = 1 - total.reduce((a, b) => a + b, 0);
    total[0] = (total[0] ?? 0) + Math.max(0, noCounter);
    const c = summarize(total, atk.life);
    const ce = Math.round(c.expected);
    counter = { expected: ce, low: c.low, high: c.high, killChance: c.killChance, lifeAfter: Math.max(0, atk.life - ce) };
  }
  return { expected: exp, low: main.low, high: main.high, killChance: main.killChance, lifeAfter: Math.max(0, def.life - exp), counter };
}

/**
 * Casillas que el bando `team` podria atacar en su proximo turno (moverse y disparar):
 * solo cuenta las unidades de ese bando que `viewer` ve.
 */
export function threatMap(s: GameState, team: Team, viewer: Team): boolean[][] {
  const out = grid(false);
  const vis = visibility(s, viewer);
  for (const u of s.units) {
    if (u.team !== team || u.carrier !== null || !vis[u.x]![u.y]) continue;
    unitThreat(s, u, out);
  }
  return out;
}

/**
 * Casillas que una unidad podria atacar en su proximo turno (moviendose si puede).
 * Las unidades a distancia no pueden mover y disparar: solo cuentan desde donde estan.
 */
export function unitThreat(s: GameState, u: Unit, out: boolean[][] = grid(false), range?: MoveRange): boolean[][] {
  if (!UNIT.canfight[u.type] || !hasAmmo(u)) return out;
  const minR = UNIT.minalc[u.type]!,
    maxR = UNIT.alcance[u.type]!;
  if (maxR === 0) return out;
  const origins: Pos[] = [{ x: u.x, y: u.y }];
  // Las que pueden mover y disparar atacan desde cualquier casilla a la que lleguen.
  if (minR === 0) origins.push(...reachableTiles(range ?? moveRange(s, { ...u, active: true, canMove: true })));
  for (const o of origins) for (const p of diamond(o, minR + 1, maxR)) out[p.x]![p.y] = true;
  return out;
}

/** Lo que la unidad puede atacar este turno con su alcance de movimiento `range` (null si no puede disparar). */
export function attackZone(s: GameState, u: Unit, range: MoveRange): boolean[][] | null {
  if (!UNIT.canfight[u.type] || UNIT.alcance[u.type]! === 0 || !hasAmmo(u) || !u.canFire) return null;
  return unitThreat(s, u, grid(false), range);
}

/** Casillas a las que se puede mover (sin contar la de salida). */
export function reachableTiles(r: MoveRange): Pos[] {
  const out: Pos[] = [];
  for (let x = 0; x < r.steps.length; x++) for (let y = 0; y < r.steps[x]!.length; y++) if (r.steps[x]![y]! > 0) out.push({ x, y });
  return out;
}

// Eventos (los que anima la escena y cuentan las estadisticas). Un solo sitio para su forma.

export function moveEvent(uid: number, path: MovePath): GameEvent {
  return path.ambush ? { kind: 'move', uid, path, ambush: path.ambush } : { kind: 'move', uid, path };
}

export function captureEvent(u: Unit, b: Building, r: { left: number; total: number }): GameEvent {
  return { kind: 'capture', uid: u.uid, at: { x: b.x, y: b.y }, owner: b.owner, left: r.left, total: r.total };
}
