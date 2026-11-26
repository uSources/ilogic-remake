import type { UIState } from '../state';

export const isOwnTurn = (s: UIState) => s.turn === 'own';

/** El jugador puede mandar: su turno y sin animaciones en curso. */
export const canAct = (s: UIState) => isOwnTurn(s) && !s.busy;

/**
 * El boton del menu: en tu turno, el menu; mientras miras jugar a los demas (`watching`, lo dice la
 * escena), salir al menu principal (dos pulsaciones).
 */
export const canUseMenuButton = (s: UIState) => canAct(s) || s.watching;

/**
 * Comprando en una fabrica: la lista ocupa la derecha (BuyList.tsx), asi que lo de ese lado (el enemigo
 * y la pausa arriba; «Acabar turno» y el minimapa abajo) no sale hasta cerrarla.
 */
export const isBuying = (s: UIState) => s.menu?.kind === 'buy';
