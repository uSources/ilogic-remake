/**
 * Deshacer movimientos (`GameState.undoableMoves`, la accion 'undoMove'): cuando se apunta un
 * movimiento, cuando se olvidan y por que no se puede deshacer. Mover apunta el suyo; las acciones
 * que no cuentan nada nuevo de la partida (esperar, escuadras, ordenes: las de `keepsUndo`) los
 * dejan como estan, y dispatch los olvida todos tras cualquier otra. La invariante 'undoWindow'
 * olvida los de unidades que ya no estan recien movidas. Se deshace siempre el ultimo.
 */
import type { ActionRejection, GameEvent, GameState, UndoableMove, Unit } from '../model';
import { unitAt, unitById } from './queries';

/** El ultimo movimiento que se puede deshacer (null si no hay ninguno). */
export const lastUndoableMove = (s: GameState): UndoableMove | null => s.undoableMoves?.at(-1) ?? null;

/** Ya no se puede deshacer ningun movimiento. */
export function forgetUndoableMoves(s: GameState): void {
  delete s.undoableMoves;
}

/** Deja los que se pueden deshacer en `moves`; si no queda ninguno, no hay nada que deshacer. */
function keepUndoableMoves(s: GameState, moves: readonly UndoableMove[]): void {
  if (moves.length) s.undoableMoves = [...moves];
  else forgetUndoableMoves(s);
}

/** El movimiento que se acaba de hacer se puede deshacer (el ultimo, hasta que se olviden). */
export function rememberMove(s: GameState, move: UndoableMove): void {
  s.undoableMoves = [...(s.undoableMoves ?? []), move];
}

/** Se ha deshecho el ultimo movimiento: el de antes pasa a ser el ultimo. */
export function dropLastUndoableMove(s: GameState): void {
  keepUndoableMoves(s, (s.undoableMoves ?? []).slice(0, -1));
}

/** La unidad sigue como la dejo su movimiento: en el mapa y sin haber vuelto a estar lista (ronda nueva). */
const isStillMoved = (unit: Unit | undefined): unit is Unit => !!unit && unit.carrier === null && unit.turnState !== 'ready';

/**
 * Por que no se puede deshacer ahora el movimiento de `unit`: tiene que ser el ultimo apuntado (y la
 * unidad seguir como la dejo), no haber descubierto a nadie y su casilla de antes seguir libre.
 */
export function undoMoveProblem(s: GameState, unit: Unit): ActionRejection | null {
  const last = lastUndoableMove(s);
  if (!last || last.uid !== unit.uid || !isStillMoved(unit)) return 'nothingToUndo';
  if (last.revealed) return 'revealed';
  return unitAt(s, last.from) ? 'occupied' : null;
}

/**
 * La invariante 'undoWindow': lo que se puede deshacer es de unidades que siguen como las dejo su
 * movimiento (si caen, suben a un transporte o vuelven a estar listas con la ronda nueva, ya no).
 */
export function dropStaleUndoableMoves(s: GameState): GameEvent[] {
  const moves = s.undoableMoves;
  if (!moves) return [];
  keepUndoableMoves(
    s,
    moves.filter((move) => isStillMoved(unitById(s, move.uid))),
  );
  return [];
}
