/**
 * El dinero de cada equipo: la unica forma de cobrar (`earn`) y de pagar (`pay`), y el tope
 * (`capFunds`). Lo que pase del maximo (content.maxFunds) se pierde al acabar cada accion y cada
 * ronda, no a mitad: asi el mantenimiento se paga con lo cobrado ese dia, y da igual de donde venga
 * el dinero (edificios, puntos de control, botin, un poder del general).
 */
import { teamState } from '../teams';
import type { GameEvent, GameState, TeamId } from '../model';

/**
 * El equipo cobra `amount` (el tope se aplica despues: ver capFunds). Los sucesos cuentan lo cobrado
 * entero; lo que se pierde por el tope lo cuenta el suceso 'fundsCapped'.
 */
export function earn(s: GameState, team: TeamId, amount: number): void {
  teamState(s, team).funds += amount;
}

/** El equipo paga `amount`, o lo que tenga si no le llega. Devuelve lo pagado. */
export function pay(s: GameState, team: TeamId, amount: number): number {
  const state = teamState(s, team);
  const paid = Math.min(amount, state.funds);
  state.funds -= paid;
  return paid;
}

/**
 * Lo que pase del maximo de dinero se pierde (es una de las INVARIANTS y el ultimo paso del dia).
 * Devuelve un suceso 'fundsCapped' por cada equipo que pierde algo.
 */
export function capFunds(s: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  for (const team of s.teams) {
    const lost = team.funds - s.content.maxFunds;
    if (lost <= 0) continue;
    team.funds = s.content.maxFunds;
    events.push({ kind: 'fundsCapped', actor: null, team: team.id, lost });
  }
  return events;
}
