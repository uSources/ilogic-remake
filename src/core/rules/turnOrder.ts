/**
 * El orden de los turnos: los equipos juegan uno tras otro, por su puesto en la partida, y la ronda
 * acaba tras el ultimo. Un equipo derrotado (sin Base o sin nada) ya no juega: con 3 o mas equipos,
 * la partida sigue sin el. Lo que le quede en el mapa se queda y, a proposito, el fin de ronda lo
 * trata como el de cualquiera (sus edificios cobran, sus unidades se curan): no lo usa nadie, asi que
 * no cambia nada, y no hace falta un caso aparte. Es botin para los demas: lo pueden capturar o
 * destruir.
 */
import { teamIds } from '../teams';
import type { GameState, TeamId } from '../model';
import { isDefeated } from './outcome';

/** El equipo aun juega sus turnos (no ha perdido). */
export const takesTurn = (s: GameState, team: TeamId): boolean => !isDefeated(s, team);

/**
 * Los equipos que juegan esta ronda, en orden. Se mira al llegar a cada uno: si uno cae durante el
 * turno de otro, ya no juega.
 */
export function* turnTakers(s: GameState): Generator<TeamId> {
  for (const team of teamIds(s)) if (takesTurn(s, team)) yield team;
}

/**
 * El orden de los demas equipos tras el turno de `team`: los que juegan aun en esta ronda (los de
 * despues) y, tras el fin de ronda, los de la siguiente que van antes que el. Quien juega de verdad
 * se mira al llegar su turno (`takesTurn`).
 */
export function turnsAfter(s: GameState, team: TeamId): { thisRound: TeamId[]; nextRound: TeamId[] } {
  const order = teamIds(s);
  const at = order.indexOf(team);
  return { thisRound: order.slice(at + 1), nextRound: order.slice(0, at) };
}
