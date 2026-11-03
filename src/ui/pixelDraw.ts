import type Phaser from 'phaser';

/**
 * Dibujo de pixeles con Graphics: todo con rectangulos de pixel entero (nada de lineas ni curvas),
 * para que se vea nitido con el zoom entero de la camara. Lo usan las capas del mapa y los efectos.
 */

type G = Phaser.GameObjects.Graphics;
/** x, y, ancho, alto. */
export type PxRect = readonly [number, number, number, number];

/** Varios rectangulos del mismo color. */
export function fillRects(g: G, color: number, alpha: number, rects: readonly PxRect[]): void {
  g.fillStyle(color, alpha);
  for (const [x, y, w, h] of rects) g.fillRect(x, y, w, h);
}

/**
 * Esquinas en L de un recuadro (como el cursor): en cada esquina un trazo horizontal y otro vertical
 * de `len` pixeles y `thick` de grueso, por dentro del recuadro. Usa el color ya puesto en `g`.
 */
export function cornerBrackets(g: G, x: number, y: number, w: number, h: number, len: number, thick: number): void {
  const r = x + w,
    b = y + h;
  g.fillRect(x, y, len, thick);
  g.fillRect(x, y, thick, len);
  g.fillRect(r - len, y, len, thick);
  g.fillRect(r - thick, y, thick, len);
  g.fillRect(x, b - thick, len, thick);
  g.fillRect(x, b - len, thick, len);
  g.fillRect(r - len, b - thick, len, thick);
  g.fillRect(r - thick, b - len, thick, len);
}

/**
 * Borde de un recuadro, de `thick` pixeles por dentro. Con `overlap` los lados se pisan en las
 * esquinas (con transparencia se nota un punto mas fuerte); sin el, los lados verticales son mas
 * cortos y el borde queda uniforme. Usa el color ya puesto en `g`.
 */
export function frameRect(g: G, x: number, y: number, w: number, h: number, thick = 1, overlap = true): void {
  const inner = overlap ? 0 : thick;
  g.fillRect(x, y, w, thick);
  g.fillRect(x, y + h - thick, w, thick);
  g.fillRect(x, y + inner, thick, h - 2 * inner);
  g.fillRect(x + w - thick, y + inner, thick, h - 2 * inner);
}
