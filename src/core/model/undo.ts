import type { Building } from './building';
import type { Pos } from './geometry';

/**
 * Un movimiento que aun se puede deshacer (la accion 'undoMove'): que unidad se movio y desde donde.
 * Los movimientos se apuntan uno tras otro (`GameState.undoableMoves`) mientras lo que se hace
 * despues no cuenta nada nuevo de la partida (esperar, escuadras, ordenes: `keepsUndo` en su
 * entrada de ACTIONS); cualquier otra accion los olvida todos. Se deshace siempre el ultimo.
 */
export interface UndoableMove {
  uid: number;
  from: Pos;
  /** La captura a medias que llevaba en el edificio de `from` y perdio al irse (vuelve al deshacer). */
  capture: NonNullable<Building['capture']> | null;
  /** Al moverse descubrio enemigos que antes no veia: entonces no se puede deshacer (seria mirar gratis). */
  revealed: boolean;
}
