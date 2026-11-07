/**
 * Lo que dice el tipo de unidad de su arma, sin mirar nada mas de la partida: a que distancias llega y
 * a quien le hace daño. Es la base del combate (rules/combat.ts) y de las reglas de contraataque de
 * los modulos, que no pueden importar el combate.
 */
import { unitTypeOf } from '../gameContent';
import { manhattan } from '../geom';
import type { GameState, Pos, Unit } from '../model';
import { canFight } from '../util/predicates';

/** El tipo de `unit` alcanza de `from` a `to`: ataca, y la distancia esta entre su alcance minimo y el maximo. */
export function inAttackRange(s: GameState, unit: Pick<Unit, 'type'>, from: Pos, to: Pos): boolean {
  const attack = unitTypeOf(s, unit).attack;
  const distance = manhattan(from, to);
  return !!attack && distance >= attack.minRange && distance <= attack.maxRange;
}

/**
 * Probabilidad de acierto de units.json ("attack.hitChance"), sin terreno ni modificadores (0 = no
 * le hace nada).
 */
export function basePower(s: GameState, attacker: Pick<Unit, 'type'>, defender: Pick<Unit, 'type'>): number {
  return unitTypeOf(s, attacker).attack?.hitChance[unitTypeOf(s, defender).id] ?? 0;
}

/** `attacker` puede luchar y hacer dano a una unidad como `defender` (sin mirar distancias). */
export function canDamage(s: GameState, attacker: Unit, defender: Unit): boolean {
  return canFight(s, attacker) && basePower(s, attacker, defender) > 0;
}
