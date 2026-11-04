/**
 * Menu de acciones de una unidad (fase 5): que puede hacer ahora, y esperar.
 */

import { tablesOf } from '../gameContent';
import { effectiveStandingOrder } from '../squads/standingOrders';
import { canFight, isCapturer, isPlayer } from '../util/predicates';
import type { GameState, Unit } from '../model';
import { canCapture } from './capture';
import { attackTargets } from './combat';
import { cargoUnits } from './queries';
import { canSupply } from './supply';
import { unloadTiles } from './transport';

/** Terminar el turno de la unidad sin hacer nada mas. */
export function wait(unit: Unit): void {
  unit.active = false;
  unit.canMove = false;
}

export interface UnitActions {
  attack: boolean;
  capture: boolean;
  unload: boolean;
  supply: boolean;
  wait: boolean;
  /** Volver atras sin hacer nada: solo si aun no se ha movido. */
  back: boolean;
  /** [CAMBIO] Ordenes con destino (se elige la casilla despues) y quitar la que tenga. */
  cmdAttack: boolean;
  cmdCapture: boolean;
  cmdDefend: boolean;
  cmdCancel: boolean;
  delete: boolean;
}

/** Algun pasajero se puede bajar a una casilla de al lado. */
function canUnloadSomeone(s: GameState, transport: Unit): boolean {
  if (tablesOf(s).UNIT.maxcarry[transport.type]! <= 0) return false;
  return cargoUnits(s, transport).some((passenger) => unloadTiles(s, transport, passenger).length > 0);
}

export function unitActions(s: GameState, unit: Unit): UnitActions {
  // Las ordenes con destino son solo del jugador: la IA decide sola cada turno.
  const isMine = isPlayer(unit.team);
  return {
    attack: attackTargets(s, unit).length > 0,
    capture: canCapture(s, unit),
    unload: canUnloadSomeone(s, unit),
    supply: canSupply(s, unit),
    wait: true,
    back: unit.canMove,
    cmdAttack: isMine && canFight(s, unit),
    cmdCapture: isMine && isCapturer(s, unit),
    cmdDefend: isMine && canFight(s, unit),
    // Orden propia o de su escuadra.
    cmdCancel: !!effectiveStandingOrder(s, unit),
    delete: true,
  };
}
