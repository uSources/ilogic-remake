/**
 * La ventana para deshacer el ultimo movimiento (`GameState.lastMove`): cuando se abre, cuando se
 * cierra y por que no se puede deshacer. La abren las acciones que mueven (las de `keepsUndoWindow`),
 * la cierra dispatch tras cualquier otra y la invariante 'undoWindow' cuando su unidad ya no esta
 * recien movida. Ver la accion 'undoMove' (actions/movement.ts).
 */
import type { ActionRejection, GameEvent, GameState, LastMove, Unit } from '../model';
import { unitAt, unitById } from './queries';

/** Ya no se puede deshacer el ultimo movimiento. */
export function closeUndoWindow(s: GameState): void {
  delete s.lastMove;
}

/** El movimiento que se acaba de hacer se puede deshacer (hasta que se cierre la ventana). */
export function openUndoWindow(s: GameState, lastMove: LastMove): void {
  s.lastMove = lastMove;
}

/**
 * Por que no se puede deshacer ahora el movimiento de `unit`: tiene que ser lo ultimo hecho (y la
 * unidad, recien movida), no haber descubierto a nadie y su casilla de antes seguir libre.
 */
export function undoWindowProblem(s: GameState, unit: Unit): ActionRejection | null {
  const lastMove = s.lastMove;
  if (!lastMove || lastMove.uid !== unit.uid || unit.turnState !== 'moved') return 'nothingToUndo';
  if (lastMove.revealed) return 'revealed';
  return unitAt(s, lastMove.from) ? 'occupied' : null;
}

/**
 * La invariante 'undoWindow': lo que se puede deshacer es de una unidad recien movida que sigue ahi
 * (si cae, o vuelve a estar lista con la ronda nueva, ya no).
 */
export function dropStaleLastMove(s: GameState): GameEvent[] {
  const lastMove = s.lastMove;
  if (lastMove && unitById(s, lastMove.uid)?.turnState !== 'moved') closeUndoWindow(s);
  return [];
}
