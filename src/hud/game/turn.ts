import type { UIState } from '../state';

export const isOwnTurn = (s: UIState) => s.turn === 'own';

/** El jugador puede mandar: su turno y sin animaciones en curso. */
export const canAct = (s: UIState) => isOwnTurn(s) && !s.busy;

/** El boton del menu: en tu turno, el menu; mientras juegan los demas, salir al menu principal (dos pulsaciones). */
export const canUseMenuButton = (s: UIState) => canAct(s) || (s.busy && !isOwnTurn(s) && s.end === null);
