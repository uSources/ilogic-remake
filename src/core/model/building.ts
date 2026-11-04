import type { Team } from './team';

export interface Building {
  /** Tipo 0..5 (ver BUILDING_NAMES). */
  type: number;
  /** Bando propietario, o null si es neutral. */
  owner: Team | null;
  x: number;
  y: number;
  /**
   * [CAMBIO] Captura a medias: quien la hace, con que unidad y los puntos que le quedan al edificio.
   * Se pierde si esa unidad se va o muere.
   */
  capture?: { team: Team; uid: number; left: number } | null;
}

/** [CAMBIO] Punto de control (ver GameState.controlPoints). */
export interface ControlPoint {
  x: number;
  y: number;
  owner: Team | null;
}
