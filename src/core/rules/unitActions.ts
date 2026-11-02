/**
 * Menu de acciones de una unidad (fase 5): que puede hacer ahora, y esperar.
 */
import { UNIT } from '../data';
import type { GameState, Unit } from '../types';
import { canCapture } from './capture';
import { attackTargets } from './combat';
import { cargoUnits } from './queries';
import { canSupply } from './supply';
import { unloadTiles } from './transport';

/** Terminar el turno de la unidad sin hacer nada mas. */
export function wait(u: Unit): void {
  u.active = false;
  u.canMove = false;
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

export function unitActions(s: GameState, u: Unit): UnitActions {
  return {
    attack: attackTargets(s, u).length > 0,
    capture: canCapture(s, u),
    unload: UNIT.maxcarry[u.type]! > 0 && cargoUnits(s, u).some((c) => unloadTiles(s, u, c).length > 0),
    supply: canSupply(s, u),
    wait: true,
    back: u.canMove,
    cmdAttack: u.team === 0 && !!UNIT.canfight[u.type],
    cmdCapture: u.team === 0 && !!UNIT.cancapt[u.type],
    cmdDefend: u.team === 0 && !!UNIT.canfight[u.type],
    // Orden propia o de su escuadra (como effectiveCommand en squads.ts, sin importarlo: ciclo).
    cmdCancel: !u.order && (!!u.command || !!s.squads?.find((q) => q.id === u.squad)?.command),
    delete: true,
  };
}
