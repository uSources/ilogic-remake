import type Phaser from 'phaser';
import { PAL_CSS } from './palette';

/**
 * Piezas comunes de los efectos (ui/fx.ts, ui/combatFx.ts) y de las capas del mapa: esperas,
 * tweens que se pueden esperar, cuadraditos y textos en el estilo pixel del juego.
 */

/** Donde se ponen los objetos temporales de un efecto (MapView: por encima de las unidades). */
export interface FxHost {
  addFx(obj: Phaser.GameObjects.GameObject): void;
}

/** Movimiento por pasos (6 saltos) en vez de suave: encaja con el pixel art. */
export const STEPPED = { ease: 'Stepped', easeParams: [6] };

/** Espera con el reloj de la escena (se para con ella y respeta su velocidad). */
export const sleep = (scene: Phaser.Scene, ms: number): Promise<void> =>
  new Promise<void>((r) => scene.time.delayedCall(Math.max(0, ms), r));

/** Tween que se puede esperar con `await`. */
export function tween(scene: Phaser.Scene, cfg: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
  return new Promise((resolve) => scene.tweens.add({ ...cfg, onComplete: () => resolve() }));
}

/** Cuadradito centrado en (x, y), redondeado al pixel, puesto en la capa de efectos. */
export function fxRect(
  scene: Phaser.Scene,
  host: FxHost,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
  alpha = 1,
): Phaser.GameObjects.Rectangle {
  const r = scene.add.rectangle(Math.round(x), Math.round(y), w, h, color, alpha).setOrigin(0.5);
  host.addFx(r);
  return r;
}

/** Letra de los textos del mapa (la del juego, con reserva). */
export const FX_FONT = 'Ilogic, Silkscreen, monospace';

/** Tamaños de los textos del mapa: letra y borde oscuro, en pixeles del dibujo. */
export const FX_TEXT = {
  /** Daño, curacion, captura... que sube (fx.floatText). */
  float: { size: 16, stroke: 4 },
  /** Numero de daño que salta (combatFx.popNumber). */
  pop: { size: 20, stroke: 5 },
  /** Etiqueta pequeña sobre una unidad (combatFx.tag). */
  tag: { size: 10, stroke: 3 },
} as const;

/** Texto con borde oscuro, con el origen abajo en el centro, puesto en la capa de efectos. */
export function fxText(
  scene: Phaser.Scene,
  host: FxHost,
  x: number,
  y: number,
  text: string,
  color: string,
  style: { size: number; stroke: number },
): Phaser.GameObjects.Text {
  const t = scene.add
    .text(x, y, text, {
      fontFamily: FX_FONT,
      fontSize: `${style.size}px`,
      color,
      stroke: PAL_CSS.ink,
      strokeThickness: style.stroke,
    })
    .setOrigin(0.5, 1);
  host.addFx(t);
  return t;
}
