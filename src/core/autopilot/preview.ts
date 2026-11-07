/**
 * [CAMBIO] La prevision de las ordenes permanentes de un equipo (las flechas de intencion de la
 * pantalla): lo que haran al terminar su turno, sin tocar la partida. Se cumple su plan (assistTurn)
 * sobre una copia con los enemigos que el equipo no ve quitados, asi que la prevision no puede
 * delatarlos (ni como objetivo, ni por un camino que los rodee o una emboscada) y sin combates ni
 * emboscadas dice lo que despues hacen.
 */
import { posOf } from '../geom';
import { carryOut } from '../actions/plan';
import { cloneState } from '../gameContent';
import { unitsKnownTo } from '../playerView';
import { teamUnits } from '../rules/queries';
import { standingOrderAt } from '../squads/standingOrders';
import type { ActionDispatcher, GameAction, GameEvent, GameEventKind, GameEventOf, GameState, Pos, TeamId } from '../model';
import { canAct } from './context';
import { assistTurn } from './standingOrders';

/** [CAMBIO] Lo que hara una unidad con orden al terminar el turno (ver previewStandingOrders). */
export interface StandingOrderIntent {
  /** Camino de este turno, desde donde esta (vacio si no se mueve). */
  path: Pos[];
  /** Casilla de la unidad a la que va a atacar. */
  attack?: Pos;
  /** Edificio que va a capturar (o seguir capturando). */
  capture?: Pos;
  /** Al final del camino se une a otra unidad igual (para curarse). */
  merge?: boolean;
}

/**
 * Semilla de los dados de la copia en la que se simula la prevision: fija, para que la misma partida
 * de siempre la misma prevision, y no la de la partida, que diria como van a salir los combates.
 */
const PREVIEW_DICE_SEED = 0x1d0c;

/** Una accion que propondria el plan de las ordenes, con los sucesos que daria (en la copia de la prevision). */
export interface PlannedAction {
  action: GameAction;
  events: GameEvent[];
}

/**
 * [CAMBIO] Lo que haran las ordenes del equipo al terminar el turno: las acciones que propone su plan
 * (assistTurn), cumplido sobre una copia de la partida sin los enemigos que el equipo no ve (las que
 * no valdrian no salen). No toca `s`. Es una prevision: con enemigos escondidos o la suerte del
 * combate, el turno real puede variar. `simulate` manda las acciones en la copia que se le da:
 * `dispatch` (no el de una sesion, que solo vale para su partida y lo dice: GameSession.dispatcher).
 */
export function plannedStandingOrders(s: GameState, team: TeamId, simulate: ActionDispatcher): PlannedAction[] {
  const copy = withoutHiddenEnemies(s, team);
  copy.dice = PREVIEW_DICE_SEED;
  const planned: PlannedAction[] = [];
  carryOut(assistTurn(copy, team, 'turnEnd'), (action) => {
    const result = simulate(copy, team, action);
    if (result.ok) planned.push({ action, events: result.events });
    return result;
  });
  return planned;
}

/**
 * [CAMBIO] Flechas de intencion: por uid, lo que hara cada unidad del equipo con orden al terminar el
 * turno, sacado de las acciones planeadas (plannedStandingOrders).
 */
export function previewStandingOrders(s: GameState, team: TeamId, simulate: ActionDispatcher): Map<number, StandingOrderIntent> {
  const intents = new Map<number, StandingOrderIntent>();
  const actors = teamUnits(s, team).filter((unit) => standingOrderAt(s, unit, 'turnEnd') && canAct(s, unit));
  if (!actors.length) return intents;
  for (const unit of actors) intents.set(unit.uid, { path: [] });
  for (const planned of plannedStandingOrders(s, team, simulate)) for (const event of planned.events) recordIntent(intents, event);
  return intents;
}

/** Copia de la partida con las unidades que conoce `team` (sin los enemigos que no ve ni lo que llevan dentro: playerView). */
function withoutHiddenEnemies(s: GameState, team: TeamId): GameState {
  const copy = cloneState(s);
  copy.units = unitsKnownTo(copy, team);
  return copy;
}

/** Lo que apunta un suceso de una accion planeada en las intenciones (de la unidad que lo hace). */
type IntentRecorder<K extends GameEventKind> = (intents: Map<number, StandingOrderIntent>, event: GameEventOf<K>) => void;

/** Un camino que sigue a otro empieza donde acabo el anterior: esa casilla no se repite. */
function extendPath(intents: Map<number, StandingOrderIntent>, uid: number, path: readonly Pos[]): StandingOrderIntent | undefined {
  const intent = intents.get(uid);
  if (intent) intent.path = intent.path.length ? [...intent.path, ...path.slice(1)] : path.map((pos) => posOf(pos));
  return intent;
}

/** Lo que se apunta de cada suceso que cuenta para las flechas (los demas no dicen nada de ellas). */
const INTENT_RECORDERS: { [K in GameEventKind]?: IntentRecorder<K> } = {
  move: (intents, event) => void extendPath(intents, event.uid, event.path),
  merge: (intents, event) => {
    const intent = extendPath(intents, event.uid, event.path);
    if (intent) intent.merge = true;
  },
  attack: (intents, event) => {
    const intent = intents.get(event.attacker);
    if (intent && !intent.attack) intent.attack = posOf(event.at);
  },
  capture: (intents, event) => {
    const intent = intents.get(event.uid);
    if (intent) intent.capture = posOf(event.at);
  },
};

/** Lo que se apunta de un suceso, con su tipo (TypeScript no lo deduce solo al indexar la tabla). */
function recorderFor<K extends GameEventKind>(event: GameEventOf<K>): IntentRecorder<K> | undefined {
  const recorders: { [L in GameEventKind]?: IntentRecorder<L> } = INTENT_RECORDERS;
  return recorders[event.kind];
}

/** Apunta en la intencion de su unidad lo que dice un suceso de una accion planeada. */
function recordIntent(intents: Map<number, StandingOrderIntent>, event: GameEvent): void {
  recorderFor(event)?.(intents, event);
}
