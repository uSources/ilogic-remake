/**
 * El orden de los turnos: los equipos juegan uno tras otro, en el orden de la ronda
 * (`GameState.turnOrder`, que pone el modo al crear la partida), y la ronda acaba tras el ultimo. Un
 * equipo derrotado (sin Base, sin nada o rendido) ya no juega: con 3 o mas equipos, la partida
 * sigue sin el. Lo que le quede en el mapa se queda y, a proposito, el fin de ronda lo trata como el
 * de cualquiera (sus edificios cobran, sus unidades se curan): no lo usa nadie, asi que no cambia
 * nada, y no hace falta un caso aparte. Es botin para los demas: lo pueden capturar o destruir.
 */
import type { GameState, TeamId } from '../model';
import { isDefeated } from './victory';

/** El equipo aun juega sus turnos (no ha perdido). */
export const takesTurn = (s: GameState, team: TeamId): boolean => !isDefeated(s, team);

/** A quien le toca despues del turno de ahora, y si antes acaba la ronda (se ha dado la vuelta al orden). */
export interface NextTurn {
  team: TeamId;
  endsRound: boolean;
}

/**
 * El siguiente turno tras el de `s.turn`: el primero que aun juega en el orden de la ronda, dando la
 * vuelta si hace falta (entonces la ronda acaba antes). Se mira al pasar el turno: quien cae durante
 * el turno de otro ya no juega. Null si no juega nadie (la partida ya ha acabado).
 */
export function nextTurn(s: GameState): NextTurn | null {
  const order = s.turnOrder;
  const at = order.indexOf(s.turn);
  for (let step = 1; step <= order.length; step++) {
    const index = at + step;
    const team = order[index % order.length];
    if (team !== undefined && takesTurn(s, team)) return { team, endsRound: index >= order.length };
  }
  return null;
}
