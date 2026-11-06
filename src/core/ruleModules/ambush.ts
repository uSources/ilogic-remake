/**
 * [CAMBIO] Emboscadas (ajuste `ambush`): los enemigos que el equipo de quien se mueve no ve no
 * cuentan al calcular por donde va (asi el alcance no delata donde estan). Si el camino choca con
 * uno, se para antes y pierde el turno (su `pathInterruptions`; lo recorre rules/traverse.ts).
 */
import { samePos } from '../geom';
import type { GameState, Pos, Unit } from '../model';
import { areEnemies, isOnMap } from '../util/predicates';
import type { RuleModule } from './hooks';

/** Hay una unidad enemiga en la casilla (escondida o no: al pisarla se descubre). */
const enemyAt = (s: GameState, unit: Unit, pos: Pos): boolean =>
  s.units.some((other) => isOnMap(other) && areEnemies(s, other, unit) && samePos(other, pos));

/** La primera casilla del camino (despues de la de salida) con un enemigo, o null si no hay ninguna. */
function firstEnemyOnPath(s: GameState, unit: Unit, path: readonly Pos[]): number | null {
  const index = path.findIndex((pos, step) => step > 0 && enemyAt(s, unit, pos));
  return index < 0 ? null : index;
}

export const AMBUSH: RuleModule = {
  id: 'ambush',
  isOn: (settings) => settings.ambush,
  hooks: {
    passRules: [
      { id: 'unseenFoes', passage: ({ s, mover, sees }, other) => (areEnemies(s, other, mover) && !sees(other) ? 'unnoticed' : null) },
    ],
    // Al recorrer el camino, el enemigo escondido lo corta: se para antes y pierde el turno.
    pathInterruptions: [{ kind: 'ambush', cutAt: firstEnemyOnPath }],
  },
};
