/**
 * Lo que se comprueba antes de cualquier accion, sea cual sea: que tiene la forma de una accion,
 * que la manda un equipo de la partida, que la partida sigue, que es su turno (y ya lo ha empezado)
 * y que ese equipo sigue jugando. `dispatch` las pasa todas antes del `validate` de la accion; una
 * comprobacion comun nueva es una entrada mas aqui.
 */
import { teamIds } from '../teams';
import { takesTurn } from '../rules/turnOrder';
import { isMatchOver } from '../rules/victory';
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
  // Decidida la partida (matchResult), nadie hace nada mas en ella.
  { id: 'playing', check: (s) => (isMatchOver(s) ? 'matchOver' : null) },
  // Solo juega el equipo al que le toca (GameState.turn).
  { id: 'turn', check: (s, team) => (s.turn === team ? null : 'notYourTurn') },
  // Y su turno empieza antes de nada (lo que pasa solo al empezarlo va primero: los viajes).
  { id: 'started', check: (s, _team, action) => (s.turnStarted || action.kind === 'startTurn' ? null : 'turnNotStarted') },
  // Un equipo que ha perdido (sin Base, sin nada o rendido: isDefeated) ya no juega, aunque le quede
  // algo. Si cae en su propio turno, solo puede pasarlo.
  { id: 'standing', check: (s, team, action) => (takesTurn(s, team) || action.kind === 'endTurn' ? null : 'defeated') },
];

/** La primera comprobacion comun que no pasa la accion (null = todas pasan). */
export function guardProblem(s: GameState, team: TeamId, action: GameAction): ActionRejection | null {
  for (const guard of ACTION_GUARDS) {
    const problem = guard.check(s, team, action);
    if (problem) return problem;
  }
  return null;
}
