/** Lo que se apunta de un ataque mientras se resuelve (COMBAT_RESOLUTION, actions/combat.ts). */
import type { GeneralCharge, Unit } from '../model';
import { isAlive } from '../util/predicates';

/** Un ataque a medio resolver: lo que van dejando sus pasos y acaba en su suceso. */
export interface AttackRecord {
  readonly attacker: Unit;
  readonly defender: Unit;
  /** Vida que ha perdido el defensor. */
  damage: number;
  /** Vida que ha perdido el atacante en el contraataque. */
  counter: number;
  /** Dinero cobrado por destruir a la otra (botin). */
  bounty: number;
  /** Carga que ha ganado el general de cada equipo. */
  charge: GeneralCharge[];
}

/** Un ataque recien empezado: nada hecho aun. */
export const newAttackRecord = (attacker: Unit, defender: Unit): AttackRecord => ({
  attacker,
  defender,
  damage: 0,
  counter: 0,
  bounty: 0,
  charge: [],
});

/** Si una de las dos ha caido (solo puede caer una: sin vida no se contraataca), quien la ha destruido y cual. */
export function fallenIn(attack: AttackRecord): { winner: Unit; loser: Unit } | null {
  if (!isAlive(attack.defender) && isAlive(attack.attacker)) return { winner: attack.attacker, loser: attack.defender };
  if (!isAlive(attack.attacker) && isAlive(attack.defender)) return { winner: attack.defender, loser: attack.attacker };
  return null;
}
