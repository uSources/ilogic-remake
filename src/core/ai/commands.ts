/**
 * [CAMBIO] Ordenes con destino del jugador (ver Command en types.ts): las cumple la misma IA que el
 * enemigo al terminar el turno (assistTurn), o al darlas (commandNow), y se pueden prever sin tocar
 * la partida (previewCommands, para las flechas de intencion).
 */
import { AI, UNIT } from '../data';
import { manhattan, samePos, seededRng } from '../geom';
import { moveRange } from '../rules/movement';
import { buildingAt, teamUnits, unitById } from '../rules/queries';
import { wait } from '../rules/unitActions';
import { visibility } from '../rules/visibility';
import { effectiveCommand, finishCommand } from '../squads';
import type { CommandKind, GameEvent, GameState, Pos, Rng, Team, Unit } from '../types';
import { cellAt } from '../util/grid';
import { aiCtx, canAct, doMove, needsRepair, type AiCtx } from './context';
import { commandOrder, commandStep, formation, formationFrom } from './formation';
import { captureHere, retreat, tryAttack } from './tactics';

/**
 * [CAMBIO] Ordenes del jugador (al terminar su turno): las unidades con orden con destino
 * (Unit.command) que siguen sin usar la cumplen. No toca las demas unidades ni compra nada.
 * Devuelve los uid de las que han cumplido su orden este turno (se quedan esperando otra).
 */
export function* assistTurn(s: GameState, rng: Rng = Math.random, team: Team = 0): Generator<GameEvent, number[]> {
  const ai = aiCtx(team);
  const withCommand = teamUnits(s, ai.me).filter((unit) => effectiveCommand(s, unit));
  const fulfilled: number[] = [];
  for (const unit of commandOrder(s, withCommand)) if (yield* unitCommandTurn(s, ai, unit.uid, rng)) fulfilled.push(unit.uid);
  return fulfilled;
}

/** [CAMBIO] La unidad del jugador empieza ya su orden recien dada (si aun no se ha movido). */
export function* commandNow(s: GameState, uid: number, rng: Rng = Math.random, team: Team = 0): Generator<GameEvent, boolean> {
  return yield* unitCommandTurn(s, aiCtx(team), uid, rng);
}

/**
 * [CAMBIO] Turno de una unidad de `team` con orden con destino (ver Command en types.ts).
 * Devuelve true si la orden se ha cumplido (y la quita: la unidad se queda esperando).
 */
export function* commandTurn(s: GameState, uid: number, rng: Rng, team: Team = 0): Generator<GameEvent, boolean> {
  return yield* unitCommandTurn(s, aiCtx(team), uid, rng);
}

/** Lo que necesita cada tipo de orden para jugar el turno de una unidad. */
interface CommandTurnContext {
  s: GameState;
  ai: AiCtx;
  unit: Unit;
  /** Casilla de destino de la orden. */
  at: Pos;
  rng: Rng;
}

/** Juega el turno de una unidad con una orden de ese tipo. Devuelve true si la orden se ha cumplido (o ya no tiene sentido). */
type CommandTurn = (turn: CommandTurnContext) => Generator<GameEvent, boolean>;

/** Ya es suyo el edificio de la casilla. */
const ownsBuildingAt = (s: GameState, ai: AiCtx, at: Pos): boolean => buildingAt(s, at.x, at.y)?.owner === ai.me;

/** Dispara sin moverse a lo que tenga a tiro; si no hay nada, espera. */
function* shootFromHereOrWait({ s, ai, unit, rng }: CommandTurnContext): Generator<GameEvent> {
  if (!(yield* tryAttack(s, ai, unit, moveRange(s, unit), rng, { stay: true, chase: false }))) wait(unit);
}

/** Capturar: ir al edificio (en formacion) y capturarlo; por el camino, disparar sin desviarse. */
function* captureCommand(turn: CommandTurnContext): Generator<GameEvent, boolean> {
  const { s, ai, unit, at } = turn;
  const building = buildingAt(s, at.x, at.y);
  if (!building || building.owner === ai.me || !UNIT.cancapt[unit.type]) return true;
  if (samePos(unit, at)) {
    yield* captureHere(s, unit);
    wait(unit);
    return ownsBuildingAt(s, ai, at);
  }
  const range = moveRange(s, unit);
  const ambushed = yield* doMove(s, unit, commandStep(s, ai, unit, at, range, formation(s, ai, unit)), range);
  if (ambushed) return false;
  if (samePos(unit, at)) yield* captureHere(s, unit);
  else yield* shootFromHereOrWait(turn);
  wait(unit);
  return ownsBuildingAt(s, ai, at);
}

/** Esta en la zona que guarda la orden (a AI.GUARDRADIUS o menos del destino). */
const inGuardZone = (at: Pos) => (pos: Pos) => manhattan(pos, at) <= AI.GUARDRADIUS;

/** Defender: disparar a lo que entre en la zona y, si no, colocarse junto al destino. Nunca se cumple sola. */
function* defendCommand({ s, ai, unit, at, rng }: CommandTurnContext): Generator<GameEvent, boolean> {
  const range = moveRange(s, unit);
  if (needsRepair(unit) && (yield* retreat(s, ai, unit, range))) return false;
  const squadFormation = formation(s, ai, unit);
  if (yield* tryAttack(s, ai, unit, range, rng, { zone: inGuardZone(at), from: formationFrom(squadFormation) })) return false;
  if (manhattan(unit, at) > 1) yield* doMove(s, unit, commandStep(s, ai, unit, at, range, squadFormation), range);
  wait(unit);
  return false;
}

/** Atacar: dispara a lo que tenga a tiro por el camino, sin perseguir, y avanza. Se cumple al llegar sin enemigos cerca. */
function* attackCommand(turn: CommandTurnContext): Generator<GameEvent, boolean> {
  const { s, ai, unit, at, rng } = turn;
  const range = moveRange(s, unit);
  if (needsRepair(unit) && (yield* retreat(s, ai, unit, range))) return false;
  const squadFormation = formation(s, ai, unit);
  if (yield* tryAttack(s, ai, unit, range, rng, { chase: false, from: formationFrom(squadFormation) })) return false;
  if (manhattan(unit, at) > 1) {
    const ambushed = yield* doMove(s, unit, commandStep(s, ai, unit, at, range, squadFormation), range);
    if (!ambushed) yield* shootFromHereOrWait(turn);
    return false;
  }
  // Ha llegado: si no quedan enemigos a la vista cerca, la orden esta cumplida.
  wait(unit);
  const visible = visibility(s, ai.me);
  const isNear = inGuardZone(at);
  const enemiesLeft = s.units.some((other) => other.team !== ai.me && other.carrier === null && cellAt(visible, other) && isNear(other));
  return !enemiesLeft;
}

/** Como juega una unidad cada tipo de orden. Un tipo de orden nuevo es una entrada aqui. */
const COMMAND_TURNS: Record<CommandKind, CommandTurn> = {
  capture: captureCommand,
  defend: defendCommand,
  attack: attackCommand,
};

/** Lo de commandTurn, dentro de un turno ya empezado (`ai`). */
function* unitCommandTurn(s: GameState, ai: AiCtx, uid: number, rng: Rng): Generator<GameEvent, boolean> {
  const unit = unitById(s, uid);
  const command = unit && effectiveCommand(s, unit);
  if (!unit || !command || !canAct(unit)) return false;
  const isFulfilled = yield* COMMAND_TURNS[command.kind]({ s, ai, unit, at: command.at, rng });
  if (isFulfilled) finishCommand(s, unit);
  return isFulfilled;
}

/** [CAMBIO] Lo que hara una unidad con orden al terminar el turno (ver previewCommands). */
export interface CommandIntent {
  /** Camino de este turno, desde donde esta (vacio si no se mueve). */
  path: Pos[];
  /** Casilla de la unidad a la que va a atacar. */
  attack?: Pos;
  /** Edificio que va a capturar (o seguir capturando). */
  capture?: Pos;
  /** Al final del camino se une a otra unidad igual (para curarse). */
  merge?: boolean;
}

/** Semilla fija de la prevision: la misma partida da siempre la misma prevision. */
const PREVIEW_SEED = 0x1d0c;

/**
 * [CAMBIO] Flechas de intencion: simula assistTurn sobre una copia de la partida y devuelve, por uid,
 * lo que hara cada unidad del bando con orden al terminar el turno. No toca `s`. Solo usa lo que el
 * bando ve: los enemigos escondidos se quitan de la copia antes de simular, asi la prevision no
 * puede delatarlos (ni como objetivo, ni por un camino que los rodee o una emboscada).
 * Es una prevision: con enemigos escondidos o la suerte del combate, el turno real puede variar.
 */
export function previewCommands(s: GameState, team: Team = 0, seed = PREVIEW_SEED): Map<number, CommandIntent> {
  const intents = new Map<number, CommandIntent>();
  const actors = s.units.filter((unit) => unit.team === team && effectiveCommand(s, unit) && canAct(unit));
  if (!actors.length) return intents;
  const copy = withoutHiddenEnemies(s, team);
  for (const unit of actors) intents.set(unit.uid, { path: [] });
  const turn = assistTurn(copy, seededRng(seed), team);
  for (let step = turn.next(); !step.done; step = turn.next()) recordIntent(intents, step.value);
  return intents;
}

/** Copia de la partida sin los enemigos que `team` no ve (ni lo que llevan dentro). */
function withoutHiddenEnemies(s: GameState, team: Team): GameState {
  const copy = structuredClone(s);
  const visible = visibility(copy, team);
  const isHiddenEnemy = (unit: Unit) => unit.team !== team && unit.carrier === null && !cellAt(visible, unit);
  const hidden = new Set(copy.units.filter(isHiddenEnemy).map((unit) => unit.uid));
  const isCarriedByHidden = (unit: Unit) => unit.carrier !== null && hidden.has(unit.carrier);
  if (hidden.size) copy.units = copy.units.filter((unit) => !hidden.has(unit.uid) && !isCarriedByHidden(unit));
  return copy;
}

/** Apunta en la intencion de su unidad lo que dice un suceso del turno simulado. */
function recordIntent(intents: Map<number, CommandIntent>, event: GameEvent): void {
  switch (event.kind) {
    case 'move':
    case 'merge': {
      const intent = intents.get(event.uid);
      if (!intent) return;
      // Un camino que sigue a otro empieza donde acabo el anterior: esa casilla no se repite.
      intent.path = intent.path.length ? [...intent.path, ...event.path.slice(1)] : event.path.map((pos) => ({ x: pos.x, y: pos.y }));
      if (event.kind === 'merge') intent.merge = true;
      return;
    }
    case 'attack': {
      const intent = intents.get(event.attacker);
      if (intent && !intent.attack) intent.attack = { x: event.target.x, y: event.target.y };
      return;
    }
    case 'capture': {
      const intent = intents.get(event.uid);
      if (intent) intent.capture = { x: event.at.x, y: event.at.y };
      return;
    }
    default:
      return;
  }
}
