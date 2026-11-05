/**
 * Casillas marcadas en el mapa segun la fase (alcance, objetivos, grupo...). Funcion pura: la escena
 * le pasa lo que hay elegido y dibuja el resultado con MapView. Que marca cada fase esta en su
 * entrada de PHASES (`highlights`).
 */
import type { MoveRange } from '../../core/rules';
import type { GameState, Pos, TeamId } from '../../core/model';
import type { HighlightKind } from '../../ui/mapView';
import { PHASES } from './phases';
import { noHighlights } from './phases/phase';
import type { Phase } from './types';

export interface HighlightInput {
  s: GameState;
  /** El equipo que mira (sus unidades se eligen; las demas solo se ven si estan a la vista). */
  viewer: TeamId;
  phase: Phase;
  cursor: Pos;
  /** Alcance de la unidad que se mueve, y adonde se puede unir o subir. */
  range: MoveRange | null;
  merge: ReadonlyMap<string, number>;
  load: ReadonlyMap<string, number>;
  attack: ReadonlyMap<string, number>;
  unload: ReadonlySet<string>;
  /** Unidades del menu de ordenes de una casilla (fase 'orderMenu'). */
  orderMenuUids: readonly number[] | null;
  /** Unidades a las que se esta dando una orden con destino (fase 'target'). */
  orderingUids: readonly number[] | null;
  /** Area del poder del general que se apunta en `c`. */
  targetArea: (target: Pos) => Pos[];
  group: ReadonlySet<number>;
  inspectUid: number | null;
  enemyPlaying: boolean;
  visible: (pos: Pos) => boolean;
}

export interface Highlights {
  tiles: Map<string, HighlightKind>;
  /** La unidad cuyo alcance se enseñaba ya no esta (o no se ve): hay que dejar de señalarla. */
  inspectGone: boolean;
}

export function computeHighlights(input: HighlightInput): Highlights {
  return PHASES[input.phase].highlights?.(input) ?? noHighlights();
}
