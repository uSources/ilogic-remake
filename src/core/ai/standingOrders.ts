/**
 * [CAMBIO] Ordenes permanentes de un equipo (ver StandingOrder en model/standingOrder.ts): las cumple
 * la misma IA que el enemigo al terminar el turno (assistTurn), o al darlas (startStandingOrder), y se
 * pueden prever sin tocar la partida (previewStandingOrders, para las flechas de intencion).
 */

import { isAlliedOwner, isHostile } from '../teams';
import { unitTypeOf, weightsOf, cloneState } from '../gameContent';
import { manhattan, samePos, posOf } from '../geom';
import { moveRange } from '../rules/movement';
import { buildingAt, teamUnits, unitById } from '../rules/queries';
import { wait } from '../rules/unitActions';
import { visibility } from '../rules/visibility';
import { effectiveStandingOrder, finishStandingOrder } from '../squads/standingOrders';
import type { StandingOrderKind, GameEvent, GameState, Pos, TeamId, Unit } from '../model';
import { aiCtx, canAct, doMove, needsRepair, type AiCtx } from './context';
import { standingOrderPlayOrder, standingOrderStep, formation, formationFrom } from './formation';
import { captureHere, retreat, tryAttack } from './tactics';

/**
 * [CAMBIO] Ordenes de un equipo (al terminar su turno): las unidades con orden con destino
 * (Unit.standingOrder) que siguen sin usar la cumplen. No toca las demas unidades ni compra nada.
 * Devuelve los uid de las que han cumplido su orden este turno (se quedan esperando otra).
 */
export function* assistTurn(s: GameState, team: TeamId): Generator<GameEvent, number[]> {
  const ai = aiCtx(team);
  const withStandingOrder = teamUnits(s, ai.me).filter((unit) => effectiveStandingOrder(s, unit));
  const fulfilled: number[] = [];
  for (const unit of standingOrderPlayOrder(s, withStandingOrder))
    if (yield* unitStandingOrderTurn(s, ai, unit.uid)) fulfilled.push(unit.uid);
  return fulfilled;
}

/** [CAMBIO] La unidad empieza ya su orden recien dada (si aun no se ha movido). */
export function* startStandingOrder(s: GameState, uid: number, team: TeamId): Generator<GameEvent, boolean> {
  return yield* unitStandingOrderTurn(s, aiCtx(team), uid);
}

/**
 * [CAMBIO] Turno de una unidad de `team` con orden con destino (ver StandingOrder en model/standingOrder.ts).
 * Devuelve true si la orden se ha cumplido (y la quita: la unidad se queda esperando).
 */
export function* standingOrderTurn(s: GameState, uid: number, team: TeamId): Generator<GameEvent, boolean> {
  return yield* unitStandingOrderTurn(s, aiCtx(team), uid);
}

/** Lo que necesita cada tipo de orden para jugar el turno de una unidad. */
interface StandingOrderTurnContext {
  s: GameState;
  ai: AiCtx;
  unit: Unit;
  /** Casilla de destino de la orden. */
  at: Pos;
}

/** Juega el turno de una unidad con una orden de ese tipo. Devuelve true si la orden se ha cumplido (o ya no tiene sentido). */
type StandingOrderTurn = (turn: StandingOrderTurnContext) => Generator<GameEvent, boolean>;

/** Ya es suyo el edificio de la casilla. */
const ownsBuildingAt = (s: GameState, ai: AiCtx, at: Pos): boolean => isAlliedOwner(s, buildingAt(s, at)?.owner ?? null, ai.me);

/** Dispara sin moverse a lo que tenga a tiro; si no hay nada, espera. */
function* shootFromHereOrWait({ s, ai, unit }: StandingOrderTurnContext): Generator<GameEvent> {
  if (!(yield* tryAttack(s, ai, unit, moveRange(s, unit), { stay: true, chase: false }))) wait(unit);
}

/** Capturar: ir al edificio (en formacion) y capturarlo; por el camino, disparar sin desviarse. */
function* captureOrderTurn(turn: StandingOrderTurnContext): Generator<GameEvent, boolean> {
  const { s, ai, unit, at } = turn;
  const building = buildingAt(s, at);
  if (!building || isAlliedOwner(s, building.owner, ai.me) || !unitTypeOf(s, unit).canCapture) return true;
  if (samePos(unit, at)) {
    yield* captureHere(s, unit);
    wait(unit);
    return ownsBuildingAt(s, ai, at);
  }
  const range = moveRange(s, unit);
  const ambushed = yield* doMove(s, unit, standingOrderStep(s, ai, unit, at, range, formation(s, ai, unit)), range);
  if (ambushed) return false;
  if (samePos(unit, at)) yield* captureHere(s, unit);
  else yield* shootFromHereOrWait(turn);
  wait(unit);
  return ownsBuildingAt(s, ai, at);
}

/** Esta en la zona que guarda la orden (a AI.GUARDRADIUS o menos del destino). */
const inGuardZone = (s: GameState, at: Pos) => (pos: Pos) => manhattan(pos, at) <= weightsOf(s).GUARDRADIUS;

/** Defender: disparar a lo que entre en la zona y, si no, colocarse junto al destino. Nunca se cumple sola. */
function* defendOrderTurn({ s, ai, unit, at }: StandingOrderTurnContext): Generator<GameEvent, boolean> {
  const range = moveRange(s, unit);
  if (needsRepair(s, unit) && (yield* retreat(s, ai, unit, range))) return false;
  const squadFormation = formation(s, ai, unit);
  if (yield* tryAttack(s, ai, unit, range, { zone: inGuardZone(s, at), from: formationFrom(squadFormation) })) return false;
  if (manhattan(unit, at) > 1) yield* doMove(s, unit, standingOrderStep(s, ai, unit, at, range, squadFormation), range);
  wait(unit);
  return false;
}

/** Atacar: dispara a lo que tenga a tiro por el camino, sin perseguir, y avanza. Se cumple al llegar sin enemigos cerca. */
function* attackOrderTurn(turn: StandingOrderTurnContext): Generator<GameEvent, boolean> {
  const { s, ai, unit, at } = turn;
  const range = moveRange(s, unit);
  if (needsRepair(s, unit) && (yield* retreat(s, ai, unit, range))) return false;
  const squadFormation = formation(s, ai, unit);
  if (yield* tryAttack(s, ai, unit, range, { chase: false, from: formationFrom(squadFormation) })) return false;
  if (manhattan(unit, at) > 1) {
    const ambushed = yield* doMove(s, unit, standingOrderStep(s, ai, unit, at, range, squadFormation), range);
    if (!ambushed) yield* shootFromHereOrWait(turn);
    return false;
  }
  // Ha llegado: si no quedan enemigos a la vista cerca, la orden esta cumplida.
  wait(unit);
  const visible = visibility(s, ai.me);
  const isNear = inGuardZone(s, at);
  const enemiesLeft = s.units.some(
    (other) => isHostile(s, other.team, ai.me) && other.carrier === null && visible.at(other) && isNear(other),
  );
  return !enemiesLeft;
}

/** Como juega una unidad cada tipo de orden. Un tipo de orden nuevo es una entrada aqui. */
const STANDING_ORDER_TURNS: Record<StandingOrderKind, StandingOrderTurn> = {
  capture: captureOrderTurn,
  defend: defendOrderTurn,
  attack: attackOrderTurn,
};

/** Lo de standingOrderTurn, dentro de un turno ya empezado (`ai`). */
function* unitStandingOrderTurn(s: GameState, ai: AiCtx, uid: number): Generator<GameEvent, boolean> {
  const unit = unitById(s, uid);
  const standingOrder = unit && effectiveStandingOrder(s, unit);
  if (!unit || !standingOrder || !canAct(unit)) return false;
  const isFulfilled = yield* STANDING_ORDER_TURNS[standingOrder.kind]({ s, ai, unit, at: standingOrder.at });
  if (isFulfilled) finishStandingOrder(s, unit);
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

/**
 * [CAMBIO] Flechas de intencion: simula assistTurn sobre una copia de la partida y devuelve, por uid,
 * lo que hara cada unidad del equipo con orden al terminar el turno. No toca `s`. Solo usa lo que el
 * equipo ve: los enemigos escondidos se quitan de la copia antes de simular, asi la prevision no
 * puede delatarlos (ni como objetivo, ni por un camino que los rodee o una emboscada).
 * Es una prevision: con enemigos escondidos o la suerte del combate, el turno real puede variar.
 */
export function previewStandingOrders(s: GameState, team: TeamId): Map<number, StandingOrderIntent> {
  const intents = new Map<number, StandingOrderIntent>();
  const actors = s.units.filter((unit) => unit.team === team && effectiveStandingOrder(s, unit) && canAct(unit));
  if (!actors.length) return intents;
  const copy = withoutHiddenEnemies(s, team);
  copy.dice = PREVIEW_DICE_SEED;
  for (const unit of actors) intents.set(unit.uid, { path: [] });
  const turn = assistTurn(copy, team);
  for (let step = turn.next(); !step.done; step = turn.next()) recordIntent(intents, step.value);
  return intents;
}

/** Copia de la partida sin los enemigos que `team` no ve (ni lo que llevan dentro). */
function withoutHiddenEnemies(s: GameState, team: TeamId): GameState {
  const copy = cloneState(s);
  const visible = visibility(copy, team);
  const isHiddenEnemy = (unit: Unit) => isHostile(s, unit.team, team) && unit.carrier === null && !visible.at(unit);
  const hidden = new Set(copy.units.filter(isHiddenEnemy).map((unit) => unit.uid));
  const isCarriedByHidden = (unit: Unit) => unit.carrier !== null && hidden.has(unit.carrier);
  if (hidden.size) copy.units = copy.units.filter((unit) => !hidden.has(unit.uid) && !isCarriedByHidden(unit));
  return copy;
}

/** Apunta en la intencion de su unidad lo que dice un suceso del turno simulado. */
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
      if (intent && !intent.attack) intent.attack = posOf(event.target);
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
