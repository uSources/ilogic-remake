import Phaser from 'phaser';

/** Estilo visual de la interfaz moderna. */
export const FONT = "'Pixelify Sans', 'Trebuchet MS', sans-serif";

export const C = {
  panel: 0x121821,
  panelAlpha: 0.9,
  panelLight: 0x1c2532,
  border: 0x35445a,
  text: '#e8edf2',
  muted: '#8d9aad',
  dim: '#5b6677',
  blue: 0x3fa3ff,
  blueText: '#5fb6ff',
  red: 0xe5484d,
  redText: '#ff6b6f',
  gold: '#f5c542',
  green: 0x46c46e,
  greenText: '#5ddb85',
  hover: 0x2a3a52,
  selected: 0x2f6fb5,
};

export function textStyle(size: number, color: string = C.text, bold = false): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT,
    fontSize: `${size}px`,
    color,
    fontStyle: bold ? 'bold' : 'normal',
    resolution: 2,
  };
}

/** Rectangulo redondeado con borde y sombra, como fondo de paneles. */
export function panelBg(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { fill?: number; alpha?: number; border?: number; radius?: number; shadow?: boolean } = {},
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  const r = opts.radius ?? 8;
  if (opts.shadow !== false) {
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(x + 3, y + 4, w, h, r);
  }
  g.fillStyle(opts.fill ?? C.panel, opts.alpha ?? C.panelAlpha);
  g.fillRoundedRect(x, y, w, h, r);
  g.lineStyle(1, opts.border ?? C.border, 1);
  g.strokeRoundedRect(x + 0.5, y + 0.5, w - 1, h - 1, r);
  return g;
}

/** Barra de progreso (vida, combustible...). */
export function bar(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  frac: number,
  color: number,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.5);
  g.fillRoundedRect(x, y, w, h, h / 2);
  const fw = Math.max(0, Math.min(1, frac)) * w;
  if (fw > 0) {
    g.fillStyle(color, 1);
    g.fillRoundedRect(x, y, Math.max(fw, h), h, h / 2);
  }
  return g;
}

export function lifeColor(frac: number): number {
  return frac > 0.6 ? C.green : frac > 0.3 ? 0xf5c542 : C.red;
}
