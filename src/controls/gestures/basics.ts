/**
 * Piezas comunes de los gestos: el evento de puntero sin Phaser, las teclas que lo acompañan y el
 * umbral que separa un toque de un arrastre.
 */

/** Pixeles (CSS) que hay que mover el puntero para que no cuente como toque. */
export const DRAG_THRESHOLD = 6;

/** Se ha movido lo bastante para ser arrastre. `dpr`: densidad de pantalla (el umbral es en pixeles reales). */
export function movedFar(dx: number, dy: number, dpr: number): boolean {
  return Math.hypot(dx, dy) > DRAG_THRESHOLD * dpr;
}

export interface Pt {
  x: number;
  y: number;
}

export const distance = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Un evento del raton o de un dedo, sin Phaser (GameScene lo traduce desde Phaser.Input.Pointer). */
export interface PointerIn {
  id: number;
  /** Posicion en pixeles del lienzo. */
  x: number;
  y: number;
  /** Viene de un dedo (no del raton). */
  touch: boolean;
  /** Algun boton (o el dedo) esta pulsado. */
  down: boolean;
  /** Boton derecho: pulsado (en down) o soltado (en up). */
  right: boolean;
  /** Mayusculas pulsadas. */
  shift: boolean;
  /** [CAMBIO] Ctrl (o Cmd en Mac) pulsado: elegir varias, como en Windows. */
  ctrl?: boolean;
  /** [CAMBIO] Alt pulsado (Alt + clic derecho: el menu completo de ordenes). */
  alt?: boolean;
  /** [CAMBIO] Boton central (rueda): pulsado (en down) o soltado (en up). Solo arrastra el mapa. */
  middle?: boolean;
}

/** [CAMBIO] Teclas que acompañan a un clic. */
export interface Mods {
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
}

export const modsOf = (pointer: PointerIn): Mods => ({ shift: pointer.shift, ctrl: !!pointer.ctrl, alt: !!pointer.alt });

/** Algo programado para despues (temporizador de la escena), que se puede cancelar. */
export interface Later {
  cancel(): void;
}
