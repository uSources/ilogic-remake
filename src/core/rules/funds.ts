/**
 * El dinero de cada equipo: la unica forma de cobrar (`earn`) y de pagar (`pay`), y el tope
 * (`capFunds`). Lo que pase del maximo (content.maxFunds) se pierde al acabar cada accion y cada
 * ronda, no a mitad: asi el mantenimiento se paga con lo cobrado ese dia, y da igual de donde venga
 * el dinero (edificios, puntos de control, botin, un poder del general).
 */
import { teamState } from '../teams';
import type { GameState, TeamId } from '../model';

/** El equipo cobra `amount` (el tope se aplica despues: ver capFunds). */
export function earn(s: GameState, team: TeamId, amount: number): void {
  teamState(s, team).funds += amount;
}

/** El equipo paga `amount`, o lo que tenga si no le llega. Devuelve lo pagado. */
export function pay(s: GameState, team: TeamId, amount: number): number {
  const funds = teamState(s, team);
  const paid = Math.min(amount, funds.funds);
  funds.funds -= paid;
  return paid;
}

/** Lo que pase del maximo de dinero se pierde (es una de las INVARIANTS y el ultimo paso del dia). */
export function capFunds(s: GameState): void {
  for (const team of s.teams) team.funds = Math.min(team.funds, s.content.maxFunds);
}
