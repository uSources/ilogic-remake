import type Phaser from 'phaser';
import fontSrc from '../../tools/art/font/ilogic.txt?raw';
import { PAL_CSS } from './palette';

/**
 * Cifras de vida de las unidades en el mapa (1 a 9: la vida en decenas, redondeada hacia arriba).
 * Antes eran dibujos de 2013 de 32×48 encogidos a 14×14, borrosos y aplastados. Ahora salen de la
 * letra Ilogic (tools/art/font/ilogic.txt, la misma de los titulos): cada pixel de la letra son 2×2
 * del mapa, con un borde oscuro de 1, asi que se ven nitidas a cualquier zoom (y del tamaño de las
 * de antes). Se pintan al empezar la partida; no hay imagenes que compilar.
 */

/** Filas de un glifo de la letra (# = pixel), o null si no esta. */
export function glyphRows(src: string, ch: string): string[] | null {
  let rows: string[] | null = null;
  for (const raw of src.split('\n')) {
    const line = raw.trimEnd();
    if (line.startsWith('= ')) {
      if (rows) return rows;
      if (line.slice(2).split(/\s+/).includes(ch)) rows = [];
      continue;
    }
    if (!rows) continue;
    if (!line) return rows.length ? rows : null;
    // Filas de encima (^) o de debajo (,): las cifras no tienen, pero si las hubiera, cuentan.
    if (/^[#.^,]+$/.test(line)) rows.push(line.replace(/^[\^,]/, ''));
  }
  return rows && rows.length ? rows : null;
}

/** Pixeles del mapa por pixel de la letra. */
const SCALE = 2;

/** Agranda un glifo: cada pixel pasa a ser k×k. */
export function scaled(rows: string[], k: number): string[] {
  return rows.flatMap((r) => Array<string>(k).fill([...r].map((c) => c.repeat(k)).join('')));
}

/** Clave de la textura de la cifra de vida `n` (1..9). */
export const lifeKey = (n: number): string => `life_${n}`;

/**
 * Pinta la cifra con un borde oscuro de un pixel alrededor (tambien en diagonal). Devuelve las filas
 * de la imagen: ' ' vacio, 'o' borde, '#' cifra. Separado para poder probarlo sin lienzo.
 */
export function outlined(rows: string[]): string[] {
  const h = rows.length + 2;
  const w = Math.max(...rows.map((r) => r.length)) + 2;
  const out = Array.from({ length: h }, () => Array<string>(w).fill(' '));
  rows.forEach((r, y) =>
    [...r].forEach((c, x) => {
      if (c !== '#') return;
      for (let dy = 0; dy <= 2; dy++) for (let dx = 0; dx <= 2; dx++) if (out[y + dy]![x + dx] === ' ') out[y + dy]![x + dx] = 'o';
    }),
  );
  rows.forEach((r, y) => [...r].forEach((c, x) => c === '#' && (out[y + 1]![x + 1] = '#')));
  return out.map((r) => r.join(''));
}

/** Crea las texturas life_1..life_9 (una vez por partida: si ya estan, no hace nada). */
export function addLifeTextures(textures: Phaser.Textures.TextureManager): void {
  for (let n = 1; n <= 9; n++) {
    const key = lifeKey(n);
    if (textures.exists(key)) continue;
    const rows = glyphRows(fontSrc, String(n));
    if (!rows) continue;
    const img = outlined(scaled(rows, SCALE));
    const c = document.createElement('canvas');
    c.width = img[0]!.length;
    c.height = img.length;
    const g = c.getContext('2d');
    if (!g) continue;
    img.forEach((r, y) =>
      [...r].forEach((p, x) => {
        if (p === ' ') return;
        g.fillStyle = p === '#' ? '#ffffff' : PAL_CSS.ink;
        g.fillRect(x, y, 1, 1);
      }),
    );
    textures.addCanvas(key, c);
  }
}
