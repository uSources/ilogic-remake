/**
 * Pulsar sin soltar: puede acabar en toque, en arrastrar el mapa o (con el boton izquierdo, desde
 * una casilla sin unidad propia) en un recuadro de seleccion.
 */
import { movedFar, type Mods, type Pt } from './basics';

export type PressButton = 'left' | 'right' | 'middle';

/** Una pulsacion en curso: con que boton, donde empezo, por donde va y si ya se ha movido. */
export interface Press {
  start: Pt;
  last: Pt;
  moved: boolean;
  button: PressButton;
  mods: Mods;
}

export const newPress = (at: Pt, button: PressButton, mods: Mods): Press => ({
  start: { x: at.x, y: at.y },
  last: { x: at.x, y: at.y },
  moved: false,
  button,
  mods,
});

/** Recuadro de seleccion en pixeles del lienzo (arrastrar desde una casilla sin unidad propia). */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Mayusculas o Ctrl: añadir a lo elegido en vez de cambiarlo. */
  add?: boolean;
}

/** Recuadro desde donde empezo la pulsacion hasta `to`. */
export const boxFromPress = (press: Press, to: Pt): Box => ({
  x0: press.start.x,
  y0: press.start.y,
  x1: to.x,
  y1: to.y,
  add: press.mods.shift || press.mods.ctrl,
});

/** Lo que es mover el puntero pulsado: empezar un recuadro, desplazar el mapa o nada todavia. */
export type PressMove = 'box' | 'pan' | 'still';

/**
 * Decide que es mover la pulsacion hasta `to`. Solo el primer movimiento largo con el boton izquierdo
 * puede ser recuadro (si `canBox` lo deja); despues, todo es desplazar el mapa.
 */
export function classifyPressMove(press: Press, to: Pt, dpr: number, canBox: () => boolean): PressMove {
  const isFar = movedFar(to.x - press.last.x, to.y - press.last.y, dpr);
  if (!press.moved && press.button === 'left' && isFar && canBox()) return 'box';
  if (press.moved || isFar) return 'pan';
  return 'still';
}
