/**
 * Como se mueve cada cosa en esta partida, sin mirar a las demas unidades: por que casillas puede ir
 * un tipo de movimiento y cuanto le cuesta cada una (`TerrainAccess`), y cuanto puede gastar una
 * unidad en su turno (`MovementProfile`). Lo que cambia segun la partida lo aportan sus modulos de
 * reglas: el coste del terreno (`enterCosts`) y el clima (`moveBudgets`). Quien hay en cada casilla
 * es cosa de rules/passage.ts.
 */
import type { MoveType } from '../content';
import { unitTypeOf } from '../gameContent';
import type { GameState, Pos, Unit } from '../model';
import { hooksOf } from '../ruleModules/ruleset';
import { canWalk } from './queries';

/** Por donde pasa un tipo de movimiento y lo que le cuesta entrar en cada casilla. */
export interface TerrainAccess {
  readonly movement: MoveType;
  /** La casilla esta en el mapa y su terreno deja pasar a este tipo de movimiento. */
  canEnter(pos: Pos): boolean;
  /** Lo que cuesta entrar (1 si ningun modulo dice otra cosa). */
  enterCost(pos: Pos): number;
}

/** El movimiento de una unidad: por donde va, lo que cuesta y lo que puede gastar en un turno. */
export interface MovementProfile extends TerrainAccess {
  /** Lo que puede gastar en un turno (0 = no se mueve). */
  readonly budget: number;
}

/** Lo que cuesta entrar en cualquier casilla si ningun modulo lo cambia (las reglas de 2013). */
const BASE_ENTER_COST = 1;

/** Por donde pasa `movement` en esta partida y lo que le cuesta cada casilla. */
export function terrainAccess(s: GameState, movement: MoveType): TerrainAccess {
  const costRules = hooksOf(s, 'enterCosts');
  return {
    movement,
    canEnter: (pos) => canWalk(s, pos, movement),
    enterCost: (pos) => costRules.reduce((cost, rule) => rule.cost(s, movement, pos, cost), BASE_ENTER_COST),
  };
}

/** El movimiento de la unidad este turno: el de su tipo, con lo que cambien los modulos. */
export function movementProfile(s: GameState, unit: Pick<Unit, 'type'>): MovementProfile {
  return { ...terrainAccess(s, unitTypeOf(s, unit).movement), budget: moveBudget(s, unit) };
}

/** Lo que puede gastar al moverse este turno: su movimiento, cambiado por los `moveBudgets` de los modulos (el clima). */
export function moveBudget(s: GameState, unit: Pick<Unit, 'type'>): number {
  const unitType = unitTypeOf(s, unit);
  return hooksOf(s, 'moveBudgets').reduce((total, rule) => rule.budget(s, unitType, total), unitType.move);
}

/** Lo que cuesta recorrer un camino (sin contar la casilla de salida). */
export function pathCost(access: TerrainAccess, path: readonly Pos[]): number {
  return path.slice(1).reduce((total, step) => total + access.enterCost(step), 0);
}
