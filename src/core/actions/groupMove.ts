/**
 * Mover un grupo hacia una casilla: el plan, en dos piezas. Que unidades se mueven y en que orden
 * (`groupMoveOrder`) y el paso de cada una con el mapa como lo han dejado las de antes
 * (`groupMoveStep`). Lo usan el menu (SELECTION_MENU: se puede si alguna se acerca) y la escena, que
 * lo cumple paso a paso con dispatch.
 */
import { manhattan } from '../geom';
import { moveRange, stepToward, straightTo } from '../rules/movement';
import { canMoveNow } from '../rules/unitTurn';
import type { GameActionOf, GameState, Pos, Unit } from '../model';

/** Las unidades de un grupo que se mueven hacia `goal`, en el orden en que lo hacen: primero las mas cercanas. */
export function groupMoveOrder(units: readonly Unit[], goal: Pos): Unit[] {
  return units.filter(canMoveNow).sort((first, second) => manhattan(first, goal) - manhattan(second, goal));
}

/** El paso de una unidad del grupo hacia `goal`: lo mas cerca que puede llegar ahora (null si no se acerca). */
export function groupMoveStep(s: GameState, unit: Unit, goal: Pos): GameActionOf<'move'> | null {
  const step = stepToward(moveRange(s, unit), straightTo(goal));
  return step ? { kind: 'move', uid: unit.uid, to: step } : null;
}
