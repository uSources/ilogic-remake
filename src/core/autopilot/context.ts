/**
 * Lo que comparten los pasos de un turno jugado por el nucleo (las ordenes permanentes) o por la IA
 * (PlayCtx) y las ayudas que usan todos: medir distancias
 * desde una unidad, la mejor casilla para acercarse a algo y mover avisando a la interfaz.
 */

import { isHostile } from '../teams';
import { unitTypeOf, buildingTypeOf, weightsOf } from '../gameContent';
import { movementOf, buildingAt } from '../rules/queries';
import { moveBudget } from '../rules/movementProfile';
import { posOf, samePos } from '../geom';
import { canReach, stepToward, type MoveRange } from '../rules/movement';
import { distanceMap, unitsBlock, type Blockers, type DistanceMap } from '../rules/distance';
import { letsAlliesThrough, passBlockers, UNSEEN_FOES_UNNOTICED } from '../rules/passage';
import type { PassRule } from '../ruleModules/hooks';
import { endsInterrupted } from '../rules/traverse';
import { actorProblem } from '../actions/checks';
import type { ActionDispatcher } from '../actions/types';
import { visibility } from '../rules/visibility';
import type { GameAction, GameEvent, GameState, Pos, TeamId, Unit } from '../model';
import { isAlive } from '../util/predicates';

/**
 * Estado de un turno de ordenes o de IA. Se crea al empezarlo (aiTurn, assistTurn, startStandingOrder) y se pasa a cada
 * paso, asi que dos turnos (o una prevision en medio de un turno) no se mezclan.
 * [CAMBIO] Antes eran variables del modulo (ME, GROUP, PLAN).
 */
export interface PlayCtx {
  /** Equipo que juega el turno. */
  readonly me: TeamId;
  /**
   * [CAMBIO] Juego en grupo: solo en el turno de la IA (aiTurn). Las ordenes con destino
   * (unitStandingOrderTurn) usan las mismas funciones sin esto, para no cambiar como se cumplen.
   */
  group: boolean;
  /** [CAMBIO] Plan de fuego concentrado del turno: uid de la unidad propia -> uid del objetivo que remata entre varias. */
  plan: Map<number, number>;
  /**
   * Por donde manda sus acciones: dispatch, o lo que le de quien la hace jugar (la sesion, que las
   * apunta). Hasta que la IA solo proponga acciones (fase 6), las manda ella.
   */
  readonly dispatch: ActionDispatcher;
}

/** Contexto nuevo para un turno de `me` (sin grupo ni plan), que manda sus acciones por `dispatcher`. */
export function playCtx(me: TeamId, dispatcher: ActionDispatcher): PlayCtx {
  return { me, group: false, plan: new Map(), dispatch: dispatcher };
}

/**
 * [CAMBIO] La IA en grupo planea con lo que ve: los enemigos que no ve no le cortan el camino al
 * medir, haya emboscadas o no (al moverse de verdad manda lo que diga la partida).
 */
export const PLANS_WITH_WHAT_IT_SEES: PassRule = UNSEEN_FOES_UNNOTICED;

/**
 * Lo que corta el paso a `unit` al medir distancias: las demas unidades.
 * [CAMBIO] En grupo, si las reglas de paso dejan atravesar a los aliados, mide con esas reglas y
 * con lo que ve (PLANS_WITH_WHAT_IT_SEES): antes una columna en un puente o en la salida de la
 * Fabrica dejaba a las de detras "sin camino" a nada y paseaban al azar en casa.
 */
export function blockersFor(s: GameState, play: PlayCtx, unit: Unit): Blockers {
  return play.group && letsAlliesThrough(s) ? passBlockers(s, unit, [PLANS_WITH_WHAT_IT_SEES]) : unitsBlock(s, unit);
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

/**
 * Quien juega el turno (ordenes o IA) hace una accion de su equipo (`dispatch`) y avisa de sus
 * sucesos: los sucesos, o null si no valia.
 */
function* actEvents(s: GameState, play: PlayCtx, action: GameAction): Generator<GameEvent, GameEvent[] | null> {
  const result = play.dispatch(s, play.me, action);
  if (!result.ok) return null;
  yield* result.events;
  return result.events;
}

/**
 * Quien juega el turno (ordenes o IA) hace una accion de su equipo por la misma via que cualquiera
 * (`dispatch`) y avisa de sus sucesos. Devuelve si valia (si no, la partida no cambia).
 */
export function* act(s: GameState, play: PlayCtx, action: GameAction): Generator<GameEvent, boolean> {
  return (yield* actEvents(s, play, action)) !== null;
}

/** Termina el turno de la unidad, si aun no lo ha hecho (esperar). */
export function* finish(s: GameState, play: PlayCtx, unit: Unit): Generator<GameEvent> {
  if (canAct(s, unit)) yield* act(s, play, { kind: 'wait', uid: unit.uid });
}

/** Mueve y avisa. Devuelve true si algo le ha cortado el camino (la unidad ya no puede hacer nada). */
export function* doMove(s: GameState, play: PlayCtx, unit: Unit, dest: Pos | null): Generator<GameEvent, boolean> {
  if (!dest) return false;
  const events = yield* actEvents(s, play, { kind: 'move', uid: unit.uid, to: posOf(dest) });
  return events !== null && endsInterrupted(events);
}

/** Hasta donde puede llegar y disparar este turno: lo que puede gastar al moverse (con el clima) y su alcance. */
export const strikeReach = (s: GameState, unit: Unit): number => moveBudget(s, unit) + (unitTypeOf(s, unit).attack?.maxRange ?? 0);

/** Enemigos de `me` vivos y en el mapa (no transportados), se vean o no. */
const foesOnMap = (s: GameState, me: TeamId): Unit[] =>
  s.units.filter((other) => isHostile(s, other.team, me) && other.carrier === null && other.life > 0);

/** Enemigos vivos, en el mapa (no transportados) y a la vista de `me`. */
export function visibleFoes(s: GameState, me: TeamId, visible = visibility(s, me)): Unit[] {
  return foesOnMap(s, me).filter((other) => visible.at(other));
}

/** Los mismos que `visibleFoes` no ve: enemigos vivos en el mapa escondidos para `me`. */
export function hiddenFoes(s: GameState, me: TeamId, visible = visibility(s, me)): Unit[] {
  return foesOnMap(s, me).filter((other) => !visible.at(other));
}

/**
 * Puede jugar este turno: lo mismo que pide cualquier accion de una unidad (`actorProblem`: suya,
 * en el mapa y sin gastar), y viva.
 */
export const canAct = (s: GameState, unit: Unit): boolean => isAlive(unit) && actorProblem(s, unit.team, unit.uid) === null;

/** Necesita volver a curarse a un edificio. */
export const needsRepair = (s: GameState, unit: Unit): boolean => unit.life < weightsOf(s).LIFETOBACK;

/** En esa casilla hay un edificio propio que repara a la unidad. */
export function repairsHere(s: GameState, unit: Unit, pos: Pos): boolean {
  const building = buildingAt(s, pos);
  return (
    !!building &&
    building.owner === unit.team &&
    unitTypeOf(s, unit).repairedAt.includes(buildingTypeOf(s, building).id) &&
    buildingTypeOf(s, building).heals > 0
  );
}
