/**
 * Pellizco: los dedos que estan en la pantalla y los pasos de zoom al separarlos o juntarlos.
 */
import { distance, type Pt } from './basics';

/** Un paso de zoom del pellizco, y el punto medio entre los dedos (alrededor de ese punto). */
export interface PinchZoom {
  dir: 1 | -1;
  x: number;
  y: number;
}

/** Cuanto tiene que cambiar la distancia entre dos dedos para dar un paso de zoom. */
const PINCH_IN = 1.3;
const PINCH_OUT = 0.77;
/** Distancia minima de referencia, para no dividir entre cero con dos dedos en el mismo punto. */
const MIN_BASE_DISTANCE = 1;

const isSmallChange = (ratio: number) => ratio <= PINCH_IN && ratio >= PINCH_OUT;

const midpoint = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * Los dedos que estan en la pantalla y el pellizco. Con dos o mas dedos, cada cambio grande de la
 * distancia entre los dos primeros da un paso de zoom. El pellizco dura hasta que se levantan todos.
 */
export class Pinch {
  private fingers = new Map<number, Pt>();
  /** Distancia de referencia del pellizco; null si no se pellizca. */
  private baseDistance: number | null = null;

  /** Dedos en pantalla. */
  get count(): number {
    return this.fingers.size;
  }

  /** Hay un pellizco en curso. */
  get active(): boolean {
    return this.baseDistance !== null;
  }

  /** Un dedo nuevo. Con dos o mas, (re)empieza el pellizco con los dos primeros. */
  add(id: number, pos: Pt): void {
    this.fingers.set(id, { ...pos });
    if (this.fingers.size < 2) return;
    const [first, second] = this.firstTwo();
    this.baseDistance = Math.max(MIN_BASE_DISTANCE, distance(first, second));
  }

  /** Un dedo se ha movido. Devuelve el paso de zoom si la distancia ha cambiado bastante. */
  move(id: number, pos: Pt): PinchZoom | null {
    if (this.fingers.has(id)) this.fingers.set(id, { ...pos });
    if (this.baseDistance === null || this.fingers.size < 2) return null;
    const [first, second] = this.firstTwo();
    const newDistance = distance(first, second);
    const ratio = newDistance / this.baseDistance;
    if (isSmallChange(ratio)) return null;
    this.baseDistance = newDistance;
    return { dir: ratio > 1 ? 1 : -1, ...midpoint(first, second) };
  }

  /**
   * Un dedo se levanta. Devuelve true si era parte de un pellizco: entonces el gesto no es un toque
   * ni un arrastre. El pellizco termina cuando no queda ningun dedo.
   */
  remove(id: number): boolean {
    const wasOnScreen = this.fingers.delete(id);
    const wasPinching = this.active;
    if (this.fingers.size === 0) this.baseDistance = null;
    return wasOnScreen && wasPinching;
  }

  private firstTwo(): [Pt, Pt] {
    const [first, second] = [...this.fingers.values()];
    return [first!, second!];
  }
}
