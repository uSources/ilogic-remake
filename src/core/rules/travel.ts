/**
 * Los viajes de varios turnos (la orden de ir alli, `StandingOrder` 'goto'): a donde se puede ir, el
 * paso de cada turno y como acaba. La usan dar la orden ('giveStandingOrder', con `travelProblem`)
 * y su paso ('gotoStep', actions/movement.ts); las acciones que la mueven a mano (mover, unirse,
 * subir y atacar si aun no se ha movido) la acaban con `endGotoByHand`.
 */
import { samePos } from '../geom';
import type { ActionRejection, GameEvent, GameState, Pos, StandingOrderEnd, TeamId, Unit } from '../model';
import { isOnBoard } from '../mapGrid';
import { canReach, moveRange, overGroundTo, plannedPath, stepToward } from './movement';
import { canWalk, movementOf } from './queries';

/** El paso de este turno de un viaje: llega (sin moverse: el ultimo trozo es de quien juega) o anda un camino. */
export type TravelStep = { arrives: true; end: Extract<GotoEnd, 'arrived' | 'withinReach'> } | { arrives: false; path: Pos[] };

/**
 * El paso de este turno hacia `goal`: si ya esta ('arrived') o llega este turno ('withinReach'), el
 * viaje acaba sin moverla; si no, el camino a la casilla del alcance que mas acerca por tierra
 * (stepToward). Null si no se acerca nada o el destino no se puede pisar.
 */
export function travelStepOf(s: GameState, unit: Unit, goal: Pos): TravelStep | null {
  if (samePos(unit, goal)) return { arrives: true, end: 'arrived' };
  const range = moveRange(s, unit);
  if (canReach(range, goal)) return { arrives: true, end: 'withinReach' };
  const movement = movementOf(s, unit);
  const dest = canWalk(s, goal, movement) ? stepToward(range, overGroundTo(s, movement, goal)) : null;
  const path = dest && plannedPath(s, unit, dest);
  return path ? { arrives: false, path } : null;
}

/** Por que no puede ir alli (`travelProblem`). */
export type TravelProblem = Extract<ActionRejection, 'offBoard' | 'unreachable' | 'withinReach'>;

/**
 * Por que no puede empezar ahora un viaje hacia `goal` (null = puede): una casilla del mapa que
 * pueda pisar, a la que no llegue ya este turno (ni sea donde esta: 'withinReach', para eso se
 * mueve) y hacia la que pueda dar ya un paso.
 */
export function travelProblem(s: GameState, unit: Unit, goal: Pos): TravelProblem | null {
  if (!isOnBoard(s, goal)) return 'offBoard';
  if (!canWalk(s, goal, movementOf(s, unit))) return 'unreachable';
  const step = travelStepOf(s, unit, goal);
  if (!step) return 'unreachable';
  return step.arrives ? 'withinReach' : null;
}

/**
 * Acaba la orden de ir alli de la unidad porque la mueven a mano (moverla, unirla, subirla, atacar
 * sin haberse movido): como quitarla, su suceso 'standingOrder' sin orden; ninguno si no la llevaba.
 */
export function endGotoByHand(team: TeamId, unit: Unit): GameEvent[] {
  if (unit.standingOrder?.kind !== 'goto') return [];
  delete unit.standingOrder;
  return [{ kind: 'standingOrder', actor: team, uids: [unit.uid], order: null }];
}

/** Acaba la orden de ir alli de la unidad, cumplida como diga `end` (ha llegado, ya llega o le han cortado el camino). */
export function finishGoto(team: TeamId, unit: Unit, end: GotoEnd): GameEvent[] {
  delete unit.standingOrder;
  return [{ kind: 'standingOrderDone', actor: team, uid: unit.uid, end }];
}

/** Como se cumple una orden de ir alli. */
export type GotoEnd = Exclude<StandingOrderEnd, 'fulfilled'>;
