/**
 * Una partida en juego (`GameSession`): la partida, quien juega cada equipo (`Controller`), el
 * registro de lo que se ha hecho (`log`) y los avisos de cada accion a quien escucha (`subscribe`:
 * la pantalla, la huella, el autoguardado). Lo que mira la pantalla (quien es una persona, cuando se
 * acaba para ella, cuando se guarda) son preguntas aparte, en screen.ts. La partida sabe de quien es el turno (`GameState.turn`);
 * la sesion se lo pide a su controlador, empieza y acaba los turnos ('startTurn', 'endTurn') y para
 * cuando alguien de fuera tiene que decidir o cuando la partida se ha decidido.
 *
 * Avanza paso a paso (`step`): quien la juega decide como esperar entre pasos. Las herramientas la
 * llevan seguida (`runMatch`), la pantalla anima cada paso (`playMatch`).
 */
import { dispatch, isAnyTime } from '../actions/dispatch';
import { sessionOnlyProblem } from '../actions/turn';
import { takesTurn } from '../rules/turnOrder';
import { matchResult } from '../rules/victory';
import { playerView, type PlayerView } from '../playerView';
import type { ActionDispatcher, ActionResult, GameAction, GameEvent, GameState, MatchResult, TeamId } from '../model';
import type { Controller, TurnPlan, TurnStep } from './controller';
import { isOffTurnAction, type LoggedAction } from './log';

/** Lo que ha pasado en un paso: el equipo `team` ha hecho `action` y estos son sus sucesos. */
export interface ActedStep {
  kind: 'acted';
  team: TeamId;
  action: GameAction;
  events: GameEvent[];
}

/** Un paso de la sesion: algo que ha pasado, alguien de fuera que tiene que decidir o el final. */
export type SessionStep = ActedStep | { kind: 'awaitingInput'; team: TeamId } | { kind: 'over'; result: MatchResult };

/** Quien escucha lo que pasa (cada accion hecha, con sus sucesos, en orden). */
export type SessionListener = (step: ActedStep) => void;

/** El turno en curso de un controlador: la vista de su equipo, su plan y lo que hay que contestarle (el resultado de lo que propuso). */
interface TurnInPlay {
  team: TeamId;
  /** Lo que sabe su equipo: la sesion la pone al dia tras cada accion hecha (de quien sea). */
  view: PlayerView;
  plan: TurnPlan;
  reply: ActionResult | undefined;
}

/** Lo que se le puede dar a una sesion ademas de sus controladores. */
export interface SessionOptions {
  /**
   * De donde llegan acciones de otros equipos fuera de su turno, en el momento en que llegan (la
   * sesion lo mira antes de cada paso): la repeticion las saca del registro en su sitio
   * (replaySession). En una partida, llegan por `act`.
   */
  offTurnFeed?: (s: GameState) => LoggedAction | null;
}

export class GameSession {
  /** Lo que se ha hecho, en orden (para repetirlo: replaySession). */
  readonly log: LoggedAction[] = [];
  private readonly listeners = new Set<SessionListener>();
  private current: TurnInPlay | null = null;
  /** El equipo al que se espera (decide alguien de fuera), o null. */
  private awaiting: TeamId | null = null;

  /** `controllers`: el de cada equipo, por su numero. */
  constructor(
    readonly state: GameState,
    private readonly controllers: readonly Controller[],
    private readonly options: SessionOptions = {},
  ) {
    if (controllers.length !== state.teams.length)
      throw new Error(`Hay ${state.teams.length} equipos y ${controllers.length} controladores: uno por equipo`);
  }

  /** Como va la partida (igual para todos). */
  get result(): MatchResult {
    return matchResult(this.state);
  }

  /** El equipo al que se espera para que decida (una persona en la pantalla, un jugador remoto), o null. */
  get awaitingInput(): TeamId | null {
    return this.awaiting;
  }

  /** Quien juega ese equipo. */
  controllerOf(team: TeamId): Controller {
    const controller = this.controllers[team];
    if (!controller) throw new Error(`El equipo ${team} no esta en la partida`);
    return controller;
  }

  /** Avisar de cada accion hecha. Devuelve como dejar de escuchar. */
  subscribe(listener: SessionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Una accion del equipo al que se espera (la decide alguien de fuera). Mientras no se le espera,
   * no vale ('notYourTurn'): su turno no ha llegado o lo esta jugando su controlador; las que valen
   * en cualquier momento (rendirse, `ActionDefinition.anyTime`) si. Empezar y acabar el turno son
   * de la sesion ('sessionOnly'): para acabarlo, `finishInput`.
   */
  act(team: TeamId, action: GameAction): ActionResult {
    const sessionOnly = sessionOnlyProblem(action);
    if (sessionOnly) return { ok: false, reason: sessionOnly };
    if (this.awaiting !== team && !isAnyTime(action)) return { ok: false, reason: 'notYourTurn' };
    const result = dispatch(this.state, team, action);
    if (result.ok) this.record(team, action, result.events);
    return result;
  }

  /**
   * `act` como `ActionDispatcher` (para quien manda acciones de una persona: la escena, la partida
   * por texto). Solo sobre la partida de la sesion: si se le pasa otra (una copia para simular), es
   * un fallo de quien la usa y lo dice.
   */
  get dispatcher(): ActionDispatcher {
    return (s, team, action) => {
      if (s !== this.state) throw new Error('El dispatcher de la sesion solo manda acciones en su partida (para simular, dispatch)');
      return this.act(team, action);
    };
  }

  /** Quien decidia fuera ha terminado (p. ej. ha pulsado «Fin de turno»): su controlador sigue y acaba el turno. */
  finishInput(team: TeamId): void {
    if (this.awaiting === team) this.awaiting = null;
  }

  /**
   * El siguiente paso: empezar el turno de quien le toca, lo siguiente que haga su controlador o
   * acabar su turno. Para (sin hacer nada) si se espera a alguien de fuera o si la partida ha acabado.
   */
  step(): SessionStep {
    for (;;) {
      const result = this.result;
      if (result.status !== 'playing') return { kind: 'over', result };
      // Lo que llega de otro equipo fuera de su turno entra antes que lo siguiente (ver SessionOptions.offTurnFeed).
      const offTurn = this.options.offTurnFeed?.(this.state);
      if (offTurn) return this.applyOffTurn(offTurn);
      // Al que se esperaba ya no juega (se ha rendido): no se le espera mas, y su turno se pasa.
      if (this.awaiting !== null && !takesTurn(this.state, this.awaiting)) this.awaiting = null;
      if (this.awaiting !== null) return { kind: 'awaitingInput', team: this.awaiting };
      const team = this.state.turn;
      // Si ha caido (en su propio turno, o en una partida guardada asi), ya no juega: lo pasa.
      if (!takesTurn(this.state, team)) return this.endTurn(team);
      if (!this.state.turnStarted) return this.perform(team, { kind: 'startTurn' });
      const step = this.nextStepOf(team);
      if (!step) return this.endTurn(team);
      const outcome = this.follow(team, step);
      if (outcome) return outcome;
    }
  }

  /** Lo siguiente que quiere hacer el controlador del equipo (null: ha acabado su turno). */
  private nextStepOf(team: TeamId): TurnStep | null {
    const current = this.turnOf(team);
    const next = current.plan.next(current.reply);
    current.reply = undefined;
    return next.done ? null : next.value;
  }

  /** El turno en curso del controlador del equipo (lo empieza si aun no lo tenia). */
  private turnOf(team: TeamId): TurnInPlay {
    if (this.current?.team !== team) {
      const view = playerView(this.state, team);
      this.current = { team, view, plan: this.controllerOf(team).playTurn(view), reply: undefined };
    }
    return this.current;
  }

  /**
   * Hace lo que pide un paso del controlador: lo que ha pasado, si ha pasado algo (una accion
   * rechazada no cuenta). Empezar o acabar el turno no se le aceptan: son de la sesion
   * ('sessionOnly'; para acabarlo, el controlador termina su turno).
   */
  private follow(team: TeamId, step: TurnStep): SessionStep | null {
    switch (step.kind) {
      case 'awaitInput':
        this.awaiting = team;
        return { kind: 'awaitingInput', team };
      case 'propose': {
        const sessionOnly = sessionOnlyProblem(step.action);
        const result: ActionResult = sessionOnly ? { ok: false, reason: sessionOnly } : dispatch(this.state, team, step.action);
        this.turnOf(team).reply = result;
        return result.ok ? this.record(team, step.action, result.events) : null;
      }
    }
  }

  /**
   * Hace una accion que ha llegado fuera de turno (`offTurnFeed`), como `act` la habria hecho: solo
   * si lo es (`isOffTurnAction`). Si no vale, quien la trae (una repeticion) no cuadra con la
   * partida: es un fallo y lo dice.
   */
  private applyOffTurn(entry: LoggedAction): ActedStep {
    const { team, action } = entry;
    if (!isOffTurnAction(this.state, entry)) throw new Error(`'${action.kind}' del equipo ${team} no puede llegar fuera de su turno`);
    const result = dispatch(this.state, team, action);
    if (!result.ok) throw new Error(`'${action.kind}' del equipo ${team}, fuera de su turno, no vale: ${result.reason}`);
    return this.record(team, action, result.events);
  }

  /** El turno del equipo acaba: su controlador ya no sigue y le toca al siguiente. */
  private endTurn(team: TeamId): ActedStep {
    this.current = null;
    return this.perform(team, { kind: 'endTurn' });
  }

  /** Una accion que manda la propia sesion (empezar o acabar un turno): siempre vale. */
  private perform(team: TeamId, action: GameAction): ActedStep {
    const result = dispatch(this.state, team, action);
    if (!result.ok) throw new Error(`La sesion no ha podido hacer '${action.kind}' por el equipo ${team}: ${result.reason}`);
    return this.record(team, action, result.events);
  }

  /** Apunta una accion hecha, pone al dia la vista de quien juega (ningun controlador tiene que pedirlo) y avisa a quien escucha. */
  private record(team: TeamId, action: GameAction, events: GameEvent[]): ActedStep {
    const step: ActedStep = { kind: 'acted', team, action, events };
    this.log.push({ team, action });
    this.current?.view.refresh();
    for (const listener of this.listeners) listener(step);
    return step;
  }
}

/** Hasta donde llevar una partida seguida (ademas de hasta el final o hasta que alguien de fuera tenga que decidir). */
export interface RunOptions {
  /** Parar cuando se cumpla (se mira tras cada paso): p. ej. un limite de dias de una herramienta. */
  until?: (s: GameState) => boolean;
}

/**
 * Lleva la partida seguida, sin esperas (las herramientas, los tests): hasta el final, hasta que se
 * cumpla `until` o hasta que tenga que decidir alguien de fuera. Devuelve el ultimo paso.
 */
export function runMatch(session: GameSession, options: RunOptions = {}): SessionStep {
  for (;;) {
    const step = session.step();
    if (step.kind !== 'acted' || options.until?.(session.state)) return step;
  }
}

/**
 * Lleva la partida paso a paso, esperando a `onActed` tras cada uno (la pantalla anima sus sucesos):
 * hasta el final, hasta que tenga que decidir alguien de fuera o hasta que `onActed` diga que no
 * siga (false: se ha cambiado de partida). Devuelve el ultimo paso.
 */
export async function playMatch(session: GameSession, onActed: (step: ActedStep) => Promise<boolean>): Promise<SessionStep> {
  for (;;) {
    const step = session.step();
    if (step.kind !== 'acted' || !(await onActed(step))) return step;
  }
}
