/**
 * Que unidades se pueden elegir y que queda elegido al juntar varias (Mayusculas + clic, doble clic,
 * recuadro: la logica de cada gesto esta en controls/selection.ts). Puro.
 */
import type { GameState, TeamId, Unit } from '../../../core/model';
import { canStillAct, isOnMap } from '../../../core/rules';

/** Se puede elegir: es de quien mira, esta en el tablero y aun puede hacer algo este turno. */
export const isSelectable = (viewer: TeamId, unit: Unit): boolean => unit.team === viewer && isOnMap(unit) && canStillAct(unit);

/** Lo elegido, segun cuantas quedan: ninguna, una (con su barra) o un grupo. */
export type Picked = { kind: 'none' } | { kind: 'one'; unit: Unit } | { kind: 'group'; units: Unit[] };

/** Las unidades de esos uids que se pueden elegir, en el orden de la partida. */
export function pickedFrom(s: GameState, viewer: TeamId, uids: ReadonlySet<number>): Picked {
  const units = s.units.filter((unit) => uids.has(unit.uid) && isSelectable(viewer, unit));
  const [first] = units;
  if (!first) return { kind: 'none' };
  return units.length === 1 ? { kind: 'one', unit: first } : { kind: 'group', units };
}
