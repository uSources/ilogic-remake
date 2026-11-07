/**
 * Lo que comparten los pasos de un turno jugado por el nucleo (las ordenes permanentes) o por la IA
 * (PlayCtx) y las ayudas que usan todos: medir distancias desde una unidad, la mejor casilla para
 * acercarse a algo y proponer lo que hace una unidad.
 */

import { unitTypeOf } from '../gameContent';
import { movementOf } from '../rules/queries';
import { moveBudget } from '../rules/movementProfile';
import { posOf, samePos } from '../geom';
import { canReach, stepToward, type MoveRange } from '../rules/movement';
import { distanceMap, unitsBlock, type Blockers, type DistanceMap } from '../rules/distance';
import { letsAlliesThrough, passBlockers } from '../rules/passage';
import { endsInterrupted } from '../rules/traverse';
import { actorProblem } from '../actions/checks';
import type { ActionPlan, GameAction, GameEvent, GameState, Pos, TeamId, Unit } from '../model';
import { isAlive } from '../util/predicates';
import type { AutopilotProfile } from './profile';

/**
 * Estado de un turno de ordenes o de IA. Se crea al empezarlo (aiTurn, assistTurn, startStandingOrder) y se pasa a cada
 * paso, asi que dos turnos (o una prevision en medio de un turno) no se mezclan. No manda nada: los
 * pasos proponen sus acciones (`ActionPlan`) y las manda quien cumple el plan.
 * [CAMBIO] Antes eran variables del modulo (ME, GROUP, PLAN).
 */
export interface PlayCtx {
  /** Equipo que juega el turno. */
  readonly me: TeamId;
  /**
   * [CAMBIO] Como mide los caminos (`blockersFor`): 'alone', cada una como si fuera sola (las ordenes
   * con destino y lo que no mueve), o 'army', todo el ejercito a la vez (la IA al mover sus unidades).
   */
  readonly paths: PathPlanning;
  /** [CAMBIO] Fuego concentrado del turno: uid de la unidad propia -> uid del objetivo que remata entre varias (vacio: no hay). */
  readonly focusFire: ReadonlyMap<number, number>;
  /** Con que pesos y razones juega (el de las ordenes de la partida, o el de la IA que decide). */
  readonly profile: AutopilotProfile;
}

/** Como mide los caminos quien juega: cada unidad sola o todo el ejercito a la vez (ver PlayCtx.paths). */
export type PathPlanning = 'alone' | 'army';

/** Contexto para un turno de `me` que juega con `profile`: por defecto mide cada unidad sola y sin fuego concentrado. */
export function playCtx(
  me: TeamId,
  profile: AutopilotProfile,
  { paths = 'alone', focusFire = new Map() }: { paths?: PathPlanning; focusFire?: ReadonlyMap<number, number> } = {},
): PlayCtx {
  return { me, paths, focusFire, profile };
}

/**
 * Lo que corta el paso a `unit` al medir distancias: las demas unidades que conoce (quien decide mide
 * sobre la vista de su equipo: los enemigos que no ve no estan, asi que no le cortan el camino al
 * medir, haya emboscadas o no; al moverse de verdad manda lo que diga la partida).
 * [CAMBIO] Con el ejercito a la vez ('army'), si las reglas de paso dejan atravesar a los aliados, mide
 * con esas reglas: antes una columna en un puente o en la salida de la Fabrica dejaba a las de detras
 * "sin camino" a nada y paseaban al azar en casa.
 */
export function blockersFor(s: GameState, play: PlayCtx, unit: Unit): Blockers {
  return play.paths === 'army' && letsAlliesThrough(s) ? passBlockers(s, unit) : unitsBlock(s, unit);
}

/** Pasos por tierra (mar o aire, segun la unidad) desde `from` hasta cada casilla, con lo que le corta el paso (blockersFor). */
export const stepsMap = (s: GameState, play: PlayCtx, unit: Unit, from: Pos = unit): DistanceMap =>
  distanceMap(s, from, movementOf(s, unit), blockersFor(s, play, unit));

/**
 * Mejor casilla alcanzable este turno para acercarse a `dest` (IA.getBestMove): la que menos pasos
 * deja, si deja menos que quedarse. `avoidDest` no deja acabar en el propio destino.
 * [CAMBIO] la cercania se mide con el tipo de movimiento de la unidad (antes siempre "a pie")
 * y si ya esta tan cerca como puede, se queda.
 */
export function bestMoveToward(s: GameState, play: PlayCtx, unit: Unit, dest: Pos, range: MoveRange, avoidDest = false): Pos | null {
  if (samePos(unit, dest) && !avoidDest) return null;
  if (!avoidDest && canReach(range, dest)) return dest;
  const stepsToDest = stepsMap(s, play, unit, dest);
  // Si no puede acabar en el destino, estar en el no es haber llegado: cuenta como lo peor (tiene que salir).
  const stepsLeft = (pos: Pos) => (samePos(pos, dest) ? Infinity : stepsToDest.at(pos));
  // A igual distancia, la primera (sin mirar lo que gasta: como siempre).
  return stepToward(range, { score: (tile) => [stepsLeft(tile.pos)], allows: (pos) => !samePos(pos, dest) });
}

/** Propone una accion de su equipo: sus sucesos, o null si no valia. */
function* actEvents(action: GameAction): ActionPlan<GameEvent[] | null> {
  const result = yield action;
  return result.ok ? result.events : null;
}

/** Propone una accion de su equipo (la manda quien cumple el plan). Devuelve si valia (si no, la partida no cambia). */
export function* act(action: GameAction): ActionPlan<boolean> {
  return (yield* actEvents(action)) !== null;
}

/** Termina el turno de la unidad, si aun no lo ha hecho (esperar). */
export function* finish(s: GameState, unit: Unit): ActionPlan {
  if (canAct(s, unit)) yield* act({ kind: 'wait', uid: unit.uid });
}

/** Propone moverla a `dest`. Devuelve true si algo le ha cortado el camino (la unidad ya no puede hacer nada). */
export function* doMove(unit: Unit, dest: Pos | null): ActionPlan<boolean> {
  if (!dest) return false;
  const events = yield* actEvents({ kind: 'move', uid: unit.uid, to: posOf(dest) });
  return events !== null && endsInterrupted(events);
}

/**
 * Radio en linea hasta el que una unidad puede llegar y disparar este turno: lo que puede gastar al
 * moverse (con el clima) mas su alcance. Es una cota: decide a que enemigos mira tryAttack (a cuales
 * dispara o, si no puede a ninguno, a cual persigue), cuando se suelta una formacion y que enemigos
 * prueba la tabla de fuego de la IA (que despues mira el alcance de verdad). [CAMBIO] Antes usaba el
 * movimiento del tipo sin el clima, asi que con mal tiempo perseguia enemigos que no iba a alcanzar.
 */
export const strikeReach = (s: GameState, unit: Unit): number => moveBudget(s, unit) + (unitTypeOf(s, unit).attack?.maxRange ?? 0);

/**
 * Puede jugar este turno: lo mismo que pide cualquier accion de una unidad (`actorProblem`: suya,
 * en el mapa y sin gastar), y viva.
 */
export const canAct = (s: GameState, unit: Unit): boolean => isAlive(unit) && actorProblem(s, unit.team, unit.uid) === null;

/** Necesita volver a curarse a un edificio. */
export const needsRepair = (play: PlayCtx, unit: Unit): boolean => unit.life < play.profile.weights.retreatBelowLife;
