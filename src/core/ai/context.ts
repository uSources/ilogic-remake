/**
 * Lo que comparten los pasos de un turno de IA (AiCtx) y las ayudas que usan todos: medir distancias
 * desde una unidad, la mejor casilla para acercarse a algo y mover avisando a la interfaz.
 */
import { AI, BUILDING, HEALER, RULES, UNIT, Movement } from '../data';
import { samePos } from '../geom';
import { buildingAt, occupancy } from '../rules/queries';
import { groundDistance, moveEvent, moveUnit, type MoveRange } from '../rules/movement';
import { visibility } from '../rules/visibility';
import type { GameEvent, GameState, Pos, Team, Unit } from '../types';

/**
 * Estado de un turno de IA. Se crea al empezarlo (aiTurn, assistTurn, commandNow) y se pasa a cada
 * paso, asi que dos turnos (o una prevision en medio de un turno) no se mezclan.
 * [CAMBIO] Antes eran variables del modulo (ME, GROUP, PLAN).
 */
export interface AiCtx {
  /** Bando que juega el turno. */
  readonly me: Team;
  /**
   * [CAMBIO] Juego en grupo: solo en el turno de la IA enemiga (aiTurn). Las ordenes del jugador
   * (commandTurn) usan las mismas funciones sin esto, para no cambiar como se cumplen.
   */
  group: boolean;
  /** [CAMBIO] Plan de fuego concentrado del turno: uid de la unidad propia -> uid del objetivo que remata entre varias. */
  plan: Map<number, number>;
}

/** Contexto nuevo para un turno de `me` (sin grupo ni plan). */
export function aiCtx(me: Team): AiCtx {
  return { me, group: false, plan: new Map() };
}

/**
 * Ocupacion sin contar a la propia unidad (para medir distancias desde su sitio).
 * [CAMBIO] En grupo, si se puede pasar entre aliados, las propias no cortan el camino (solo las
 * enemigas visibles): antes una columna en un puente o en la salida de la Fabrica dejaba a las de
 * detras "sin camino" a nada y paseaban al azar en casa.
 */
export function occupancyWithout(s: GameState, ctx: AiCtx, u: Unit): boolean[][] {
  const occ = occupancy(s);
  if (ctx.group && RULES.passAllies) {
    const vis = visibility(s, ctx.me);
    for (const o of s.units) if (o.carrier === null && (o.team === ctx.me || !vis[o.x]![o.y])) occ[o.x]![o.y] = false;
  }
  occ[u.x]![u.y] = false;
  return occ;
}

/**
 * Mejor casilla alcanzable este turno para acercarse a `dest` (IA.getBestMove).
 * [CAMBIO] la cercania se mide con el tipo de movimiento de la unidad (antes siempre "a pie")
 * y si ya esta tan cerca como puede, se queda.
 */
export function bestMoveToward(s: GameState, ctx: AiCtx, u: Unit, dest: Pos, range: MoveRange, avoidDest = false): Pos | null {
  if (samePos(u, dest) && !avoidDest) return null;
  if (!avoidDest && range.steps[dest.x]![dest.y]! > 0) return dest;
  const dd = groundDistance(s, dest, Movement.of(u.type), occupancyWithout(s, ctx, u));
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
export function* doMove(s: GameState, u: Unit, dest: Pos | null, range: MoveRange): Generator<GameEvent, boolean> {
  if (!dest) return false;
  const path = moveUnit(s, u, dest, range);
  if (!path) return false;
  yield moveEvent(u.uid, path);
  return !!path.ambush;
}

/** Hasta donde puede llegar y disparar este turno (movimiento + alcance). */
export const strikeReach = (u: Unit): number => UNIT.mover[u.type]! + UNIT.alcance[u.type]!;

/** Enemigos vivos, en el mapa (no transportados) y a la vista de `me`. */
export function visibleFoes(s: GameState, me: Team, vis = visibility(s, me)): Unit[] {
  return s.units.filter((t) => t.team !== me && t.carrier === null && t.life > 0 && vis[t.x]![t.y]);
}

/** Necesita volver a curarse a un edificio. */
export const needsRepair = (u: Unit): boolean => u.life < AI.LIFETOBACK;

/** En esa casilla hay un edificio propio que repara a la unidad. */
export function repairsHere(s: GameState, u: Unit, x: number, y: number): boolean {
  const b = buildingAt(s, x, y);
  return !!b && b.owner === u.team && HEALER[u.type]![b.type]! && BUILDING.heals[b.type]! > 0;
}
