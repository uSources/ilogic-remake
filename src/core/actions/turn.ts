/**
 * Los turnos: empezar el del equipo al que le toca ('startTurn') y acabarlo ('endTurn'), con lo que
 * pasa solo en cada momento. `TURN_START_PHASES` y `TURN_END_PHASES` son, como ROUND_PHASES
 * (rules/round.ts) para la ronda, la lista de pasos de cada uno, en orden: lo que antes hacia la
 * escena al empezar o acabar el turno de la persona (y `npm run play` no hacia) ahora lo hace la
 * partida para todos los equipos. Cada paso hace acciones del equipo (las mismas entradas de ACTIONS,
 * con su validate) y devuelve sus sucesos; un paso nuevo es una entrada mas, en su sitio.
 */
import { diceOf } from '../dice';
import { canCapture } from '../rules/capture';
import { restoreInvariants } from '../rules/invariants';
import { endRound } from '../rules/round';
import { nextTurn } from '../rules/turnOrder';
import { canMoveNow } from '../rules/unitTurn';
import type { GameActionKind, GameActionOf, GameEvent, GameState, TeamId, Unit } from '../model';
import { CAPTURE_ACTIONS } from './capture';
import { MOVEMENT_ACTIONS } from './movement';
import type { ActionDefinition, ActionRegistry } from './types';

/** Un paso del principio o del final de un turno: lo que hace solo por el equipo `team`, con sus sucesos. */
export interface TurnPhase {
  /** Nombre corto (para depurar). */
  readonly id: string;
  run(s: GameState, team: TeamId): GameEvent[];
}

/**
 * El equipo hace la accion de esa entrada si vale ahora (como dispatch, sin las comprobaciones
 * comunes: es su turno), y la partida queda en orden despues (INVARIANTS).
 */
function actFor<K extends GameActionKind>(
  s: GameState,
  team: TeamId,
  definition: ActionDefinition<K>,
  action: GameActionOf<K>,
): GameEvent[] {
  if (definition.validate(s, team, action)) return [];
  return [...definition.apply(s, team, action, diceOf(s)), ...restoreInvariants(s)];
}

/** Las unidades del equipo que aun no se han movido este turno (y estan en el mapa). */
const readyUnitsOf = (s: GameState, team: TeamId): Unit[] => s.units.filter((unit) => unit.team === team && canMoveNow(unit));

/** [CAMBIO] Viajes de varios turnos: cada unidad de viaje da su paso de este turno (y despues puede seguir). */
function advanceTravels(s: GameState, team: TeamId): GameEvent[] {
  const travelers = readyUnitsOf(s, team).filter((unit) => unit.travelTo);
  return travelers.flatMap((unit) => actFor(s, team, MOVEMENT_ACTIONS.travelStep, { kind: 'travelStep', uid: unit.uid }));
}

/** [CAMBIO] Las unidades del equipo sin usar encima de un edificio que pueden capturar: capturaran solas al acabar el turno. */
export const autoCapturers = (s: GameState, team: TeamId): Unit[] => readyUnitsOf(s, team).filter((unit) => canCapture(s, unit));

/** Las que se han quedado sin usar encima de un edificio que pueden capturar, siguen capturando. */
function keepCapturing(s: GameState, team: TeamId): GameEvent[] {
  return autoCapturers(s, team).flatMap((unit) => actFor(s, team, CAPTURE_ACTIONS.capture, { kind: 'capture', uid: unit.uid }));
}

/** Lo que pasa solo al empezar el turno de un equipo, en orden. */
export const TURN_START_PHASES: readonly TurnPhase[] = [{ id: 'travels', run: advanceTravels }];

/**
 * Lo que pasa solo al acabar el turno de un equipo, en orden (antes del fin de ronda, si acaba). Las
 * ordenes permanentes no estan aqui: las cumple quien juega el equipo (su piloto automatico, que es
 * un controlador: core/session), antes de pedir el fin del turno.
 */
export const TURN_END_PHASES: readonly TurnPhase[] = [{ id: 'captures', run: keepCapturing }];

const runPhases = (phases: readonly TurnPhase[], s: GameState, team: TeamId): GameEvent[] => phases.flatMap((phase) => phase.run(s, team));

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
    apply: (s, team) => {
      s.turnStarted = true;
      return [{ kind: 'turnStart', actor: team, day: s.day }, ...runPhases(TURN_START_PHASES, s, team)];
    },
  },
  endTurn: {
    validate: () => null,
    apply: (s, team) => [...runPhases(TURN_END_PHASES, s, team), ...passTurn(s, team)],
  },
};
