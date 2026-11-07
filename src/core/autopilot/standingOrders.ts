/**
 * [CAMBIO] Ordenes permanentes de un equipo (ver StandingOrder en model/standingOrder.ts): las cumple
 * la partida al terminar el turno de cada equipo (assistTurn, fase de TURN_END_PHASES; los pasos de
 * unidad son los mismos que reutiliza la IA), o al darlas (startStandingOrder), y se
 * pueden prever sin tocar la partida (previewStandingOrders, para las flechas de intencion).
 */

import { isAlliedOwner } from '../teams';
import { cloneState } from '../gameContent';
import { manhattan, samePos, posOf } from '../geom';
import { moveRange } from '../rules/movement';
import { buildingAt, teamUnits, unitById } from '../rules/queries';
import { effectiveStandingOrder, standingOrderAt } from '../squads/standingOrders';
import { carryOut } from '../actions/plan';
import { unitsKnownTo } from '../playerView';
import type {
  ActionDispatcher,
  ActionPlan,
  GameAction,
  GameEvent,
  GameState,
  Pos,
  StandingOrderKind,
  StandingOrderMoment,
  TeamId,
  Unit,
} from '../model';
import { act, playCtx, canAct, doMove, finish, needsRepair, type PlayCtx } from './context';
import { visibleFoes } from '../rules/visibility';
import { isCapturer } from '../util/predicates';
import { standingOrderPlayOrder, standingOrderStep, formation, formationFrom } from './formation';
import { captureHere, retreat, tryAttack } from './tactics';
import { fireOnTheWay, guardZone, SHOOT_FROM_HERE } from './engagement';
import { autopilotProfileOf } from './defaultProfile';

/**
 * [CAMBIO] Ordenes de un equipo en ese momento de su turno (`moment`): las unidades con una orden
 * de ese momento (STANDING_ORDER_MOMENT) que siguen sin usar la cumplen. No toca las demas unidades
 * ni compra nada. Devuelve los uid de las que han cumplido su orden (se quedan esperando otra).
 */
export function* assistTurn(s: GameState, team: TeamId, moment: StandingOrderMoment): ActionPlan<number[]> {
  const play = playCtx(team, autopilotProfileOf(s.content));
  const withStandingOrder = teamUnits(s, play.me).filter((unit) => standingOrderAt(s, unit, moment));
  const fulfilled: number[] = [];
  for (const unit of standingOrderPlayOrder(s, withStandingOrder))
    if (yield* unitStandingOrderTurn(s, play, unit.uid)) fulfilled.push(unit.uid);
  return fulfilled;
}

/** [CAMBIO] La unidad empieza ya su orden recien dada (si aun no se ha movido). */
export function* startStandingOrder(s: GameState, uid: number, team: TeamId): ActionPlan<boolean> {
  return yield* unitStandingOrderTurn(s, playCtx(team, autopilotProfileOf(s.content)), uid);
}

/** Lo que necesita cada tipo de orden para jugar el turno de una unidad. */
interface StandingOrderTurnContext {
  s: GameState;
  play: PlayCtx;
  unit: Unit;
  /** Casilla de destino de la orden. */
  at: Pos;
}

/** Juega el turno de una unidad con una orden de ese tipo. Devuelve true si la orden se ha cumplido (o ya no tiene sentido). */
type StandingOrderTurn = (turn: StandingOrderTurnContext) => ActionPlan<boolean>;

/** Ya es suyo el edificio de la casilla. */
const ownsBuildingAt = (s: GameState, play: PlayCtx, at: Pos): boolean => isAlliedOwner(s, buildingAt(s, at)?.owner ?? null, play.me);

/** Dispara sin moverse a lo que tenga a tiro; si no hay nada, espera. */
function* shootFromHereOrWait({ s, play, unit }: StandingOrderTurnContext): ActionPlan {
  if (!(yield* tryAttack(s, play, unit, moveRange(s, unit), SHOOT_FROM_HERE))) yield* finish(s, unit);
}

/** Capturar: ir al edificio (en formacion) y capturarlo; por el camino, disparar sin desviarse. */
function* captureOrderTurn(turn: StandingOrderTurnContext): ActionPlan<boolean> {
  const { s, play, unit, at } = turn;
  const building = buildingAt(s, at);
  if (!building || isAlliedOwner(s, building.owner, play.me) || !isCapturer(s, unit)) return true;
  if (samePos(unit, at)) {
    yield* captureHere(s, unit);
    yield* finish(s, unit);
    return ownsBuildingAt(s, play, at);
  }
  const range = moveRange(s, unit);
  const interrupted = yield* doMove(unit, standingOrderStep(s, play, unit, at, range, formation(s, play, unit)));
  if (interrupted) return false;
  if (samePos(unit, at)) yield* captureHere(s, unit);
  else yield* shootFromHereOrWait(turn);
  yield* finish(s, unit);
  return ownsBuildingAt(s, play, at);
}

/** Esta en la zona que guarda la orden (a AI.GUARDRADIUS o menos del destino). */
const inGuardZone = (play: PlayCtx, at: Pos) => (pos: Pos) => manhattan(pos, at) <= play.profile.weights.GUARDRADIUS;

/** Defender: disparar a lo que entre en la zona y, si no, colocarse junto al destino. Nunca se cumple sola. */
function* defendOrderTurn({ s, play, unit, at }: StandingOrderTurnContext): ActionPlan<boolean> {
  const range = moveRange(s, unit);
  if (needsRepair(play, unit) && (yield* retreat(s, play, unit, range))) return false;
  const squadFormation = formation(s, play, unit);
  if (yield* tryAttack(s, play, unit, range, guardZone(inGuardZone(play, at), formationFrom(squadFormation)))) return false;
  if (manhattan(unit, at) > 1) yield* doMove(unit, standingOrderStep(s, play, unit, at, range, squadFormation));
  yield* finish(s, unit);
  return false;
}

/** Atacar: dispara a lo que tenga a tiro por el camino, sin perseguir, y avanza. Se cumple al llegar sin enemigos cerca. */
function* attackOrderTurn(turn: StandingOrderTurnContext): ActionPlan<boolean> {
  const { s, play, unit, at } = turn;
  const range = moveRange(s, unit);
  if (needsRepair(play, unit) && (yield* retreat(s, play, unit, range))) return false;
  const squadFormation = formation(s, play, unit);
  if (yield* tryAttack(s, play, unit, range, fireOnTheWay(formationFrom(squadFormation)))) return false;
  if (manhattan(unit, at) > 1) {
    const interrupted = yield* doMove(unit, standingOrderStep(s, play, unit, at, range, squadFormation));
    if (!interrupted) yield* shootFromHereOrWait(turn);
    return false;
  }
  // Ha llegado: si no quedan enemigos a la vista cerca, la orden esta cumplida.
  yield* finish(s, unit);
  return !visibleFoes(s, play.me).some(inGuardZone(play, at));
}

/**
 * Ir alli: su paso de este turno ('gotoStep': hasta donde, y si con eso acaba, lo dice la accion).
 * Despues la unidad sigue libre para quien juega.
 */
function* gotoOrderTurn({ unit }: StandingOrderTurnContext): ActionPlan<boolean> {
  yield* act({ kind: 'gotoStep', uid: unit.uid });
  return false;
}

/** Como juega una unidad cada tipo de orden (y cuando: STANDING_ORDER_MOMENT). Un tipo de orden nuevo es una entrada aqui. */
const STANDING_ORDER_TURNS: Record<StandingOrderKind, StandingOrderTurn> = {
  capture: captureOrderTurn,
  defend: defendOrderTurn,
  attack: attackOrderTurn,
  goto: gotoOrderTurn,
};

/**
 * [CAMBIO] Turno de una unidad con orden con destino (ver StandingOrder en model/standingOrder.ts),
 * dentro de un turno ya empezado (`play`). Devuelve true si la orden se ha cumplido (y la quita: la
 * unidad se queda esperando).
 */
function* unitStandingOrderTurn(s: GameState, play: PlayCtx, uid: number): ActionPlan<boolean> {
  const unit = unitById(s, uid);
  const standingOrder = unit && effectiveStandingOrder(s, unit);
  if (!unit || !standingOrder || !canAct(s, unit)) return false;
  const isFulfilled = yield* STANDING_ORDER_TURNS[standingOrder.kind]({ s, play, unit, at: standingOrder.at });
  if (isFulfilled) yield* act({ kind: 'finishStandingOrder', uid });
  return isFulfilled;
}

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
 * (assistTurn), cumplido sobre una copia de la partida (las que no valdrian no salen). No toca `s`.
 * Solo usa lo que el equipo ve: los enemigos escondidos se quitan de la copia antes de simular, asi
 * no puede delatarlos (ni como objetivo, ni por un camino que los rodee o una emboscada). Es una
 * prevision: con enemigos escondidos o la suerte del combate, el turno real puede variar. `simulate`
 * manda las acciones en la copia que se le da: `dispatch` (no el de una sesion, que solo vale para
 * su partida y lo dice: GameSession.dispatcher).
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
  const actors = s.units.filter((unit) => unit.team === team && standingOrderAt(s, unit, 'turnEnd') && canAct(s, unit));
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

/** Apunta en la intencion de su unidad lo que dice un suceso de una accion planeada. */
function recordIntent(intents: Map<number, StandingOrderIntent>, event: GameEvent): void {
  switch (event.kind) {
    case 'move':
    case 'merge': {
      const intent = intents.get(event.uid);
      if (!intent) return;
      // Un camino que sigue a otro empieza donde acabo el anterior: esa casilla no se repite.
      intent.path = intent.path.length ? [...intent.path, ...event.path.slice(1)] : event.path.map((pos) => posOf(pos));
      if (event.kind === 'merge') intent.merge = true;
      return;
    }
    case 'attack': {
      const intent = intents.get(event.attacker);
      if (intent && !intent.attack) intent.attack = posOf(event.at);
      return;
    }
    case 'capture': {
      const intent = intents.get(event.uid);
      if (intent) intent.capture = posOf(event.at);
      return;
    }
    default:
      return;
  }
}
