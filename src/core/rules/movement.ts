/**
 * Movimiento y caminos: alcance de cada unidad, caminos trazados, emboscadas, distancia por tierra
 * y el evento de mover.
 */
import { RULES, UNIT, Movement, type MoveType } from '../data';
import { isRanged, zoneOfControl } from '../abilities';
import { grid, inBounds, manhattan, neighbors4, samePos } from '../geom';
import { weatherMove } from '../weather';
import type { GameEvent, GameState, Pos, Unit } from '../types';
import { dropStaleCaptures } from './capture';
import { canWalk, isWalkable, occupancy } from './queries';
import { visibility } from './visibility';

export interface MoveRange {
  /** steps[x][y] = pasos para llegar (1..max); 0 = inalcanzable o casilla de origen. */
  steps: number[][];
  /** Casilla previa en el camino mas corto (para animar el recorrido). */
  prev: (Pos | null)[][];
  maxSteps: number;
}

/**
 * Pasos maximos este turno.
 * [CAMBIO] El clima puede quitar movimiento (nunca por debajo de 1 si la unidad se mueve).
 */
export function maxSteps(s: GameState, u: Unit): number {
  const base = UNIT.mover[u.type]!;
  return base > 0 ? Math.max(1, base + weatherMove(s, Movement.of(u.type))) : base;
}

/** Lo que dice passMap de cada casilla para una unidad. */
export interface PassMap {
  /** No se puede pasar. */
  block: boolean[][];
  /** Hay alguien: se puede pasar (aliados) pero no terminar. */
  taken: boolean[][];
  /** Hay que pararse al entrar (zona de control enemiga). */
  stop: boolean[][];
}

/**
 * Que casillas bloquean el paso a `u` y en cuales no puede terminar.
 * [CAMBIO] Reglas nuevas: se atraviesan las unidades propias, y los enemigos que el bando de `u`
 * no ve no cuentan (asi el alcance no delata donde estan; al moverse, emboscada).
 */
export function passMap(s: GameState, u: Unit): PassMap {
  const block = grid(false);
  const taken = grid(false);
  const vis = RULES.ambush ? visibility(s, u.team) : null;
  // [CAMBIO] Zona de control (habilidades): casillas en las que hay que pararse.
  const stop = zoneOfControl(s, u, vis);
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
  return { block, taken, stop };
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
  const max = maxSteps(s, u);
  const mt = Movement.of(u.type);
  const { block, taken, stop } = passMap(s, u);
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
      // En una zona de control enemiga se puede entrar, pero no seguir desde ella.
      if (best[n.x]![n.y] === Infinity && !stop[n.x]![n.y]) open.push(n);
      best[n.x]![n.y] = c;
      prev[n.x]![n.y] = p;
      // Por una casilla con un aliado se pasa, pero no se puede terminar en ella.
      steps[n.x]![n.y] = taken[n.x]![n.y] ? 0 : c;
    }
  }
  return { steps, prev, maxSteps: max };
}

export function canReach(range: MoveRange, x: number, y: number): boolean {
  return inBounds(x, y) && range.steps[x]![y]! > 0;
}

/** Casillas a las que se puede mover (sin contar la de salida). */
export function reachableTiles(r: MoveRange): Pos[] {
  const out: Pos[] = [];
  for (let x = 0; x < r.steps.length; x++) for (let y = 0; y < r.steps[x]!.length; y++) if (r.steps[x]![y]! > 0) out.push({ x, y });
  return out;
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

/**
 * Aplica una emboscada: la unidad acaba en el ultimo punto del camino y pierde el turno.
 * (Interna de las reglas: la usan mover, unir y subir a un transporte.)
 */
export function ambushed(s: GameState, u: Unit, walked: MovePath): MovePath {
  const end = walked[walked.length - 1]!;
  u.x = end.x;
  u.y = end.y;
  u.active = false;
  u.canMove = false;
  u.canFire = false;
  dropStaleCaptures(s);
  return walked;
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
  const { block, stop } = passMap(s, u);
  const mt = Movement.of(u.type);
  const seen = new Set<string>();
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!,
      b = path[i]!;
    if (manhattan(a, b) !== 1 || !canWalk(s, b.x, b.y, mt) || block[b.x]![b.y]) return false;
    if (i < path.length - 1 && stop[b.x]![b.y]) return false;
    const k = `${b.x},${b.y}`;
    if (seen.has(k) || samePos(b, u)) return false;
    seen.add(k);
  }
  return true;
}

/**
 * Distancia en pasos desde `from` a cada casilla para un tipo de movimiento, sin limite
 * (Auxiliar.getGroundRange). 0 = inalcanzable (o la propia casilla de origen). El origen no tiene
 * que ser transitable. Las unidades bloquean salvo que se pase `occ` vacio.
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

/** Mueve la unidad (Ilogic.Move). Devuelve el camino recorrido o null si no es valido. */
export function moveUnit(s: GameState, u: Unit, dest: Pos, range = moveRange(s, u), via?: Pos[]): MovePath | null {
  if (!u.active || !u.canMove || samePos(u, dest) || !canReach(range, dest.x, dest.y)) return null;
  // `via`: camino trazado por el jugador (si es valido); si no, el mas corto.
  const path =
    via && samePos(via[via.length - 1]!, dest) && validPath(s, u, via, range) ? via.map((p) => ({ ...p })) : pathTo(range, u, dest);
  const walked = walkPath(s, u, path);
  if (walked.ambush) return ambushed(s, u, walked);
  u.x = dest.x;
  u.y = dest.y;
  u.canMove = false;
  // Las unidades a distancia no pueden mover y disparar en el mismo turno.
  if (isRanged(u.type)) u.canFire = false;
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

/** Evento de mover (los que anima la escena y cuentan las estadisticas). Un solo sitio para su forma. */
export function moveEvent(uid: number, path: MovePath): GameEvent {
  return path.ambush ? { kind: 'move', uid, path, ambush: path.ambush } : { kind: 'move', uid, path };
}
