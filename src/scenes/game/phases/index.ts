/**
 * Las fases del turno del jugador y lo que hace cada una (ver phase.ts). El tipo pide una entrada
 * por cada `Phase`: una fase nueva sin la suya no compila.
 */
import type { Phase } from '../types';
import { buyPhase } from './buy';
import { gameMenuPhase } from './gameMenu';
import { groupMenuPhase } from './groupMenu';
import { mapPhase } from './map';
import { movePhase } from './move';
import { orderMenuPhase } from './orderMenu';
import type { PhaseHandler } from './phase';
import { targetPhase } from './target';
import { attackPhase, unitMenuPhase, unloadPickPhase, unloadTilePhase } from './unitMenu';

/** Animando o jugando la IA: no se acepta nada (la escena acelera las animaciones al aceptar). */
const busyPhase: PhaseHandler = {
  accept: () => {},
  back: () => {},
};

export const PHASES: { readonly [P in Phase]: PhaseHandler } = {
  map: mapPhase,
  gameMenu: gameMenuPhase,
  unitMenu: unitMenuPhase,
  groupMenu: groupMenuPhase,
  orderMenu: orderMenuPhase,
  buy: buyPhase,
  move: movePhase,
  attack: attackPhase,
  unloadPick: unloadPickPhase,
  unloadTile: unloadTilePhase,
  target: targetPhase,
  busy: busyPhase,
};

export { acceptMapTile } from './map';
export { captureNow } from './unitMenu';
export { GameMenuChoices, gameMenuOf, quitWhileWatching, watchesOthers, type GameMenuHost, type WatchState } from './gameMenu';
export type { PhaseHost } from './phase';
