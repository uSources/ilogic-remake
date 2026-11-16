/**
 * Lo que el turno (turnControls.ts, un sistema: decide sin three.js) pide al motor de la vista. Las
 * implementa el motor (highlights.ts, movePreview.ts; los sucesos, systems/events con engine/fx) y las junta match3d.ts; los tests usan unas
 * falsas que apuntan lo que se les pide (docs/PLAN-VISTA3D.md, "Los puertos").
 */
import type { GameEvent, Pos } from '../../core/model';

/**
 * Las marcas del tablero que enseña el turno: a donde llega (losas azules), hasta donde ataca (borde
 * rojo), a quien puede atacar (una diana encima) y lo elegido.
 */
export interface TileMarks {
  showReach(tiles: readonly Pos[]): void;
  /** Las casillas a las que podria disparar este turno, desde cualquier sitio al que llega. */
  showAttackReach(tiles: readonly Pos[]): void;
  /** Los enemigos a los que puede atacar ahora (su casilla). */
  showTargets(tiles: readonly Pos[]): void;
  select(pos: Pos | null): void;
  /** Un aro a los pies de cada unidad de un grupo elegido (vacio: ninguno). */
  showGroup(tiles: readonly Pos[]): void;
}

/** Lo que el turno pregunta de la pantalla: si una casilla se ve ahora (doble clic: las de ese tipo que se ven). */
export interface ScreenView {
  isOnScreen(pos: Pos): boolean;
}

/** La unidad que se va a mover y el camino que seguiria; su fantasma va al final del camino. */
export interface MoveLook {
  readonly uid: number;
  readonly path: readonly Pos[];
}

/** Un disparo a distancia que se apunta: de la casilla desde donde dispara a la del objetivo. */
export interface ShotLook {
  readonly from: Pos;
  readonly to: Pos;
}

/** Enseña a donde llegaria la unidad elegida: la flecha del camino y su fantasma al final (null: nada). */
export interface MovePreview {
  show(look: MoveLook | null): void;
  /** El visor de un disparo en arco al apuntar (null: ninguno). */
  aim(shot: ShotLook | null): void;
}

/** Enseña los sucesos de una accion, en orden; acaba cuando han terminado de verse. */
export interface EventPlayer {
  play(events: readonly GameEvent[]): Promise<void>;
}
