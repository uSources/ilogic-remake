/**
 * Lo que se comprueba antes de cualquier accion, sea cual sea: que tiene la forma de una accion y
 * que la manda un equipo de la partida. `dispatch` las pasa todas antes del `validate` de la accion; una comprobacion comun nueva
 * es una entrada mas aqui (la de que sea el turno de ese equipo, cuando la partida sepa de quien es:
 * `GameState.turn`, punto C1 de la fase 4).
 */
import { teamIds } from '../teams';
import { isGameAction } from './shape';
import type { ActionRejection, GameAction, GameState, TeamId } from '../model';

export interface ActionGuard {
  /** Nombre corto (para depurar). */
  readonly id: string;
  /** Por que el equipo `team` no puede mandar ahora esta accion (null = puede). */
  check(s: GameState, team: TeamId, action: GameAction): ActionRejection | null;
}

export const ACTION_GUARDS: readonly ActionGuard[] = [
  // La primera: las demas y el `validate` de cada accion leen sus campos sin volver a mirarlos.
  { id: 'shape', check: (_s, _team, action) => (isGameAction(action) ? null : 'badAction') },
  // Un numero que no es un equipo de la partida (un cliente roto, una repeticion de otra partida).
  { id: 'team', check: (s, team) => (teamIds(s).includes(team) ? null : 'notATeam') },
];

/** La primera comprobacion comun que no pasa la accion (null = todas pasan). */
export function guardProblem(s: GameState, team: TeamId, action: GameAction): ActionRejection | null {
  for (const guard of ACTION_GUARDS) {
    const problem = guard.check(s, team, action);
    if (problem) return problem;
  }
  return null;
}
