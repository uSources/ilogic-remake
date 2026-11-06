/**
 * Controladores que mandan ellos mismos sus acciones (deciden mirando cada resultado): la IA (fase 6
 * la convertira en uno que solo propone) y el que cumple ya, en el turno, las ordenes permanentes
 * (`autopilotController`). Se les da un `ActionDispatcher` que las apunta, y la sesion las recibe
 * como pasos 'applied': asi quedan en su registro igual que las demas.
 */
import { assistTurn } from '../autopilot/standingOrders';
import { dispatch } from '../actions/dispatch';
import { sessionOnlyProblem } from '../actions/turn';
import type { ActionDispatcher } from '../actions/types';
import type { GameEvent, TeamId } from '../model';
import type { Controller, TurnPlan, TurnStep } from './controller';

/**
 * El turno del equipo `team` de alguien que manda sus acciones el mismo (`run`, con el dispatcher
 * que se le da): cada accion que manda sale como un paso 'applied', en cuanto la manda. Solo valen
 * acciones de ese equipo ('notYourTurn': la sesion las apunta como suyas) y nunca los limites de
 * turno ('sessionOnly').
 */
export function* selfDispatched(team: TeamId, run: (dispatcher: ActionDispatcher) => Iterator<GameEvent, unknown>): TurnPlan {
  const sent: TurnStep[] = [];
  const recording: ActionDispatcher = (s, actor, action) => {
    const problem = sessionOnlyProblem(action) ?? (actor === team ? null : 'notYourTurn');
    if (problem) return { ok: false, reason: problem };
    const result = dispatch(s, actor, action);
    sent.push({ kind: 'applied', action, result });
    return result;
  };
  const turn = run(recording);
  for (let step = turn.next(); !step.done; step = turn.next()) yield* sent.splice(0);
  yield* sent.splice(0);
}

/**
 * [CAMBIO] Cumple ya, en su turno, las ordenes permanentes del equipo (`assistTurn`): las unidades con
 * orden que siguen sin usar. Al acabar el turno las cumpliria igual la partida (TURN_END_PHASES); esto
 * es para quien quiere verlas antes de hacer lo demas (la huella, en serie con la IA). No es la IA.
 */
export const autopilotController = (): Controller => ({
  name: 'autopilot',
  playTurn: (s, team) => selfDispatched(team, (dispatcher) => assistTurn(s, team, dispatcher)),
});
