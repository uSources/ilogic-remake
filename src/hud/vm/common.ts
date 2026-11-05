/** Tipos de la interfaz que usan varias partes (bocadillos junto a una casilla, datos con icono). */

export interface Anchor {
  /** Rectangulo de la casilla en pixeles CSS de la ventana. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Un dato con icono: clave de imagen, valor y texto al pasar el raton. */
export interface StatChipVM {
  icon: string;
  text: string;
  title: string;
}

/**
 * De que lado esta algo para quien mira la pantalla: lo suyo, de un aliado o de un enemigo (la
 * interfaz no sabe de numeros de equipo). Se pinta en azul lo suyo y lo aliado, en rojo lo enemigo.
 */
export type Side = 'own' | 'ally' | 'enemy';
/** El lado del dueño de algo que puede no tener dueño (edificio, punto de control). */
export type OwnerSide = Side | 'neutral';

/**
 * Un dato de los dos lados de una partida para quien mira: el suyo (su alianza) y el de sus rivales
 * (sus enemigos). Se lee con OWN y RIVALS, no con 0 y 1.
 */
export type BySide = readonly [own: number, rivals: number];
export const OWN = 0;
export const RIVALS = 1;
/** El puesto de un lado en un BySide. */
export type SideIndex = typeof OWN | typeof RIVALS;
