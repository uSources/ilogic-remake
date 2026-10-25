/**
 * Reglas del juego (portadas de Ilogic.java, Unit.java y Building.java).
 * Funciones puras sobre GameState: consultan o modifican el estado, sin nada de Phaser.
 * Las desviaciones respecto al original estan marcadas con [CAMBIO].
 */
import {
  AMMO_RESTORER,
  BUILDING,
  CAN_CARRY,
  FUELER,
  HEALER,
  HQ,
  MAX_FUNDS,
  MAX_LIFE,
  MAX_UNITS,
  POWER,
  SPAWNER,
  TERRAIN,
  UNIT,
  UNIT_AMMO_RESTORER,
  UNIT_FUELER,
  UNIT_HEALS,
  UNIT_TYPES,
} from './data';
import { diamond, grid, inBounds, manhattan, neighbors4, samePos } from './geom';
import type { Building, GameState, Outcome, Pos, Rng, Team, Unit } from './types';

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

export function canWalk(s: GameState, x: number, y: number, moveType: number): boolean {
  return inBounds(x, y) && TERRAIN.canwalk[moveType]![s.map[x]![y]!]!;
}

/** Transitable y libre de unidades (amigas o enemigas: no se puede atravesar a nadie). */
export function isWalkable(s: GameState, x: number, y: number, moveType: number, occ = occupancy(s)): boolean {
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
export function moveRange(s: GameState, u: Unit): MoveRange {
  const steps = grid(0);
  const prev = grid<Pos | null>(null);
  const max = maxSteps(u);
  const mt = UNIT.movtype[u.type]!;
  const occ = occupancy(s);
  const seen = grid(false);
  seen[u.x]![u.y] = true;
  let frontier: Pos[] = [{ x: u.x, y: u.y }];
  for (let step = 1; step <= max && frontier.length; step++) {
    const next: Pos[] = [];
    for (const p of frontier) {
      for (const n of neighbors4(p)) {
        if (seen[n.x]![n.y] || !isWalkable(s, n.x, n.y, mt, occ)) continue;
        seen[n.x]![n.y] = true;
        steps[n.x]![n.y] = step;
        prev[n.x]![n.y] = p;
        next.push(n);
      }
    }
    frontier = next;
  }
  return { steps, prev, maxSteps: max };
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

export function canReach(range: MoveRange, x: number, y: number): boolean {
  return inBounds(x, y) && range.steps[x]![y]! > 0;
}

function spendFuel(u: Unit, steps: number): void {
  // [CAMBIO] el original tambien restaba a las unidades sin combustible (quedaba negativo).
  if (UNIT.maxfuel[u.type]! !== 0) u.fuel = Math.max(0, u.fuel - steps);
}

/** Mueve la unidad (Ilogic.Move). Devuelve el camino recorrido o null si no es valido. */
export function moveUnit(s: GameState, u: Unit, dest: Pos, range = moveRange(s, u)): Pos[] | null {
  if (!u.active || !u.canMove || samePos(u, dest) || !canReach(range, dest.x, dest.y)) return null;
  const path = pathTo(range, u, dest);
  spendFuel(u, range.steps[dest.x]![dest.y]!);
  u.x = dest.x;
  u.y = dest.y;
  u.canMove = false;
  // Las unidades a distancia no pueden mover y disparar en el mismo turno.
  if (UNIT.minalc[u.type]! !== 0) u.canFire = false;
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
    if ((samePos(n, u) || (st > 0 && st + 1 <= range.maxSteps)) && st < bestSteps) {
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
export function visibility(s: GameState, team: Team): boolean[][] {
  const vis = grid(false);
  for (const u of s.units) {
    if (u.team !== team || u.carrier !== null) continue;
    for (const p of diamond(u, 0, UNIT.vision[u.type]!)) vis[p.x]![p.y] = true;
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
      t.team !== u.team &&
      t.carrier === null &&
      t.life > 0 &&
      vis[t.x]![t.y] &&
      POWER[u.type]![t.type]! > 0 &&
      inAttackRange(u.type, u, t),
  );
}

/** Probabilidad de acierto de cada "disparo" (uno por punto de vida del atacante). */
export function hitChance(s: GameState, atk: Unit, def: Unit): number {
  let p = POWER[atk.type]![def.type]! * TERRAIN.protection[s.map[def.x]![def.y]!]!;
  const b = buildingAt(s, def.x, def.y);
  if (b) p *= BUILDING.protection[b.type]!;
  return p;
}

/** Dano esperado (para la IA y para mostrarlo en pantalla). */
export function expectedDamage(s: GameState, atk: Unit, def: Unit): number {
  return Math.min(def.life, atk.life * Math.min(1, hitChance(s, atk, def)));
}

/**
 * Ataque (Ilogic.Attack): una tirada por punto de vida del atacante; cada acierto quita 1.
 * Sin contraataque. Gasta 1 de municion. Devuelve el dano hecho.
 */
export function attack(s: GameState, atk: Unit, def: Unit, rng: Rng): number {
  if (atk.team === def.team || !atk.canFire || !UNIT.canfight[atk.type] || !hasAmmo(atk)) return 0;
  if (!inAttackRange(atk.type, atk, def)) return 0;
  const p = hitChance(s, atk, def);
  let dmg = 0;
  for (let i = 0; i < atk.life && def.life > 0; i++) {
    if (rng() < p) {
      def.life--;
      dmg++;
    }
  }
  if (UNIT.maxammo[atk.type]! !== 0) atk.ammo--;
  atk.active = false;
  atk.canFire = false;
  atk.canMove = false;
  removeDead(s);
  return dmg;
}

// ---------------------------------------------------------------------------
// Captura, union, transporte, abastecimiento
// ---------------------------------------------------------------------------

/** Se puede capturar el edificio de debajo (neutral o enemigo). */
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
export function capture(s: GameState, u: Unit): boolean {
  if (!canCapture(s, u)) return false;
  const b = buildingAt(s, u.x, u.y)!;
  b.owner = b.owner === null ? u.team : null;
  u.active = false;
  u.canMove = false;
  return true;
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
export function merge(s: GameState, u: Unit, target: Unit): Pos[] | null {
  if (!u.active || u.type !== target.type || u.team !== target.team || u.uid === target.uid) return null;
  const path = approachPath(s, u, target);
  if (!path) return null;
  spendFuel(u, path.length - 1 + 1);
  target.life = Math.min(MAX_LIFE, target.life + u.life);
  target.fuel = Math.max(target.fuel, u.fuel);
  target.ammo = Math.max(target.ammo, u.ammo);
  target.active = false;
  target.canMove = false;
  path.push({ x: target.x, y: target.y });
  removeUnit(s, u.uid);
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
export function load(s: GameState, u: Unit, t: Unit): Pos[] | null {
  if (!u.active || u.team !== t.team || !CAN_CARRY[t.type]![u.type] || u.carrier !== null) return null;
  const slot = freeSlot(t);
  if (slot === -1) return null;
  const path = approachPath(s, u, t);
  if (!path) return null;
  spendFuel(u, path.length);
  path.push({ x: t.x, y: t.y });
  t.cargo[slot] = u.uid;
  u.carrier = t.uid;
  u.x = t.x;
  u.y = t.y;
  u.active = false;
  u.canMove = false;
  return path;
}

export function cargoUnits(s: GameState, t: Unit): Unit[] {
  return t.cargo.map((c) => unitById(s, c)).filter((c): c is Unit => !!c);
}

/** Casillas donde se puede bajar a un pasajero: vecinas transitables y libres. */
export function unloadTiles(s: GameState, t: Unit, passenger: Unit): Pos[] {
  const mt = UNIT.movtype[passenger.type]!;
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
  const full = teamUnits(s, team).length >= MAX_UNITS;
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
  if (cost > s.funds[team] || teamUnits(s, team).length >= MAX_UNITS) return null;
  if (!isWalkable(s, b.x, b.y, UNIT.movtype[type]!)) return null;
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
}

/**
 * Mantenimiento tras el turno de la IA (ciclojuego, fase 2): reactivar unidades, cobrar,
 * curar/repostar/rearmar sobre edificios propios y gasto de combustible de los aereos.
 * [CAMBIO] el repostaje va antes del gasto: un avion en su aeropuerto ya no se estrella.
 */
export function endRound(s: GameState): RoundReport {
  const report: RoundReport = { income: [0, 0], crashed: [] };
  for (const u of s.units) {
    u.active = true;
    u.canMove = true;
    u.canFire = true;
  }
  const refueled = new Set<number>();
  for (const b of s.buildings) {
    if (b.owner === null) continue;
    s.funds[b.owner] += BUILDING.earning[b.type]!;
    report.income[b.owner] += BUILDING.earning[b.type]!;
    const u = unitAt(s, b.x, b.y);
    if (!u || u.team !== b.owner) continue;
    if (HEALER[u.type]![b.type]) u.life = Math.min(MAX_LIFE, u.life + BUILDING.heals[b.type]!);
    if (FUELER[u.type]![b.type]) {
      u.fuel = UNIT.maxfuel[u.type]!;
      refueled.add(u.uid);
    }
    if (AMMO_RESTORER[u.type]![b.type]) u.ammo = UNIT.maxammo[u.type]!;
  }
  for (const u of [...s.units]) {
    const burn = UNIT.fuelperturn[u.type]!;
    if (burn === 0 || refueled.has(u.uid)) continue;
    u.fuel -= burn;
    if (u.fuel <= 0) {
      report.crashed.push(u.uid);
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

/** Se gana neutralizando la Base enemiga (o si el enemigo se queda sin nada). Si ambas, se pierde. */
export function outcome(s: GameState): Outcome {
  if (defeated(s, 0)) return 'lost';
  if (defeated(s, 1)) return 'won';
  return 'playing';
}

// ---------------------------------------------------------------------------
// Distancia por tierra (Auxiliar.getGroundRange)
// ---------------------------------------------------------------------------

/**
 * Distancia en pasos desde `from` a cada casilla para un tipo de movimiento, sin limite.
 * 0 = inalcanzable (o la propia casilla de origen). El origen no tiene que ser transitable.
 * Las unidades bloquean salvo que se pase `occ` vacio.
 */
export function groundDistance(s: GameState, from: Pos, moveType: number, occ = occupancy(s)): number[][] {
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
