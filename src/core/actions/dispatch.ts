/**
 * La unica via para cambiar una partida: `dispatch(s, team, action)`. Comprueba la accion contra la
 * partida (las comprobaciones comunes, ACTION_GUARDS, y su `validate`), la hace (su `apply`, con
 * los dados de la partida) y repasa las INVARIANTS.
 * La usan la escena, la IA, la partida por texto y las herramientas; un cliente remoto o una
 * repeticion mandarian lo mismo.
 */
import { diceOf } from '../dice';
import type { ActionRejection, ActionResult, GameAction, GameActionOf, GameEvent, GameState, TeamId } from '../model';
import { guardProblem } from './guards';
import { isGameAction } from './shape';
import { restoreInvariants } from '../rules/invariants';
import { forgetUndoableMoves } from '../rules/undo';
import { noteFallenTeams } from '../rules/victory';
import { recordEvents } from '../stats';
import { ACTIONS } from './registry';
import type {
  ActionDefinition,
  ActionDispatcher,
  CompositeActionDefinition,
  CompositeActionKind,
  CompositeActionRegistry,
  PlainActionKind,
  PlainActionRegistry,
} from './types';

/** Las acciones que no hacen otras y las de turno, cada una con su forma de entrada. */
const PLAIN: PlainActionRegistry = ACTIONS;
const COMPOSITE: CompositeActionRegistry = ACTIONS;

const isComposite = (action: GameAction): action is GameActionOf<CompositeActionKind> => Object.hasOwn(COMPOSITE, action.kind);
const plainOf = <K extends PlainActionKind>(kind: K): ActionDefinition<K> => PLAIN[kind];
const compositeOf = <K extends CompositeActionKind>(kind: K): CompositeActionDefinition<K> => COMPOSITE[kind];

/** Lo que tienen todas las entradas: cuando vale (`validate`), si deja deshacer y si vale fuera del turno. */
type ActionRules = Pick<ActionDefinition<GameAction['kind']>, 'validate' | 'keepsUndo' | 'anyTime'>;
const rulesOf = (action: GameAction): ActionRules => (isComposite(action) ? compositeOf(action.kind) : plainOf(action.kind));

/**
 * Por que no vale ahora la accion para el equipo `team` (null = vale): las comprobaciones comunes
 * (ACTION_GUARDS) y las de la accion. No cambia nada.
 */
export function actionProblem(s: GameState, team: TeamId, action: GameAction): ActionRejection | null {
  return guardProblem(s, team, action, isAnyTime(action)) ?? rulesOf(action).validate(s, team, action);
}

/** La accion vale tambien fuera del turno de quien la manda (`ActionDefinition.anyTime`: rendirse). */
export const isAnyTime = (action: GameAction): boolean => isGameAction(action) && rulesOf(action).anyTime === true;

/** La accion vale ahora para el equipo `team`. */
export const isValidAction = (s: GameState, team: TeamId, action: GameAction): boolean => actionProblem(s, team, action) === null;

/**
 * `dispatcher`, pero solo para acciones del equipo `team` (las de otro, aunque valgan en cualquier
 * momento, no son de este turno: 'notYourTurn'). Lo que reciben los pasos de turno y quien manda el
 * mismo sus acciones (session/selfDispatched.ts): asi nada queda apuntado como de otro equipo.
 */
export const ownTeamOnly =
  (team: TeamId, dispatcher: ActionDispatcher): ActionDispatcher =>
  (s, actor, action) =>
    actor === team ? dispatcher(s, actor, action) : { ok: false, reason: 'notYourTurn' };

/**
 * Hace la accion ya comprobada (su `apply`; solo las de turno reciben por donde mandar otras), olvida
 * lo que se podia deshacer si la accion cuenta algo nuevo de la partida (sin `keepsUndo`) y la manda
 * el equipo que juega (una de otro fuera de su turno, rendirse, no le quita al que juega lo que puede
 * deshacer) y deja la partida en orden (INVARIANTS).
 */
function applyAction(s: GameState, team: TeamId, action: GameAction): GameEvent[] {
  const onTurn = team === s.turn;
  const applied = isComposite(action)
    ? compositeOf(action.kind).apply(s, team, action, diceOf(s), ownTeamOnly(team, perform))
    : plainOf(action.kind).apply(s, team, action, diceOf(s));
  if (!rulesOf(action).keepsUndo && onTurn) forgetUndoableMoves(s);
  // Despues de dejarla en orden (los muertos ya fuera), quien haya caido con esta accion.
  return [...applied, ...restoreInvariants(s), ...noteFallenTeams(s, team)];
}

/**
 * Comprueba la accion (ACTION_GUARDS y su `validate`) y, si vale, la hace: sus sucesos, o por que no
 * vale. Es lo que hace dispatch, y lo que una accion manda dentro de la suya (los pasos de turno:
 * `CompositeActionDefinition.apply` recibe esto), con las mismas comprobaciones.
 */
function perform(s: GameState, team: TeamId, action: GameAction): ActionResult {
  const reason = actionProblem(s, team, action);
  if (reason) return { ok: false, reason };
  return { ok: true, events: applyAction(s, team, action) };
}

/**
 * El equipo `team` hace la accion: si vale, cambia la partida y devuelve sus sucesos (apuntados en
 * las estadisticas, stats.ts: todos, se animen o no, una sola vez aunque una accion mande otras); si
 * no, no toca nada y dice por que.
 */
export function dispatch(s: GameState, team: TeamId, action: GameAction): ActionResult {
  const result = perform(s, team, action);
  if (result.ok) recordEvents(s, result.events);
  return result;
}
