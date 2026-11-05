/**
 * Turno de la IA con una de sus unidades: prueba sus comportamientos en orden y se queda con el
 * primero que la usa. Un papel nuevo (por ejemplo, artilleria que guarda la distancia) es una
 * entrada mas en UNIT_BEHAVIOURS, en su sitio de la lista.
 */

import { isHostileOwner } from '../teams';
import { unitTypeOf, isHq } from '../gameContent';
import { moveRange, type MoveRange } from '../rules/movement';
import { buildingAt, unitById } from '../rules/queries';
import { wait } from '../rules/unitActions';
import type { Building, GameEvent, GameState, Rng, Unit } from '../model';
import { bestMoveToward, canAct, doMove, needsRepair, type AiCtx } from './context';
import { advance, captureHere, randomMove, retreat, tryAttack, tryCapture } from './tactics';

/** Lo que necesita un comportamiento para decidir y actuar con una unidad. */
export interface UnitTurnContext {
  s: GameState;
  ai: AiCtx;
  unit: Unit;
  /** Alcance de la unidad al empezar su turno. */
  range: MoveRange;
  rng: Rng;
}

/** Una cosa que puede hacer una unidad. `run` devuelve true si la ha usado (y ya no se prueba nada mas). */
export interface UnitBehaviour {
  id: string;
  when(turn: UnitTurnContext): boolean;
  run(turn: UnitTurnContext): Generator<GameEvent, boolean>;
}

const isEnemyHq = (s: GameState, building: Building, ai: AiCtx): boolean => isHq(s, building) && isHostileOwner(s, building.owner, ai.me);

/** Apartarse de la Base enemiga y, si puede, disparar desde la casilla nueva. */
function* stepOffEnemyHq({ s, ai, unit, range, rng }: UnitTurnContext): Generator<GameEvent, boolean> {
  const hq = buildingAt(s, unit)!;
  const destination = bestMoveToward(s, ai, unit, hq, range, true);
  if (!destination) return false;
  yield* doMove(s, unit, destination, range);
  const rangeAfterMove = moveRange(s, unit);
  if (!(yield* tryAttack(s, ai, unit, rangeAfterMove, rng))) wait(unit);
  return true;
}

/** Prioridades de cada unidad, de mas a menos urgente. El orden importa: es el de siempre. */
export const UNIT_BEHAVIOURS: readonly UnitBehaviour[] = [
  {
    // [CAMBIO] Reglas nuevas: una captura a medias se termina antes que nada (si se va, se pierde).
    // Con captura por puntos, una unidad que ya esta sobre un edificio capturable lo empieza a capturar.
    id: 'finishCapture',
    when: ({ s, unit }) => buildingAt(s, unit) !== undefined,
    run: ({ s, unit }) => captureHere(s, unit),
  },
  {
    // [CAMBIO] Una unidad que no captura y esta encima de la Base enemiga se aparta para dejar sitio.
    id: 'stepOffEnemyHq',
    when: ({ s, ai, unit }) => {
      const building = buildingAt(s, unit);
      return !!building && isEnemyHq(s, building, ai) && !unitTypeOf(s, unit).canCapture;
    },
    run: stepOffEnemyHq,
  },
  {
    // Debil: a curarse antes de que la destruyan.
    id: 'retreat',
    when: ({ s, unit }) => needsRepair(s, unit),
    run: ({ s, ai, unit, range }) => retreat(s, ai, unit, range),
  },
  {
    // Atacar al mejor objetivo a tiro o acercarse al mas cercano.
    id: 'attack',
    when: () => true,
    run: ({ s, ai, unit, range, rng }) => tryAttack(s, ai, unit, range, rng),
  },
  {
    // Las que capturan: el edificio ajeno mas cercano a la vista.
    id: 'capture',
    when: () => true,
    run: ({ s, ai, unit, range }) => tryCapture(s, ai, unit, range),
  },
  {
    // Hacia edificios ajenos, enemigos o su Base: que no se quede parada en casa.
    id: 'advance',
    when: () => true,
    run: ({ s, ai, unit, range }) => advance(s, ai, unit, range),
  },
  {
    // Si nada de lo anterior sirve, moverse al azar (siempre usa la unidad).
    id: 'randomMove',
    when: () => true,
    *run({ s, unit, range, rng }) {
      yield* randomMove(s, unit, range, rng);
      return true;
    },
  },
];

/** Lo que hace la IA con una unidad en su turno (si sigue activa). */
export function* unitTurn(s: GameState, ai: AiCtx, uid: number, rng: Rng): Generator<GameEvent> {
  const unit = unitById(s, uid);
  if (!unit || !canAct(unit)) return;
  // El alcance no cambia mientras ningun comportamiento haya usado la unidad, asi que se calcula una vez.
  const turn: UnitTurnContext = { s, ai, unit, range: moveRange(s, unit), rng };
  for (const behaviour of UNIT_BEHAVIOURS) {
    if (!behaviour.when(turn)) continue;
    if (yield* behaviour.run(turn)) return;
  }
}
