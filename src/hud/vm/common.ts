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
