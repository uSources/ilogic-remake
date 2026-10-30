/**
 * Que hace un toque con el dedo en el mapa. Con raton y teclado se señala y se confirma (el cursor
 * sigue al raton y el clic confirma); con el dedo no hay "pasar por encima", asi que antes cada paso
 * costaba dos toques (señalar y confirmar): mover una unidad eran cuatro toques y el menu.
 *
 * [CAMBIO] Ahora un toque hace directamente lo que tiene sentido. Solo el ataque pide dos toques: el
 * primero enseña la prevision de combate y el segundo ataca, porque un ataque no se puede deshacer.
 * Funciones puras (sin Phaser) para poder probarlas; las usa GameScene.
 */

/** Toque en el mapa sin unidad elegida. */
export interface MapTap {
  /** Hay una unidad propia que aun puede actuar este turno. */
  ownActive: boolean;
  /** Edificio propio libre donde se puede comprar. */
  buyHere: boolean;
  /** Hay una unidad que se ve (enemiga, o propia ya usada). */
  visibleUnit: boolean;
  /** Ya se esta enseñando el alcance de esa misma unidad. */
  inspectingThis: boolean;
}

export type MapTapAction = 'select' | 'buy' | 'inspect' | 'closeInspect' | 'point';

export function mapTap(t: MapTap): MapTapAction {
  if (t.ownActive) return 'select';
  if (t.inspectingThis) return 'closeInspect';
  if (t.buyHere) return 'buy';
  if (t.visibleUnit) return 'inspect';
  // Casilla vacia: solo señalarla (la ficha dice que hay). El menu de partida esta en el boton ☰.
  return 'point';
}

/** Lo que pasaria al soltar la unidad elegida en la casilla tocada (Intent de GameScene). */
export type IntentKind = 'none' | 'stay' | 'move' | 'attack' | 'merge' | 'load';

/** Toque con una unidad elegida (alcance a la vista). */
export interface MoveTap {
  intent: IntentKind;
  /** El cursor ya estaba en esa casilla (segundo toque). */
  atCursor: boolean;
  /** Hay otra unidad propia que aun puede actuar. */
  otherOwnActive: boolean;
}

export type MoveTapAction = 'commit' | 'preview' | 'reselect' | 'deselect';

export function moveTap(t: MoveTap): MoveTapAction {
  switch (t.intent) {
    case 'attack':
      // Primero la prevision de combate; el ataque, al tocar otra vez el mismo objetivo.
      return t.atCursor ? 'commit' : 'preview';
    case 'move':
    case 'merge':
    case 'load':
    case 'stay':
      return 'commit';
    case 'none':
      return t.otherOwnActive ? 'reselect' : 'deselect';
    default:
      return 'deselect';
  }
}
