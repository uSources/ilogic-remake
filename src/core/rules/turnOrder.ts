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
  if (at < 0) throw new Error(`El equipo ${team} no esta en la partida (hay ${order.length})`);
  return { thisRound: order.slice(at + 1), nextRound: order.slice(0, at) };
}

/** Un paso de lo que viene tras el turno de un equipo: el turno de otro, o el fin de ronda. */
export type TurnStep = { kind: 'team'; team: TeamId } | { kind: 'roundEnd' };

/**
 * Lo que viene tras el turno de `team` hasta que le vuelve a tocar: los turnos de los equipos de
 * despues, el fin de ronda (siempre, una vez) y los de los equipos de antes. Es perezoso: cada equipo
 * se mira al llegar a el (`takesTurn`), asi que quien cae durante un turno ya no juega. Quien lo
 * recorre juega cada turno y hace el fin de ronda (la escena anima, las herramientas no).
 */
export function* othersAfter(s: GameState, team: TeamId): Generator<TurnStep> {
  const { thisRound, nextRound } = turnsAfter(s, team);
  for (const other of thisRound) if (takesTurn(s, other)) yield { kind: 'team', team: other };
  yield { kind: 'roundEnd' };
  for (const other of nextRound) if (takesTurn(s, other)) yield { kind: 'team', team: other };
}
