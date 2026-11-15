/**
 * Lo que se cuenta a la persona cuando vuelve su turno: lo que ha pasado mientras jugaban los demas
 * (el fin de ronda, sus ordenes cumplidas, sus viajes que llegan). Lo rellenan los turnos de esta
 * pantalla (turns.ts, paso a paso) y los lotes que llegan por la red (onlinePlay.ts); lo enseña
 * TurnFlow al devolver el mando. Sin Phaser.
 */
import { roundReport, type RoundReport } from '../../core/rules';
import type { GameEvent, GameState, TeamId } from '../../core/model';

export interface TurnSummary {
  /** El fin de ronda (si ha acabado una por medio). */
  report: RoundReport | null;
  /** Unidades propias que han cumplido su orden al acabar el turno (ahora esperan otra). */
  ordersDone: number[];
  /** Unidades propias de viaje que ya llegan este turno (el ultimo trozo lo hace el jugador). */
  arrived: number[];
}

export const newTurnSummary = (): TurnSummary => ({ report: null, ordersDone: [], arrived: [] });

/** Lo que es de un equipo en lo que pasa mientras juegan los demas (para el resumen al volver). */
export function addToSummary(summary: TurnSummary, s: GameState, team: TeamId, events: readonly GameEvent[]): void {
  if (events.some((event) => event.kind === 'newDay')) summary.report = roundReport(s, events);
  for (const event of events) {
    if (event.actor !== team) continue;
    if (event.kind !== 'standingOrderDone') continue;
    // La de ir alli que ya llega: la acaba quien juega (se le avisa); las demas, cumplidas.
    if (event.end === 'withinReach') summary.arrived.push(event.uid);
    else if (event.end === 'fulfilled') summary.ordersDone.push(event.uid);
  }
}
