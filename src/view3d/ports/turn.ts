/**
 * Lo que el turno (turnControls.ts, un sistema: decide sin three.js) pide al motor de la vista. Las
 * implementa el motor (highlights.ts, movePreview.ts; los sucesos, systems/events con engine/fx) y las junta match3d.ts; los tests usan unas
 * falsas que apuntan lo que se les pide (docs/PLAN-VISTA3D.md, "Los puertos").
 */
import type { GameEvent, Pos } from '../../core/model';

/** Las marcas del tablero que enseña el turno: a donde llega (azul), a quien ataca (rojo) y lo elegido. */
export interface TileMarks {
  showReach(tiles: readonly Pos[]): void;
  showTargets(tiles: readonly Pos[]): void;
  select(pos: Pos | null): void;
}

/** La unidad que se va a mover y el camino que seguiria; su fantasma va al final del camino. */
export interface MoveLook {
  readonly uid: number;
  readonly path: readonly Pos[];
}

/** Enseña a donde llegaria la unidad elegida: la flecha del camino y su fantasma al final (null: nada). */
export interface MovePreview {
  show(look: MoveLook | null): void;
}

/** Enseña los sucesos de una accion, en orden; acaba cuando han terminado de verse. */
export interface EventPlayer {
  play(events: readonly GameEvent[]): Promise<void>;
}
