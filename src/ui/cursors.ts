/**
 * [CAMBIO] Punteros del raton que anuncian lo que hara el clic derecho (mover, atacar, capturar...),
 * como en los juegos de estrategia en tiempo real. Se dibujan en codigo (pixeles, sin arte nuevo):
 * la flecha de siempre y, abajo a la derecha, una placa con el simbolo de la accion. Se ponen como
 * variables CSS (--cursor-move, --cursor-attack...) y GameScene elige una para el lienzo.
 */
import type { CursorKind } from '../controls/actions';
import { PAL, PAL_MAP } from './palette';

const SIZE = 32;
const S = 2; // cada pixel del dibujo son 2x2 en el puntero

/** Flecha: X borde oscuro, W blanco. */
const ARROW = [
  'X.........',
  'XX........',
  'XWX.......',
  'XWWX......',
  'XWWWX.....',
  'XWWWWX....',
  'XWWWWWX...',
  'XWWWWWWX..',
  'XWWWWXXXX.',
  'XWXWWX....',
  'XX.XWWX...',
  'X...XWX...',
  '.....X....',
];

/** Simbolo de cada placa (7x7): # pixel encendido. */
const GLYPH: Record<Exclude<CursorKind, 'default'>, string[]> = {
  move: ['...#...', '....#..', '#######', '....#..', '...#...', '.......', '.......'],
  attack: ['...#...', '.#####.', '.#...#.', '##.#.##', '.#...#.', '.#####.', '...#...'],
  capture: ['#......', '####...', '#######', '####...', '#......', '#......', '#......'],
  load: ['...#...', '..###..', '.#.#.#.', '...#...', '#.....#', '#.....#', '#######'],
  merge: ['...#...', '...#...', '...#...', '#######', '...#...', '...#...', '...#...'],
  go: ['#..#...', '.#..#..', '..#..#.', '...#..#', '..#..#.', '.#..#..', '#..#...'],
  forbidden: ['..###..', '.#...#.', '#...#.#', '#..#..#', '#.#...#', '.#...#.', '..###..'],
};

const BADGE: Record<Exclude<CursorKind, 'default'>, number> = {
  move: PAL.blue,
  attack: PAL.red,
  capture: PAL.gold,
  load: PAL_MAP.teal,
  merge: PAL_MAP.violet,
  go: PAL_MAP.mint,
  forbidden: PAL.red,
};

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

function draw(kind: Exclude<CursorKind, 'default'>): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const g = canvas.getContext('2d');
  if (!g) return null;
  const px = (x: number, y: number, c: string, s = S) => {
    g.fillStyle = c;
    g.fillRect(x * s, y * s, s, s);
  };
  ARROW.forEach((row, y) => [...row].forEach((ch, x) => ch !== '.' && px(x, y, ch === 'X' ? hex(PAL.ink) : '#ffffff')));
  // Placa de 9x9 (borde oscuro, color de la accion y simbolo blanco) abajo a la derecha.
  const bx = 7,
    by = 6;
  for (let y = 0; y < 9; y++)
    for (let x = 0; x < 9; x++) px(bx + x, by + y, x === 0 || y === 0 || x === 8 || y === 8 ? hex(PAL.ink) : hex(BADGE[kind]));
  GLYPH[kind].forEach((row, y) => [...row].forEach((ch, x) => ch === '#' && px(bx + 1 + x, by + 1 + y, '#ffffff')));
  return canvas.toDataURL('image/png');
}

/** Crea los punteros y los deja en variables CSS (--cursor-<accion>). Sin lienzo, no hace nada. */
export function installCursors(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement.style;
  for (const kind of Object.keys(GLYPH) as Exclude<CursorKind, 'default'>[]) {
    try {
      const url = draw(kind);
      if (url) root.setProperty(`--cursor-${kind}`, `url("${url}") 0 0, ${kind === 'forbidden' ? 'not-allowed' : 'pointer'}`);
    } catch {
      // Sin lienzo (o bloqueado): se queda el puntero normal.
    }
  }
}

/** Valor CSS del puntero de una accion (con el normal de reserva). */
export const cursorCss = (kind: CursorKind): string => (kind === 'default' ? '' : `var(--cursor-${kind}, var(--cursor, auto))`);
