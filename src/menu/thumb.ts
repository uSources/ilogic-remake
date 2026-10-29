import { HQ } from '../core/data';
import { MAP_H, MAP_W, setMapSize } from '../core/data';
import type { GameState } from '../core/types';
import { PAL_CSS } from '../ui/palette';

/** Ejecuta algo que cambia el tamaño del mapa global (crear o leer otra partida) y lo deja como estaba. */
export function keepMapSize<T>(fn: () => T): T {
  const w = MAP_W,
    h = MAP_H;
  try {
    return fn();
  } finally {
    setMapSize(w, h);
  }
}

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/**
 * Miniatura de un mapa (como imagen) para las tarjetas: terreno, edificios con el color de su dueño
 * (las bases mas grandes) y, si se pide, las unidades.
 */
export function mapThumb(s: GameState, palette: number[], opts: { units?: boolean | 'own'; px?: number } = {}): string {
  const n = s.map.length;
  const px = opts.px ?? (n <= 20 ? 6 : n <= 32 ? 4 : 3);
  const cv = document.createElement('canvas');
  cv.width = n * px;
  cv.height = s.map[0]!.length * px;
  const ctx = cv.getContext('2d')!;
  for (let x = 0; x < n; x++)
    for (let y = 0; y < s.map[x]!.length; y++) {
      ctx.fillStyle = hex(palette[s.map[x]![y]!] ?? 0x3a7a3a);
      ctx.fillRect(x * px, y * px, px, px);
    }
  const team = (o: 0 | 1 | null) => (o === 0 ? '#3aa8ff' : o === 1 ? PAL_CSS.red : '#d6dbe6');
  for (const b of s.buildings) {
    const big = b.type === HQ;
    const pad = big ? -1 : 0;
    ctx.fillStyle = PAL_CSS.ink;
    ctx.fillRect(b.x * px + pad - 1, b.y * px + pad - 1, px - 2 * pad + 2, px - 2 * pad + 2);
    ctx.fillStyle = team(b.owner);
    ctx.fillRect(b.x * px + pad, b.y * px + pad, px - 2 * pad, px - 2 * pad);
  }
  if (opts.units)
    for (const u of s.units) {
      if (u.carrier !== null || (opts.units === 'own' && u.team !== 0)) continue;
      ctx.fillStyle = u.team === 0 ? '#8fd0ff' : '#ff8a80';
      ctx.fillRect(u.x * px + 1, u.y * px + 1, Math.max(1, px - 2), Math.max(1, px - 2));
    }
  return cv.toDataURL();
}
