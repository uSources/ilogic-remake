/**
 * Que hay sobre el tablero y como se ve para quien mira (`viewer`): que unidades se ven (niebla), de
 * que lado es cada pieza, cuales ya han jugado, su vida y como va cada captura. Solo decide (puro, sin
 * three.js); el motor (engine/pieces/boardView.ts) pone, mueve y quita los objetos para que se vea asi.
 */
import type { MovementMotion } from '../../../core/content';
import { MAX_LIFE } from '../../../core/data';
import { unitTypeOf } from '../../../core/gameContent';
import { posKey } from '../../../core/geom';
import type { Building, GameState, Pos, TeamId, TurnEndOrderKind, Unit } from '../../../core/model';
import { gotoDestination, turnEndOrderOf } from '../../../core/squads';
import { capturePointsOf, captureProgress, isOnMap, isShownTo, visibility } from '../../../core/rules';
import type { Grid } from '../../../core/util/grid';
import { isFriendly, ownerSideOf, sideOf, type OwnerSide } from '../../../ui/sides';
import type { PuffKind } from '../../ports/stage';

/** La letra de cada orden sobre la unidad que la lleva (como en 2D); «I», ir alli en varios turnos. */
const ORDER_LETTERS: Readonly<Record<TurnEndOrderKind, string>> = { attack: 'A', capture: 'C', defend: 'D' };
const GOTO_LETTER = 'I';

/** Debajo de esta vida (de MAX_LIFE) una unidad echa humo gris; debajo de la otra, negro. */
const SMOKES_BELOW = 50;
const BURNS_BELOW = 25;

export interface UnitLook {
  readonly uid: number;
  /** Su tipo (id de units.json): de el sale su modelo. */
  readonly type: string;
  readonly side: OwnerSide;
  /** Como se mueve (movements.json, "motion"): su paso, su huella y si deja restos. */
  readonly motion: MovementMotion;
  readonly pos: Pos;
  /** La niebla no la tapa. */
  readonly isVisible: boolean;
  /** Es de quien mira y ya ha hecho todo este turno: se ve oscurecida, se lee de un vistazo cual queda. */
  readonly isSpent: boolean;
  /** Lo que le queda de vida (de 0 a 1) si esta herida; null si esta entera (sin barra). */
  readonly lifeLeft: number | null;
  /** La letra de su orden permanente (solo las de quien mira; null sin orden). */
  readonly orderLetter: string | null;
}

/** Una captura a medias que se ve: lo que le queda (de 0 a 1) y de que lado es quien captura. */
export interface CaptureLook {
  readonly left: number;
  readonly side: OwnerSide;
}

export interface BuildingLook {
  /** El mismo edificio en dos `sync` seguidos (su casilla). */
  readonly key: string;
  readonly type: string;
  readonly pos: Pos;
  /** De quien se ve que es: si cambia (una captura), se vuelve a pintar. */
  readonly side: OwnerSide;
  readonly capture: CaptureLook | null;
}

/** El tablero tal como lo ve `viewer`. */
export interface BoardScene {
  /** Las casillas que ve (el resto, con niebla). */
  readonly seen: Grid<boolean>;
  readonly units: readonly UnitLook[];
  readonly buildings: readonly BuildingLook[];
}

export const buildingKey = (building: Pos): string => posKey(building);

export function boardScene(s: GameState, viewer: TeamId): BoardScene {
  const seen = visibility(s, viewer);
  return {
    seen,
    units: s.units.filter(isOnMap).map((unit) => unitLook(s, viewer, seen, unit)),
    buildings: s.buildings.map((building) => buildingLook(s, viewer, seen, building)),
  };
}

function unitLook(s: GameState, viewer: TeamId, seen: Grid<boolean>, unit: Unit): UnitLook {
  return {
    uid: unit.uid,
    type: unit.type,
    side: sideOf(s, viewer, unit.team),
    motion: unitTypeOf(s, unit).motion,
    pos: { x: unit.x, y: unit.y },
    isVisible: isShownTo(viewer, unit, (pos) => seen.at(pos)),
    isSpent: unit.team === viewer && unit.turnState === 'done',
    lifeLeft: unit.life < MAX_LIFE ? unit.life / MAX_LIFE : null,
    orderLetter: unit.team === viewer ? orderLetterOf(s, unit) : null,
  };
}

/** La letra de la orden que sigue la unidad (la suya o la de su escuadra). */
function orderLetterOf(s: GameState, unit: Unit): string | null {
  const order = turnEndOrderOf(s, unit);
  if (order) return ORDER_LETTERS[order.kind];
  return gotoDestination(unit) ? GOTO_LETTER : null;
}

function buildingLook(s: GameState, viewer: TeamId, seen: Grid<boolean>, building: Building): BuildingLook {
  return {
    key: buildingKey(building),
    type: building.type,
    pos: { x: building.x, y: building.y },
    side: shownOwner(s, viewer, seen, building),
    capture: seen.at(building) ? captureLook(s, viewer, building) : null,
  };
}

/** De quien se ve que es un edificio: el dueño si se ve la casilla (o es de los suyos); si no, de nadie (como en 2D). */
function shownOwner(s: GameState, viewer: TeamId, seen: Grid<boolean>, building: Building): OwnerSide {
  const side = ownerSideOf(s, viewer, building.owner);
  return seen.at(building) || isFriendly(side) ? side : 'neutral';
}

function captureLook(s: GameState, viewer: TeamId, building: Building): CaptureLook | null {
  const capture = captureProgress(s, building);
  if (!capture) return null;
  return { left: capture.left / capturePointsOf(s, building), side: sideOf(s, viewer, capture.team) };
}

/** El humo de las heridas de una unidad: gris de la mitad para abajo, negro de un cuarto para abajo. */
export const woundSmokeOf = (life: number): PuffKind | null => (life <= BURNS_BELOW ? 'darkSmoke' : life <= SMOKES_BELOW ? 'smoke' : null);

/**
 * Las unidades que echan humo ahora y cual. Se pregunta en cada fotograma a la partida (no al ultimo
 * `sync`): el humo sale en cuanto el golpe quita la vida, mientras aun se anima.
 */
export function woundedUnits(s: GameState): { uid: number; smoke: PuffKind }[] {
  return s.units.flatMap((unit) => {
    const smoke = woundSmokeOf(unit.life);
    return smoke ? [{ uid: unit.uid, smoke }] : [];
  });
}
