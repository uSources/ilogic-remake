import type { UIState } from '../state';

export const isPlayerTurn = (s: UIState) => s.turn === 'player';

/** El jugador puede mandar: su turno y sin animaciones en curso. */
export const canAct = (s: UIState) => isPlayerTurn(s) && !s.busy;
