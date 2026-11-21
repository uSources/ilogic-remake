/**
 * Turno de la IA con una de sus unidades: prueba sus comportamientos en orden y se queda con el
 * primero que la usa. Un papel nuevo (por ejemplo, artilleria que guarda la distancia) es una
 * entrada mas en UNIT_BEHAVIOURS, en su sitio de la lista.
 */

import { moveRange, type MoveRange } from '../rules/movement';
import { buildingAt, isEnemyHq, unitById } from '../rules/queries';
import { isCapturer } from '../util/predicates';
import { posOf } from '../geom';
import type { ActionPlan, GameState, Rng, Unit } from '../model';
import { bestMoveToward, canAct, doMove, finish, needsRepair, type PlayCtx } from '../autopilot/context';
import { captureHere, retreat, tryAttack } from '../autopilot/tactics';
import { HUNT } from '../autopilot/engagement';
import { advance, holdFront, randomMove, takeCover, tryCapture } from './tactics';

/** Lo que necesita un comportamiento para decidir y actuar con una unidad. */
export interface UnitTurnContext {
  s: GameState;
  play: PlayCtx;
  unit: Unit;
  /** Alcance de la unidad al empezar su turno. */
  range: MoveRange;
  /** Las decisiones al azar de la IA (los dados del combate son los de la partida). */
  rng: Rng;
}

/** Una cosa que puede hacer una unidad. `run` devuelve true si la ha usado (y ya no se prueba nada mas). */
export interface UnitBehaviour {
  id: string;
  when(turn: UnitTurnContext): boolean;
  run(turn: UnitTurnContext): ActionPlan<boolean>;
}

/** Apartarse de la Base enemiga y, si puede, disparar desde la casilla nueva. */
function* stepOffEnemyHq({ s, play, unit, range }: UnitTurnContext): ActionPlan<boolean> {
  // Hacia cualquier casilla que no sea la suya (la de la Base).
  const destination = bestMoveToward(s, play, unit, posOf(unit), range, true);
  if (!destination) return false;
  yield* doMove(unit, destination);
  const rangeAfterMove = moveRange(s, unit);
  if (!(yield* tryAttack(s, play, unit, rangeAfterMove, HUNT))) yield* finish(s, unit);
  return true;
}

/** Prioridades de cada unidad de siempre (las del perfil por defecto), de mas a menos urgente. El orden importa. */
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
    when: ({ s, play, unit }) => {
      const building = buildingAt(s, unit);
      return !!building && isEnemyHq(s, building, play.me) && !isCapturer(s, unit);
    },
    run: stepOffEnemyHq,
  },
  {
    // Debil: a curarse antes de que la destruyan.
    id: 'retreat',
    when: ({ play, unit }) => needsRepair(play, unit),
    run: ({ s, play, unit, range }) => retreat(s, play, unit, range),
  },
  {
    // Atacar al mejor objetivo a tiro o acercarse al mas cercano.
    id: 'attack',
    when: () => true,
    run: ({ s, play, unit, range }) => tryAttack(s, play, unit, range, HUNT),
  },
  {
    // Las que capturan: el edificio ajeno mas cercano a la vista.
    id: 'capture',
    when: () => true,
    run: ({ s, play, unit, range }) => tryCapture(s, play, unit, range),
  },
  {
    // Hacia edificios ajenos, enemigos o su Base: que no se quede parada en casa.
    id: 'advance',
    when: () => true,
    run: ({ s, play, unit, range }) => advance(s, play, unit, range),
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

/** Salir de donde la pueden destruir, en zona del enemigo (mapas de influencia). */
const TAKE_COVER: UnitBehaviour = {
  id: 'takeCover',
  when: ({ play }) => !!play.influence,
  run: ({ s, play, unit, range }) => takeCover(s, play, unit, range),
};

/** Ir al frente (mapas de influencia) cuando no hay nada mejor que hacer, antes de pasear al azar. */
const HOLD_FRONT: UnitBehaviour = {
  id: 'holdFront',
  when: ({ play }) => !!play.influence,
  run: ({ s, play, unit, range }) => holdFront(s, play, unit, range),
};

/** El comportamiento de siempre con ese nombre (falla si no esta: la lista de abajo se escribe con ellos). */
function behaviourNamed(id: string): UnitBehaviour {
  const behaviour = UNIT_BEHAVIOURS.find((candidate) => candidate.id === id);
  if (!behaviour) throw new Error(`No hay comportamiento "${id}" en UNIT_BEHAVIOURS`);
  return behaviour;
}

/**
 * Los de la IA con mapas de influencia (docs/PLAN-IA.md, fase 1), de mas a menos urgente: los de
 * siempre (atacar o acercarse ya miran el peligro al elegir casilla), ponerse a cubierto si la pueden
 * destruir y, sin nada que hacer, ir al frente antes de pasear. [Probado: atacar solo a lo que tiene a
 * tiro, sin perseguir, la hacia mas floja: 38 % contra 50 % en 40 partidas.]
 */
export const INFLUENCE_BEHAVIOURS: readonly UnitBehaviour[] = [
  behaviourNamed('finishCapture'),
  behaviourNamed('stepOffEnemyHq'),
  behaviourNamed('retreat'),
  behaviourNamed('attack'),
  behaviourNamed('capture'),
  TAKE_COVER,
  behaviourNamed('advance'),
  HOLD_FRONT,
  behaviourNamed('randomMove'),
];

/** Lo que hace la IA con una unidad en su turno (si sigue activa): el primero de `behaviours` (los del perfil) que la usa. */
export function* unitTurn(s: GameState, play: PlayCtx, behaviours: readonly UnitBehaviour[], uid: number, rng: Rng): ActionPlan {
  const unit = unitById(s, uid);
  if (!unit || !canAct(s, unit)) return;
  // El alcance no cambia mientras ningun comportamiento haya usado la unidad, asi que se calcula una vez.
  const turn: UnitTurnContext = { s, play, unit, range: moveRange(s, unit), rng };
  for (const behaviour of behaviours) {
    if (!behaviour.when(turn)) continue;
    if (yield* behaviour.run(turn)) return;
  }
}
