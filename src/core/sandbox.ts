/**
 * Lo que solo usan las herramientas y los tests para medir una regla fuera de una partida de verdad:
 * aqui no se comprueba nada (ni turnos, ni alcance, ni vision). El juego (src/, tambien el nucleo)
 * no puede importarlo: lo prohibe ESLint (eslint.config.js, SANDBOX_IS_NOT_THE_GAME). Quien juega
 * usa `dispatch` (core/actions.ts).
 */
import { resolveAttack } from './actions/combat';
import { restoreInvariants } from './rules/invariants';
import type { Dice, GameEventOf, GameState, Unit } from './model';

/**
 * El combate de la accion 'attack' sin comprobar si se puede atacar (el laboratorio de duelos de
 * tools/balance, los tests de la cuenta del combate), y despues lo mismo que dispatch: se quitan las
 * que caen y demas (INVARIANTS). Devuelve el suceso del ataque.
 */
export function uncheckedAttack(s: GameState, attacker: Unit, defender: Unit, dice: Dice): GameEventOf<'attack'> {
  const event = resolveAttack(s, attacker, defender, dice);
  restoreInvariants(s);
  return event;
}
