/**
 * Controladores que mandan ellos mismos sus acciones (deciden mirando cada resultado): la IA (fase 6
 * la convertira en uno que solo propone) y el que cumple ya, en el turno, las ordenes permanentes
 * (`autopilotController`). Se les da un `ActionDispatcher` que las apunta, y la sesion las recibe
 * como pasos 'applied': asi quedan en su registro igual que las demas.
 */
import { assistTurn } from '../autopilot/standingOrders';
import { dispatch, ownTeamOnly } from '../actions/dispatch';
import { sessionOnlyProblem } from '../actions/turn';
import type { ActionDispatcher } from '../actions/types';
import type { GameEvent, TeamId } from '../model';
import type { Controller, TurnPlan, TurnStep } from './controller';

/**
 * El turno del equipo `team` de alguien que manda sus acciones el mismo (`run`, con el dispatcher
 * que se le da): cada accion que manda sale como un paso 'applied', en cuanto la manda. Solo valen
 * acciones de ese equipo ('notYourTurn': la sesion las apunta como suyas) y nunca los limites de
 * turno ('sessionOnly').
 *
 * Lo que manda se hace al mandarlo, pero la sesion lo apunta al recoger su paso 'applied': si entre
 * medias llegara algo fuera de turno (`GameSession.act`), el registro lo pondria antes de una accion
 * ya hecha. No pasa en la partida (la escena y la red solo mandan entre pasos de la sesion, y cada
 * accion de estos controladores sale en el mismo paso en que se manda); la fase 6, en la que la IA
 * solo propone, quita los pasos 'applied'.
 */
export function* selfDispatched(team: TeamId, run: (dispatcher: ActionDispatcher) => Iterator<GameEvent, unknown>): TurnPlan {
  const sent: TurnStep[] = [];
  const recording = ownTeamOnly(team, (s, actor, action) => {
    const sessionOnly = sessionOnlyProblem(action);
    if (sessionOnly) return { ok: false, reason: sessionOnly };
    const result = dispatch(s, actor, action);
    sent.push({ kind: 'applied', action, result });
    return result;
  });
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
