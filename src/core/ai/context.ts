/**
 * Lo que comparten los pasos de un turno de IA (AiCtx) y las ayudas que usan todos: medir distancias
 * desde una unidad, la mejor casilla para acercarse a algo y mover avisando a la interfaz.
 */
import { AI, BUILDING, HEALER, UNIT, Movement } from '../data';
import { samePos } from '../geom';
import { buildingAt, occupancy } from '../rules/queries';
import { groundDistance, moveEvent, moveUnit, reachableTiles, type MoveRange } from '../rules/movement';
import { visibility } from '../rules/visibility';
import type { GameEvent, GameState, Pos, Team, Unit } from '../model';
import type { Grid } from '../util/grid';
import { minBy } from '../util/pick';

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
export function occupancyWithout(s: GameState, ai: AiCtx, unit: Unit): Grid<boolean> {
  const occupied = occupancy(s);
  if (ai.group && s.rules.passAllies) {
    const visible = visibility(s, ai.me);
    const letsPass = (other: Unit) => other.carrier === null && (other.team === ai.me || !visible.at(other));
    for (const other of s.units) if (letsPass(other)) occupied.set(other, false);
  }
  occupied.set(unit, false);
  return occupied;
}

/**
 * Pasos por tierra (mar o aire, segun la unidad) desde `from` hasta cada casilla, con las demas
 * unidades cortando el paso como en occupancyWithout. Infinity si no se llega o si es la propia
 * casilla `from` (alli ya se esta: no cuenta como sitio al que ir).
 */
export function stepsFrom(s: GameState, ai: AiCtx, unit: Unit, from: Pos = unit): (pos: Pos) => number {
  const steps = groundDistance(s, from, Movement.of(unit.type), occupancyWithout(s, ai, unit));
  // groundDistance marca con 0 tanto el origen como lo que no se alcanza.
  return (pos) => steps.at(pos) || Infinity;
}

/**
 * Mejor casilla alcanzable este turno para acercarse a `dest` (IA.getBestMove): la que menos pasos
 * deja, si deja menos que quedarse. `avoidDest` no deja acabar en el propio destino.
 * [CAMBIO] la cercania se mide con el tipo de movimiento de la unidad (antes siempre "a pie")
 * y si ya esta tan cerca como puede, se queda.
 */
export function bestMoveToward(s: GameState, ai: AiCtx, unit: Unit, dest: Pos, range: MoveRange, avoidDest = false): Pos | null {
  if (samePos(unit, dest) && !avoidDest) return null;
  if (!avoidDest && range.steps.at(dest) > 0) return dest;
  const stepsToDest = stepsFrom(s, ai, unit, dest);
  const options = reachableTiles(range).filter((tile) => !samePos(tile, dest));
  const best = minBy(options, stepsToDest);
  const getsCloser = best !== null && stepsToDest(best) < stepsToDest(unit);
  return getsCloser ? best : null;
}

/** Mueve y avisa. Devuelve true si ha caido en una emboscada (la unidad ya no puede hacer nada). */
export function* doMove(s: GameState, unit: Unit, dest: Pos | null, range: MoveRange): Generator<GameEvent, boolean> {
  if (!dest) return false;
  const path = moveUnit(s, unit, dest, range);
  if (!path) return false;
  yield moveEvent(unit.uid, path);
  return !!path.ambush;
}

/** Hasta donde puede llegar y disparar este turno (movimiento + alcance). */
export const strikeReach = (unit: Unit): number => UNIT.mover[unit.type]! + UNIT.alcance[unit.type]!;

/** Enemigos vivos, en el mapa (no transportados) y a la vista de `me`. */
export function visibleFoes(s: GameState, me: Team, visible = visibility(s, me)): Unit[] {
  return s.units.filter((other) => other.team !== me && other.carrier === null && other.life > 0 && visible.at(other));
}

/** Puede jugar este turno: viva, sin usar y en el mapa (no dentro de un transporte). */
export const canAct = (unit: Unit): boolean => unit.active && unit.carrier === null && unit.life > 0;

/** Necesita volver a curarse a un edificio. */
export const needsRepair = (unit: Unit): boolean => unit.life < AI.LIFETOBACK;

/** En esa casilla hay un edificio propio que repara a la unidad. */
export function repairsHere(s: GameState, unit: Unit, pos: Pos): boolean {
  const building = buildingAt(s, pos);
  return !!building && building.owner === unit.team && HEALER[unit.type]![building.type]! && BUILDING.heals[building.type]! > 0;
}
