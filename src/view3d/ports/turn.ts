/**
 * Lo que el turno (turnControls.ts, un sistema: decide sin three.js) pide al motor de la vista. Las
 * implementa el motor (highlights.ts; los sucesos, systems/events con engine/fx) y las junta match3d.ts; los tests usan unas
 * falsas que apuntan lo que se les pide (docs/PLAN-VISTA3D.md, "Los puertos").
 */
import type { GameEvent, Pos } from '../../core/model';

/** Las marcas del tablero que enseña el turno: a donde llega (azul), a quien ataca (rojo) y lo elegido. */
export interface TileMarks {
  showReach(tiles: readonly Pos[]): void;
  showTargets(tiles: readonly Pos[]): void;
  select(pos: Pos | null): void;
}

/** Enseña los sucesos de una accion, en orden; acaba cuando han terminado de verse. */
export interface EventPlayer {
  play(events: readonly GameEvent[]): Promise<void>;
}
