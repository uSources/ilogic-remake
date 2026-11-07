/**
 * Los turnos: empezar el del equipo al que le toca ('startTurn') y acabarlo ('endTurn'), con lo que
 * pasa solo en cada momento. `TURN_START_PHASES` y `TURN_END_PHASES` son, como ROUND_PHASES
 * (rules/round.ts) para la ronda, la lista de pasos de cada uno, en orden (y detras, los propios del
 * modo: `GameMode.turnPhases`). Lo que antes hacia la escena al empezar o acabar el turno de la
 * persona (y `npm run play` no hacia) ahora lo hace la partida para todos los equipos, sea quien sea
 * quien los juegue. Cada paso hace acciones del equipo por `perform` (las mismas comprobaciones que
 * dispatch: un equipo que ya ha perdido no hace nada) y devuelve sus sucesos; un paso nuevo es una
 * entrada mas, en su sitio. Empezar y acabar los turnos es cosa de la sesion (core/session), no de
 * quien juega el equipo.
 */
import { assistTurn } from '../autopilot/standingOrders';
import { carryOut } from './plan';
import { playerView, seeing } from '../playerView';
import { gameModeOf, type TurnPhase } from '../modes';
import { autoCapturers } from '../rules/capture';
import { endRound } from '../rules/round';
import { isMatchOver } from '../rules/victory';
import { nextTurn } from '../rules/turnOrder';
import type {
  ActionDispatcher,
  ActionRegistry,
  ActionRejection,
  ActionResult,
  GameAction,
  GameEvent,
  GameState,
  StandingOrderMoment,
  TeamId,
} from '../model';

/** Los sucesos de una accion hecha (ninguno si no valia). */
const eventsOf = (result: ActionResult): GameEvent[] => (result.ok ? result.events : []);

/**
 * [CAMBIO] Ordenes permanentes: las unidades con una orden de ese momento del turno la cumplen
 * (core/autopilot, no la IA), sea quien sea quien juegue el equipo: al empezarlo, las de ir alli dan
 * su paso (y despues quien juega puede seguir con ellas); al acabarlo, las de pelear que siguen sin usar.
 */
const followStandingOrders =
  (moment: StandingOrderMoment) =>
  (s: GameState, team: TeamId, perform: ActionDispatcher): GameEvent[] => {
    // Las cumple la partida con lo que sabe el equipo (su vista), como cualquiera que decide por el.
    const view = playerView(s, team);
    return carryOut(seeing(view, assistTurn(view.state, team, moment)), (action) => perform(s, team, action)).events;
  };

/** [CAMBIO] Las que se han quedado sin usar encima de un edificio que pueden capturar, siguen capturando. */
function keepCapturing(s: GameState, team: TeamId, perform: ActionDispatcher): GameEvent[] {
  return autoCapturers(s, team).flatMap((unit) => eventsOf(perform(s, team, { kind: 'capture', uid: unit.uid })));
}

/** Lo que pasa solo al empezar el turno de un equipo, en orden. */
export const TURN_START_PHASES: readonly TurnPhase[] = [{ id: 'gotoOrders', run: followStandingOrders('turnStart') }];

/** Lo que pasa solo al acabar el turno de un equipo, en orden (antes del fin de ronda, si acaba). */
export const TURN_END_PHASES: readonly TurnPhase[] = [
  { id: 'standingOrders', run: followStandingOrders('turnEnd') },
  // Despues de las ordenes: una que lleva a capturar deja a la unidad encima, ya usada.
  { id: 'captures', run: keepCapturing },
];

/** Los pasos de turno de todos y, detras, los del modo de la partida. */
function runPhases(
  common: readonly TurnPhase[],
  ofMode: readonly TurnPhase[] | undefined,
  s: GameState,
  team: TeamId,
  perform: ActionDispatcher,
): GameEvent[] {
  const events: GameEvent[] = [];
  for (const phase of [...common, ...(ofMode ?? [])]) {
    // Si un paso ha decidido la partida (una captura que sigue, una orden que gana), nadie hace nada mas.
    if (isMatchOver(s)) break;
    events.push(...phase.run(s, team, perform));
  }
  return events;
}

/** Pasa el turno al siguiente que juega; si con eso se da la vuelta al orden, antes acaba la ronda. */
function passTurn(s: GameState, team: TeamId): GameEvent[] {
  const next = nextTurn(s);
  if (!next) return [];
  const passed: GameEvent = { kind: 'turnEnd', actor: team, next: next.team };
  const round = next.endsRound ? endRound(s) : [];
  s.turn = next.team;
  s.turnStarted = false;
  return [passed, ...round];
}

export const TURN_ACTIONS: Pick<ActionRegistry, 'startTurn' | 'endTurn'> = {
  startTurn: {
    // De quien es el turno lo miran ACTION_GUARDS; aqui, que no se empiece dos veces.
    validate: (s) => (s.turnStarted ? 'turnStarted' : null),
    apply: (s, team, _action, _dice, perform) => {
      s.turnStarted = true;
      const started: GameEvent = { kind: 'turnStart', actor: team, day: s.day };
      return [started, ...runPhases(TURN_START_PHASES, gameModeOf(s).turnPhases?.start, s, team, perform)];
    },
  },
  endTurn: {
    validate: () => null,
    // Si lo que pasa al acabar el turno decide la partida, el turno no se pasa: ni ronda nueva, ni
    // ingresos, ni otro dia (la partida se queda en el dia y el turno en que se decidio).
    apply: (s, team, _action, _dice, perform) => {
      const phases = runPhases(TURN_END_PHASES, gameModeOf(s).turnPhases?.end, s, team, perform);
      return isMatchOver(s) ? phases : [...phases, ...passTurn(s, team)];
    },
  },
};

/** Empezar o acabar un turno: lo manda la sesion (core/session), no quien juega el equipo. */
export const isTurnBoundary = (action: GameAction): boolean => action.kind === 'startTurn' || action.kind === 'endTurn';

/**
 * Por que quien juega un equipo no puede mandar esta accion por su cuenta: empezar y acabar el turno
 * son de la sesion ('sessionOnly'). La regla, una vez: la usan `GameSession.act`, lo que proponen
 * los controladores y lo que mandan los que mandan ellos mismos (la IA).
 */
export const sessionOnlyProblem = (action: GameAction): ActionRejection | null => (isTurnBoundary(action) ? 'sessionOnly' : null);

/** Lo hecho (un paso de la sesion, una entrada del registro) es empezar un turno. */
export const startsTurn = (done: { readonly action: GameAction }): boolean => done.action.kind === 'startTurn';
