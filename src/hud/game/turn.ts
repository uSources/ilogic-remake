import type { UIState } from '../state';

export const isOwnTurn = (s: UIState) => s.turn === 'own';

/** El jugador puede mandar: su turno y sin animaciones en curso. */
export const canAct = (s: UIState) => isOwnTurn(s) && !s.busy;
