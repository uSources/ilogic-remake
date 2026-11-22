/**
 * La sesion de la pantalla en una partida por la red: la vista que manda el servidor, con la persona
 * en su equipo (`humanController`) y los demas remotos (`remoteController`: la sesion los espera y no
 * juega nada por ellos; lo que hacen llega en lotes). Asi la pantalla pregunta a la partida lo mismo
 * que en una de esta pantalla (a quien se espera, que se puede hacer). Las acciones no se hacen en
 * ella: las decide el servidor (view3d/systems/net/onlinePlay.ts). Sin navegador.
 */
import { controllersFor } from '../core/controllers';
import type { GameState, TeamId } from '../core/model';
import { takesTurn } from '../core/rules';
import { GameSession, humanController, remoteController } from '../core/session';
import { teamIds } from '../core/teams';

/**
 * La sesion sobre esa vista. Si la vista esta en un turno ya empezado, la sesion se pone a esperar a
 * quien le toca sin cambiar nada (la persona, o un remoto).
 */
export function mirrorSession(state: GameState, viewer: TeamId): GameSession {
  const seats = new Map(teamIds(state).map((team) => [team, team === viewer ? humanController() : remoteController()] as const));
  const session = new GameSession(state, controllersFor(state, seats));
  if (state.turnStarted && takesTurn(state, state.turn)) session.step();
  return session;
}
