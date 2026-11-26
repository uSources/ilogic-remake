/**
 * Quien lleva la partida que juega la persona: la sesion de esta pantalla (`localRunner`) o, por la
 * red, la sala del servidor (`OnlinePlay`, systems/net/onlinePlay.ts). `TurnControls` solo habla con
 * esto: hace las acciones de quien mira, acaba su turno y espera a que vuelva a tocarle, enseñando lo
 * que hacen los demas. Asi el turno se juega igual en una partida de esta pantalla y en una por la red.
 * En esta pantalla puede haber varias personas por turnos: al tocarle a otra, se le pasa la pantalla
 * (`Onlooker.handTo`, systems/turn/hotSeat.ts) y quien mira pasa a ser ella.
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
  /** Hace una accion de quien mira. La partida que se ve ya queda como despues; las piezas las pone al dia quien la anima, al acabar. */
  act(action: GameAction): Promise<RunnerReply>;
  /** Quien mira acaba su turno. */
  finishTurn(): void;
  /** Lleva la partida hasta que vuelve a tocar a quien mira (o se acaba), enseñando con `show` lo de los demas. */
  untilInput(show: ShowEvents): Promise<RunnerStop>;
}

/** Quien mira en esta pantalla: con varias personas por turnos, la que juega ahora (systems/turn/hotSeat.ts). */
export interface Onlooker {
  readonly team: TeamId;
  /** Le toca a `team`, una persona de esta pantalla: si no es quien mira, se le pasa la pantalla (acaba cuando esta lista). */
  handTo(team: TeamId): Promise<void>;
}

/** Una partida de esta pantalla: todo por su sesion (la IA y las ordenes, paso a paso), por quien mira ahora. */
export function localRunner(session: GameSession, onlooker: Onlooker): MatchRunner {
  return {
    session,
    act: (action) => Promise.resolve(replyOf(session.act(onlooker.team, action))),
    finishTurn: () => session.finishInput(onlooker.team),
    untilInput: (show) => stepUntilInput(session, onlooker, show),
  };
}

const replyOf = (result: ReturnType<GameSession['act']>): RunnerReply =>
  result.ok ? { ok: true, events: result.events } : { ok: false, notice: result.reason };

/** Los pasos de la sesion, cada uno enseñado, hasta que espera a una persona (con la pantalla ya en sus manos) o se acaba. */
async function stepUntilInput(session: GameSession, onlooker: Onlooker, show: ShowEvents): Promise<RunnerStop> {
  for (;;) {
    const step = session.step();
    if (step.kind === 'over') return { kind: 'over', result: step.result };
    if (step.kind === 'awaitingInput') {
      await onlooker.handTo(step.team);
      return { kind: 'input' };
    }
    await show(step.events);
  }
}
