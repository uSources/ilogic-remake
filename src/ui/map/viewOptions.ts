import type { CommandKind, Pos } from '../../core/model';

export type HighlightKind = 'move' | 'merge' | 'load' | 'attack' | 'unload' | 'reach' | 'hover' | 'group' | 'squad';

/** Lo que la escena quiere ver sobre el mapa en cada `MapView.render`. */
export interface ViewOptions {
  vis: boolean[][];
  highlights: Map<string, HighlightKind>;
  hidden: Set<number>;
  /** Camino previsto (de la unidad al cursor). */
  path?: Pos[];
  /** Al soltar en el final del camino se ataca: la flecha va en rojo. */
  pathAttack?: boolean;
  /** Casillas que el enemigo puede atacar en su proximo turno (tecla T). */
  threat?: boolean[][] | null;
  /** Al mover: todo lo que la unidad podria atacar (borde rojo) y destinos peligrosos (marca roja). */
  attackZone?: boolean[][] | null;
  danger?: boolean[][] | null;
  /**
   * Ordenes de varios turnos: linea de puntos hasta el destino y banderita. [CAMBIO] Las ordenes con
   * destino llevan su tipo (color de la bandera) y la linea solo si `line` (unidad o escuadra señalada).
   */
  orders?: { from: Pos; to: Pos; kind?: CommandKind; line?: boolean }[];
  /** [CAMBIO] Lo que hara cada unidad con orden al terminar el turno: camino, objetivo y captura. */
  intents?: { path: Pos[]; attack?: Pos; capture?: Pos }[];
  /** Mision: casilla de destino (marco dorado) y unidad a escoltar (flecha encima). */
  goal?: Pos | null;
  vip?: Pos | null;
  /**
   * [CAMBIO] Puntos de control: zona teñida del color de su dueño, con borde y banderin en el centro.
   * `r` = casillas alrededor del centro; `contested` = se ven unidades de los dos bandos dentro.
   */
  controlPoints?: { x: number; y: number; owner: 0 | 1 | null; r: number; contested: boolean }[];
  /** Capturas a medias que se ven (barra encima del edificio). */
  captures?: { x: number; y: number; left: number; total: number; team: 0 | 1 }[];
}
