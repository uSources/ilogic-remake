/**
 * Recorrer de verdad un camino ya comprobado: lo puede cortar a mitad algo de lo que quien se mueve
 * no sabia ([CAMBIO] la emboscada: un enemigo escondido en el camino). Un solo sitio para mover,
 * unirse, subir a un transporte y el paso de un viaje (`traverse`).
 */
import { posOf, samePos } from '../geom';
import type { GameEvent, GameState, Pos, TeamId, Unit } from '../model';
import { minBy } from '../util/pick';
import { areEnemies, isOnMap } from '../util/predicates';
import { markMoved, spendUnit } from './unitTurn';

/** Por que se puede cortar un camino a mitad (el nombre del campo de su suceso: GameEvent 'move'). */
export type InterruptionKind = 'ambush';

/** Algo que corta un camino a mitad. */
export interface PathInterruption {
  readonly kind: InterruptionKind;
  /** El primer paso del camino (su puesto en `path`) que ya no se puede dar, o null si no corta. */
  cutAt(s: GameState, unit: Unit, path: readonly Pos[]): number | null;
}

/** Hay una unidad enemiga en la casilla (escondida o no: al pisarla se descubre). */
const enemyAt = (s: GameState, unit: Unit, pos: Pos): boolean =>
  s.units.some((other) => isOnMap(other) && areEnemies(s, other, unit) && samePos(other, pos));

/**
 * Lo que puede cortar un camino. Un corte nuevo (minas, fuego de vigilancia...) es una entrada aqui y
 * su campo en el suceso de mover.
 */
export const PATH_INTERRUPTIONS: readonly PathInterruption[] = [
  {
    // [CAMBIO] Emboscada: un enemigo que no se veia en el camino (con el modulo `ambush` no cierra el paso al planearlo).
    kind: 'ambush',
    cutAt: (s, unit, path) => {
      const index = path.findIndex((pos, step) => step > 0 && enemyAt(s, unit, pos));
      return index < 0 ? null : index;
    },
  },
];

/** Lo que ha cortado un camino y donde (la casilla que ya no se ha podido pisar). */
export interface Interruption {
  readonly kind: InterruptionKind;
  readonly at: Pos;
}

/** Lo que ha recorrido de verdad una unidad: el camino hasta donde ha llegado y, si se ha parado antes, por que. */
export interface Traversal {
  readonly path: Pos[];
  readonly interruption: Interruption | null;
}

/** El primer corte del camino (el que llega antes), si lo hay. */
function firstCut(s: GameState, unit: Unit, path: readonly Pos[]): { kind: InterruptionKind; index: number } | null {
  const cuts = PATH_INTERRUPTIONS.flatMap((interruption) => {
    const index = interruption.cutAt(s, unit, path);
    return index === null ? [] : [{ kind: interruption.kind, index }];
  });
  return minBy(cuts, (cut) => cut.index);
}

/** Hay otra unidad (de cualquier equipo) en la casilla: ahi no se puede quedar parada. */
const someoneElseAt = (s: GameState, unit: Unit, pos: Pos): boolean =>
  s.units.some((other) => isOnMap(other) && other.uid !== unit.uid && samePos(other, pos));

/** La casilla `index` de un camino (si no la hay, es un fallo de quien la pide). */
function stepOf(path: readonly Pos[], index: number): Pos {
  const step = path.at(index);
  if (!step) throw new Error(`El camino no tiene la casilla ${index}`);
  return step;
}

/** Hasta donde llega antes del corte: la ultima casilla anterior en la que se puede parar (no la de un aliado). */
function lastFreeBefore(s: GameState, unit: Unit, path: readonly Pos[], cut: number): number {
  const canStopAt = (index: number) => index === 0 || !someoneElseAt(s, unit, stepOf(path, index));
  let index = cut - 1;
  while (!canStopAt(index)) index--;
  return index;
}

/** Pone la unidad en la ultima casilla del camino. */
function placeAtEnd(unit: Unit, path: readonly Pos[]): void {
  const end = stepOf(path, -1);
  unit.x = end.x;
  unit.y = end.y;
}

/**
 * La unidad recorre un camino ya comprobado y queda al final de lo que ha recorrido. Si algo lo corta
 * (PATH_INTERRUPTIONS), se para antes y pierde el turno; si no, llegar es cosa de quien llama: mover
 * (`moveAlong`), unirse o subir a un transporte.
 */
export function traverse(s: GameState, unit: Unit, path: Pos[]): Traversal {
  const cut = firstCut(s, unit, path);
  if (!cut) {
    placeAtEnd(unit, path);
    return { path, interruption: null };
  }
  const walked = path.slice(0, lastFreeBefore(s, unit, path, cut.index) + 1);
  placeAtEnd(unit, walked);
  spendUnit(unit);
  return { path: walked, interruption: { kind: cut.kind, at: posOf(stepOf(path, cut.index)) } };
}

/** Moverse por un camino ya comprobado (plannedPath): si llega, queda movida (aun puede disparar o esperar). */
export function moveAlong(s: GameState, unit: Unit, path: Pos[]): Traversal {
  const traversal = traverse(s, unit, path);
  if (!traversal.interruption) markMoved(unit);
  return traversal;
}

/** Los sucesos de una accion acaban en una emboscada: la unidad se ha parado antes y ya no puede hacer nada. */
export function endsInAmbush(events: readonly GameEvent[]): boolean {
  return events.some((event) => event.kind === 'move' && !!event.ambush);
}

/** Evento de mover (los que anima la escena y cuentan las estadisticas). Un solo sitio para su forma. */
export function moveEvent(actor: TeamId, uid: number, traversal: Traversal): GameEvent {
  const { path, interruption } = traversal;
  return interruption ? { kind: 'move', actor, uid, path, ambush: interruption.at } : { kind: 'move', actor, uid, path };
}
