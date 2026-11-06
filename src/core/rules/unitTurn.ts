/**
 * El turno de cada unidad (`Unit.turnState`): que le queda por hacer y como se gasta. Un solo sitio
 * para lo que antes eran tres banderas (puede actuar, puede moverse, puede disparar) cambiadas a mano
 * en cada accion.
 */
import { isRanged } from '../abilities';
import type { GameState, Unit, UnitTurnState } from '../model';
import { isOnMap } from '../util/predicates';

/** Todos los puntos de su turno en los que puede estar una unidad (para comprobar los que vienen de fuera). */
export const UNIT_TURN_STATES: readonly UnitTurnState[] = ['ready', 'moved', 'done'];

/** El valor es un punto del turno de una unidad. */
export const isUnitTurnState = (value: unknown): value is UnitTurnState => UNIT_TURN_STATES.some((state) => state === value);

/** Aun puede hacer algo este turno (moverse, atacar, capturar, esperar...). */
export const canStillAct = (unit: Pick<Unit, 'turnState'>): boolean => unit.turnState !== 'done';

/** Aun no se ha movido ni ha hecho nada este turno. */
export const canStillMove = (unit: Pick<Unit, 'turnState'>): boolean => unit.turnState === 'ready';

/** Puede hacer algo ya: le queda turno y esta en el mapa (no dentro de un transporte). */
export const canActNow = (unit: Pick<Unit, 'turnState' | 'carrier'>): boolean => canStillAct(unit) && isOnMap(unit);

/** Se puede mover ya: aun no se ha movido y esta en el mapa (no dentro de un transporte). */
export const canMoveNow = (unit: Pick<Unit, 'turnState' | 'carrier'>): boolean => canStillMove(unit) && isOnMap(unit);

/** Aun puede disparar este turno: sin usar o, si no es de distancia, despues de moverse. */
export function canStillFire(s: GameState, unit: Pick<Unit, 'turnState' | 'type'>): boolean {
  if (unit.turnState === 'ready') return true;
  // Las unidades a distancia no pueden mover y disparar en el mismo turno.
  return unit.turnState === 'moved' && !isRanged(s, unit);
}

/** Se ha movido: puede seguir actuando (ver canStillFire). */
export function markMoved(unit: Unit): void {
  unit.turnState = 'moved';
}

/** Gasta el turno de la unidad: ya no hace nada mas hasta la ronda siguiente. */
export function spendUnit(unit: Unit): void {
  unit.turnState = 'done';
}

/** La unidad empieza su turno de nuevo, sin usar (ronda nueva, o deshacer su movimiento). */
export function readyUnit(unit: Unit): void {
  unit.turnState = 'ready';
}
