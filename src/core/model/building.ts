import type { Pos } from './geometry';
import type { Team } from './team';

/** Un edificio en su casilla (x, y). */
export interface Building extends Pos {
  /** Tipo de edificio: su id en buildings.json (ver buildingTypeOf). */
  type: string;
  /** Bando propietario, o null si es neutral. */
  owner: Team | null;
  /**
   * [CAMBIO] Captura a medias: quien la hace, con que unidad y los puntos que le quedan al edificio.
   * Se pierde si esa unidad se va o muere.
   */
  capture?: { team: Team; uid: number; left: number } | null;
}

/** [CAMBIO] Punto de control (ver GameState.controlPoints). */
export interface ControlPoint extends Pos {
  owner: Team | null;
}
