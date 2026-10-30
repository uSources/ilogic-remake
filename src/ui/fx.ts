import type Phaser from 'phaser';
import { settings } from '../settings';
import type { Pos } from '../core/types';
import { TILE } from '../layout';
import type { MapView } from './mapView';
import { PAL, PAL_CSS } from './palette';

/**
 * Efectos "pixel": cuadraditos que saltan, textos que suben a saltos y parpadeos.
 * Todo en coordenadas de mundo (1 unidad = 1 pixel del dibujo original) y con
 * movimientos por pasos, para que encajen con los graficos.
 */

const STEPPED = { ease: 'Stepped', easeParams: [6] };

/**
 * Menos movimiento: solo si se pide en Opciones. [CAMBIO] Antes tambien se hacia caso a la
 * preferencia del sistema, pero en Windows con "efectos de animacion" apagados el agua, las nubes
 * y el fondo del menu se quedaban quietos sin que el jugador supiera por que.
 */
export const reducedMotion = (): boolean => settings.reduceMotion || frozen;

/** Todo quieto y sin azar visual (capturas de referencia, src/debug.ts). No se guarda. */
let frozen = false;
export function setFrozen(on: boolean): void {
  frozen = on;
}

function tween(scene: Phaser.Scene, cfg: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
  return new Promise((resolve) => scene.tweens.add({ ...cfg, onComplete: () => resolve() }));
}

export const center = (p: Pos) => ({ x: p.x * TILE + TILE / 2, y: p.y * TILE + TILE / 2 });

/** Estallido de cuadraditos desde un punto. */
export function burst(
  scene: Phaser.Scene,
  view: MapView,
  at: { x: number; y: number },
  opts: { colors: number[]; count: number; radius: number; size?: number; duration?: number },
): Promise<void> {
  const size = opts.size ?? 4;
  const duration = opts.duration ?? 420;
  const jobs: Promise<void>[] = [];
  for (let i = 0; i < opts.count; i++) {
    const a = (i / opts.count) * Math.PI * 2 + Math.random() * 0.6;
    const r = opts.radius * (0.55 + Math.random() * 0.45);
    const color = opts.colors[i % opts.colors.length]!;
    const s = Math.random() < 0.3 ? size + 1 : size;
    const sq = scene.add.rectangle(Math.round(at.x), Math.round(at.y), s, s, color).setOrigin(0.5);
    view.addFx(sq);
    jobs.push(
      tween(scene, {
        targets: sq,
        x: Math.round(at.x + Math.cos(a) * r),
        y: Math.round(at.y + Math.sin(a) * r),
        alpha: { from: 1, to: 0.15 },
        duration,
        ...STEPPED,
      }).then(() => sq.destroy()),
    );
  }
  return Promise.all(jobs).then(() => undefined);
}

/** Texto que sube a saltos y desaparece (daño, curacion, captura...). */
export function floatText(
  scene: Phaser.Scene,
  view: MapView,
  at: { x: number; y: number },
  text: string,
  color: string,
  delay = 0,
): Promise<void> {
  const t = scene.add
    .text(Math.round(at.x), Math.round(at.y), text, {
      fontFamily: 'Ilogic, Silkscreen, monospace',
      fontSize: '16px',
      color,
      stroke: PAL_CSS.ink,
      strokeThickness: 4,
    })
    .setOrigin(0.5, 1)
    .setAlpha(0);
  view.addFx(t);
  return tween(scene, { targets: t, alpha: 1, duration: 1, delay })
    .then(() => tween(scene, { targets: t, y: Math.round(at.y) - 18, duration: 520, ...STEPPED }))
    .then(() => tween(scene, { targets: t, alpha: 0, duration: 200, ...STEPPED }))
    .then(() => t.destroy());
}

/** Parpadeo (visible/invisible) un numero de veces. */
export async function blink(scene: Phaser.Scene, obj: Phaser.GameObjects.Components.Visible, times: number, ms = 70): Promise<void> {
  for (let i = 0; i < times * 2; i++) {
    obj.setVisible(i % 2 === 0);
    await new Promise((r) => scene.time.delayedCall(ms, r));
  }
  obj.setVisible(true);
}

/** Destello cuadrado de una casilla (marco que se abre). */
export function tileFlash(scene: Phaser.Scene, view: MapView, p: Pos, color: number): Promise<void> {
  const g = scene.add.graphics();
  view.addFx(g);
  const steps = 4;
  let i = 0;
  return new Promise((resolve) => {
    const ev = scene.time.addEvent({
      delay: 60,
      repeat: steps,
      callback: () => {
        g.clear();
        if (i < steps) {
          const d = i * 3;
          g.fillStyle(color, 1 - i / steps);
          const x = p.x * TILE - d,
            y = p.y * TILE - d,
            w = TILE + 2 * d;
          g.fillRect(x, y, w, 2);
          g.fillRect(x, y + w - 2, w, 2);
          g.fillRect(x, y, 2, w);
          g.fillRect(x + w - 2, y, 2, w);
        }
        i++;
        if (ev.getRepeatCount() === 0) {
          g.destroy();
          resolve();
        }
      },
    });
  });
}

/** Pequeño empujon de una imagen hacia un punto y vuelta (ataque). */
export async function lunge(
  scene: Phaser.Scene,
  obj: Phaser.GameObjects.Components.Transform,
  toward: { dx: number; dy: number },
): Promise<void> {
  const len = Math.hypot(toward.dx, toward.dy) || 1;
  const ox = obj.x,
    oy = obj.y;
  obj.x = ox + Math.round((toward.dx / len) * 4);
  obj.y = oy + Math.round((toward.dy / len) * 4);
  await new Promise((r) => scene.time.delayedCall(90, r));
  obj.x = ox;
  obj.y = oy;
}

export const COLORS = {
  fire: [PAL.gold, 0xff8a3d, PAL.red, 0xffffff],
  smoke: [0x5b6478, 0x3a4256, 0x8a93a8],
  gold: [PAL.gold, 0xfff1a8, 0xffb43a],
  heal: [PAL.green, 0xa8f5b5],
  white: [0xffffff, 0xcfe8ff],
};
