/**
 * Adaptador de punteros (raton y dedos): la parte del gesto que no depende del juego. Cuanto se
 * mueve un dedo o el raton para contar como arrastre, cuanto hay que mantener pulsado, y los dedos
 * a la vez (pellizcar para hacer zoom). Sin Phaser ni estado de partida, asi que se prueba sola.
 *
 * Lo que un gesto significa en el juego (coger una unidad, mover, comprar...) lo decide GameScene,
 * que pregunta aqui por los tiempos y los dedos.
 */

/** Pixeles (CSS) que hay que mover el puntero para que no cuente como toque. */
export const DRAG_THRESHOLD = 6;
/** Con el dedo, mantener pulsado este tiempo (ms) para levantar la unidad. */
export const PICK_HOLD_MS = 250;
/** Mantener pulsado este tiempo (ms) para llevar el cursor ahi (ficha de informacion). */
export const LONG_PRESS_MS = 480;

/** Se ha movido lo bastante para ser arrastre. `dpr`: densidad de pantalla (el umbral es en pixeles reales). */
export function movedFar(dx: number, dy: number, dpr: number): boolean {
  return Math.hypot(dx, dy) > DRAG_THRESHOLD * dpr;
}

export interface Pt {
  x: number;
  y: number;
}

/** Un paso de zoom del pellizco, y el punto medio entre los dedos (alrededor de ese punto). */
export interface PinchZoom {
  dir: 1 | -1;
  x: number;
  y: number;
}

/** Cuanto tiene que cambiar la distancia entre dos dedos para dar un paso de zoom. */
const PINCH_IN = 1.3;
const PINCH_OUT = 0.77;

/**
 * Los dedos que estan en la pantalla y el pellizco. Con dos o mas dedos, cada cambio grande de la
 * distancia entre los dos primeros da un paso de zoom. El pellizco dura hasta que se levantan todos.
 */
export class Pinch {
  private points = new Map<number, Pt>();
  /** Distancia de referencia del pellizco; null si no se pellizca. */
  private base: number | null = null;

  /** Dedos en pantalla. */
  get count(): number {
    return this.points.size;
  }

  /** Hay un pellizco en curso. */
  get active(): boolean {
    return this.base !== null;
  }

  /** Un dedo nuevo. Con dos o mas, (re)empieza el pellizco con los dos primeros. */
  add(id: number, p: Pt): void {
    this.points.set(id, { ...p });
    if (this.points.size >= 2) {
      const [a, b] = this.first2();
      this.base = Math.max(1, dist(a, b));
    }
  }

  /** Un dedo se ha movido. Devuelve el paso de zoom si la distancia ha cambiado bastante. */
  move(id: number, p: Pt): PinchZoom | null {
    if (this.points.has(id)) this.points.set(id, { ...p });
    if (this.base === null || this.points.size < 2) return null;
    const [a, b] = this.first2();
    const d = dist(a, b);
    const ratio = d / this.base;
    if (ratio <= PINCH_IN && ratio >= PINCH_OUT) return null;
    this.base = d;
    return { dir: ratio > 1 ? 1 : -1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  /**
   * Un dedo se levanta. Devuelve true si era parte de un pellizco: entonces el gesto no es un toque
   * ni un arrastre. El pellizco termina cuando no queda ningun dedo.
   */
  remove(id: number): boolean {
    const had = this.points.delete(id);
    const was = this.base !== null;
    if (this.points.size === 0) this.base = null;
    return had && was;
  }

  private first2(): [Pt, Pt] {
    const [a, b] = [...this.points.values()];
    return [a!, b!];
  }
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
