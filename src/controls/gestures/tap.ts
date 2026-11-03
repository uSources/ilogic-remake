/**
 * Toque o clic sin arrastrar, y el doble clic: dos toques seguidos en el mismo sitio.
 */
import { movedFar, type Mods, type Pt } from './basics';

/** [CAMBIO] Dos clics (o toques) seguidos en el mismo sitio dentro de este tiempo (ms) son doble clic. */
export const DOUBLE_MS = 350;

/** [CAMBIO] Un toque o clic sin arrastrar: con que, que teclas y cuantas veces seguidas (2 = doble clic). */
export interface TapInfo extends Mods {
  touch: boolean;
  count: number;
}

/** El ultimo toque: donde, cuando y cuantos iban seguidos. */
export interface TapRecord extends Pt {
  at: number;
  count: number;
}

const isRepeatOf = (last: TapRecord, at: Pt, now: number, dpr: number) =>
  now - last.at <= DOUBLE_MS && !movedFar(at.x - last.x, at.y - last.y, dpr);

/** El toque nuevo en `at`: cuenta uno mas si sigue al anterior en el mismo sitio, si no empieza en 1. */
export function nextTap(last: TapRecord | null, at: Pt, now: number, dpr: number): TapRecord {
  const count = last && isRepeatOf(last, at, now, dpr) ? last.count + 1 : 1;
  return { x: at.x, y: at.y, at: now, count };
}
