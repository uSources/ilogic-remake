import type { Pos } from './geometry';
import type { TeamId } from './team';

/** Un edificio en su casilla (x, y). */
export interface Building extends Pos {
  /** Tipo de edificio: su id en buildings.json (ver buildingTypeOf). */
  type: string;
  /** Equipo propietario, o null si es neutral. */
  owner: TeamId | null;
  /**
   * [CAMBIO] Captura a medias: quien la hace, con que unidad y los puntos que le quedan al edificio.
   * Se pierde si esa unidad se va o muere.
   */
  capture?: { team: TeamId; uid: number; left: number } | null;
}

/** [CAMBIO] Punto de control (ver GameState.controlPoints). */
export interface ControlPoint extends Pos {
  owner: TeamId | null;
}
