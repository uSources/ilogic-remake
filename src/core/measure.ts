/**
 * Lo que solo usan las herramientas y los tests para medir una regla fuera de una partida de verdad:
 * aqui no se comprueba nada (ni turnos, ni alcance, ni vision). ESLint (eslint.config.js) prohibe
 * importar este fichero desde cualquier fichero de src/, tambien del nucleo y con cualquier ruta
 * (MEASURING_IS_NOT_THE_GAME), y usar `resolveAttack` fuera de su modulo (actions/combat.ts) y de aqui
 * (UNCHECKED_ATTACK_ONLY_IN_MEASURE). (No es el modo de juego 'sandbox', la partida para mirar.) Quien juega usa `dispatch` (core/actions.ts).
 */
import { resolveAttack } from './actions/combat';
import { restoreInvariants } from './rules/invariants';
import type { Dice, GameEventOf, GameState, Unit } from './model';

/**
 * El combate de la accion 'attack' sin comprobar si se puede atacar (el laboratorio de duelos de
 * tools/balance, los tests de la cuenta del combate), y despues la partida queda en orden como tras
 * dispatch (INVARIANTS: se quitan las que caen y demas). Devuelve solo el suceso del ataque: los de
 * las invariantes (pasajeros que caen...) no le hacen falta a quien mide el combate.
 */
export function uncheckedAttack(s: GameState, attacker: Unit, defender: Unit, dice: Dice): GameEventOf<'attack'> {
  const event = resolveAttack(s, attacker, defender, dice);
  restoreInvariants(s, null);
  return event;
}
