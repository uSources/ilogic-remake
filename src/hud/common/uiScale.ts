import { settings } from '../../settings';
import type { Anchor } from '../vm/common';

/**
 * La escala de la interfaz (Opciones, «Tamaño de la interfaz»): #hud lleva `zoom`, asi que las
 * coordenadas de pantalla que da la vista 3D (el recuadro de una casilla) se dividen por ella antes
 * de colocar algo junto a la casilla.
 */
export const zoom = () => settings.uiScale || 1;

export function scaled(anchor: Anchor): Anchor {
  const scale = zoom();
  return { x: anchor.x / scale, y: anchor.y / scale, w: anchor.w / scale, h: anchor.h / scale };
}
