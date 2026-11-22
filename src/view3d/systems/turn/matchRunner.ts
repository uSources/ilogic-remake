/**
 * Quien lleva la partida que juega la persona: la sesion de esta pantalla (`localRunner`) o, por la
 * red, la sala del servidor (`OnlinePlay`, systems/net/onlinePlay.ts). `TurnControls` solo habla con
 * esto: hace las acciones de quien mira, acaba su turno y espera a que vuelva a tocarle, enseñando lo
 * que hacen los demas. Asi el turno se juega igual en una partida de esta pantalla y en una por la red.
 */
import type { GameAction, GameEvent, MatchResult, TeamId } from '../../../core/model';
import type { GameSession } from '../../../core/session';

/** Lo que se contesta a una accion: sus sucesos (ya en la partida que se ve), o el aviso que dar si no vale. */
export type RunnerReply = { ok: true; events: GameEvent[] } | { ok: false; notice: string };

/** Hasta donde llega la partida al esperar: vuelve a tocar a quien mira, o se ha acabado. */
export type RunnerStop = { kind: 'input' } | { kind: 'over'; result: MatchResult };

/** Enseña lo que han hecho los demas (lo anima y deja las piezas al dia). */
export type ShowEvents = (events: GameEvent[]) => Promise<void>;

export interface MatchRunner {
  /** La sesion con la partida que se ve (por la red, la espejo de la ultima vista: cambia con cada una). */
  readonly session: GameSession;
  /** Hace una accion de quien mira. */
  act(action: GameAction): Promise<RunnerReply>;
  /** Quien mira acaba su turno. */
  finishTurn(): void;
  /** Lleva la partida hasta que vuelve a tocar a quien mira (o se acaba), enseñando con `show` lo de los demas. */
  untilInput(show: ShowEvents): Promise<RunnerStop>;
}

/** Una partida de esta pantalla: todo por su sesion (la IA y las ordenes, paso a paso). */
export function localRunner(session: GameSession, viewer: TeamId): MatchRunner {
  return {
    session,
    act: (action) => Promise.resolve(replyOf(session.act(viewer, action))),
    finishTurn: () => session.finishInput(viewer),
    untilInput: (show) => stepUntilInput(session, show),
  };
}

const replyOf = (result: ReturnType<GameSession['act']>): RunnerReply =>
  result.ok ? { ok: true, events: result.events } : { ok: false, notice: result.reason };

/** Los pasos de la sesion, cada uno enseñado, hasta que espera a alguien o se acaba. */
async function stepUntilInput(session: GameSession, show: ShowEvents): Promise<RunnerStop> {
  for (;;) {
    const step = session.step();
    if (step.kind === 'over') return { kind: 'over', result: step.result };
    if (step.kind !== 'acted') return { kind: 'input' };
    await show(step.events);
  }
}
