/**
 * Los viajes de varios turnos (`Unit.travelTo`, «Ir alli»): a donde se puede viajar, el paso de cada
 * turno y como acaba. Las acciones 'travel' y 'travelStep' (actions/movement.ts) los usan, y las que
 * mueven a mano (mover, unirse, subir, atacar) acaban el viaje con `endTravel`.
 */
import { samePos } from '../geom';
import type { ActionRejection, GameEvent, GameState, Pos, TeamId, TravelEnd, Unit } from '../model';
import { isOnBoard } from '../mapGrid';
import { canReach, moveRange, plannedPath, stepToward } from './movement';
import { canWalk, movementOf } from './queries';

/** El paso de este turno de un viaje: llega (sin moverse: el ultimo trozo es de quien juega) o anda un camino. */
export type TravelStep = { arrives: true; end: Extract<TravelEnd, 'arrived' | 'withinReach'> } | { arrives: false; path: Pos[] };

/**
 * El paso de este turno hacia `goal`: si ya esta ('arrived') o llega este turno ('withinReach'), el
 * viaje acaba sin moverla; si no, el camino a la casilla del alcance que mas acerca (stepToward).
 * Null si no se acerca nada.
 */
export function travelStepOf(s: GameState, unit: Unit, goal: Pos): TravelStep | null {
  if (samePos(unit, goal)) return { arrives: true, end: 'arrived' };
  const range = moveRange(s, unit);
  if (canReach(range, goal)) return { arrives: true, end: 'withinReach' };
  const dest = stepToward(s, unit, goal, range);
  const path = dest && plannedPath(s, unit, dest);
  return path ? { arrives: false, path } : null;
}

/**
 * Por que no puede empezar ahora un viaje hacia `goal` (null = puede): una casilla del mapa que
 * pueda pisar, a la que no llegue ya este turno (ni sea donde esta: 'withinReach', para eso se
 * mueve) y hacia la que pueda dar ya un paso.
 */
export function travelProblem(s: GameState, unit: Unit, goal: Pos): ActionRejection | null {
  if (!isOnBoard(s, goal)) return 'offBoard';
  if (!canWalk(s, goal, movementOf(s, unit))) return 'unreachable';
  const step = travelStepOf(s, unit, goal);
  if (!step) return 'unreachable';
  return step.arrives ? 'withinReach' : null;
}

/** El suceso de que el viaje de la unidad acaba, y por que. */
const travelEndEvent = (team: TeamId, unit: Unit, end: TravelEnd): GameEvent => ({
  kind: 'travel',
  actor: team,
  uid: unit.uid,
  to: null,
  end,
});

/**
 * Acaba el viaje de la unidad, si lo llevaba (ya no viaja): su suceso, o ninguno. Lo usan las acciones
 * que la mueven a mano ('cancelled') y el paso del viaje (al llegar o con emboscada).
 */
export function endTravel(team: TeamId, unit: Unit, end: TravelEnd = 'cancelled'): GameEvent[] {
  if (!unit.travelTo) return [];
  delete unit.travelTo;
  return [travelEndEvent(team, unit, end)];
}
