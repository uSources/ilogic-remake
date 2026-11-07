/** Lo que se apunta de un ataque mientras se resuelve (COMBAT_RESOLUTION, actions/combat.ts; la forma, en model/combat.ts). */
import type { AttackRecord, Unit } from '../model';
import { isAlive } from '../util/predicates';

export type { AttackRecord } from '../model';

/** Un ataque recien empezado: nada hecho aun ni apuntado por ningun modulo. */
export const newAttackRecord = (attacker: Unit, defender: Unit): AttackRecord => ({ attacker, defender, damage: 0, counter: 0, parts: {} });

/** Si una de las dos ha caido (solo puede caer una: sin vida no se contraataca), quien la ha destruido y cual. */
export function fallenIn(attack: AttackRecord): { winner: Unit; loser: Unit } | null {
  if (!isAlive(attack.defender) && isAlive(attack.attacker)) return { winner: attack.attacker, loser: attack.defender };
  if (!isAlive(attack.attacker) && isAlive(attack.defender)) return { winner: attack.defender, loser: attack.attacker };
  return null;
}
