import type Phaser from 'phaser';
import { ATLAS, hasImage } from '../atlas';
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

/** Fotogramas de una animacion dibujada (ui/anim_<name>_<n> del atlas); 0 si no esta. */
const animFrames = new Map<string, number>();
export function animFrameCount(scene: Phaser.Scene, name: string): number {
  let n = animFrames.get(name);
  if (n === undefined) {
    n = 0;
    while (hasImage(scene.textures, `ui/anim_${name}_${n}`)) n++;
    animFrames.set(name, n);
  }
  return n;
}

/**
 * [CAMBIO] Reproduce una animacion dibujada (Retro Diffusion) centrada en `at`, un fotograma cada
 * `frameMs`, y la quita al acabar. Si no esta en el atlas, no hace nada (el que llama pone otra cosa).
 */
export async function playAnim(
  scene: Phaser.Scene,
  view: MapView,
  at: { x: number; y: number },
  name: string,
  opts: { frameMs: number; scale?: number },
): Promise<void> {
  const n = animFrameCount(scene, name);
  if (!n) return;
  const img = scene.add.image(Math.round(at.x), Math.round(at.y), ATLAS, `ui/anim_${name}_0`).setOrigin(0.5);
  if (opts.scale) img.setScale(opts.scale);
  view.addFx(img);
  for (let i = 1; i < n; i++) {
    await new Promise<void>((r) => scene.time.delayedCall(opts.frameMs, r));
    img.setFrame(`ui/anim_${name}_${i}`);
  }
  await new Promise<void>((r) => scene.time.delayedCall(opts.frameMs, r));
  img.destroy();
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

const sleep = (scene: Phaser.Scene, ms: number) => new Promise<void>((r) => scene.time.delayedCall(ms, r));

/**
 * Disparo de una casilla a otra, para que se vea quien ataca a quien. Cuerpo a cuerpo: una rafaga
 * recta de cuadraditos. A distancia: un proyectil en parabola que deja estela. `ms` = duracion.
 */
export async function shot(scene: Phaser.Scene, view: MapView, from: Pos, to: Pos, color: number, ms = 260): Promise<void> {
  const a = center(from),
    b = center(to);
  const dist = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
  const ranged = dist > 1;
  const steps = Math.max(4, Math.min(12, dist * 3));
  const lift = ranged ? Math.min(48, 10 + dist * 8) : 0;
  const head = scene.add.rectangle(a.x, a.y, ranged ? 6 : 4, ranged ? 6 : 4, 0xffffff).setOrigin(0.5);
  view.addFx(head);
  const trail: Phaser.GameObjects.Rectangle[] = [];
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    const x = Math.round(a.x + (b.x - a.x) * k);
    const y = Math.round(a.y + (b.y - a.y) * k - lift * 4 * k * (1 - k));
    head.setPosition(x, y);
    const dot = scene.add
      .rectangle(x, y, ranged ? 4 : 3, ranged ? 4 : 3, color)
      .setOrigin(0.5)
      .setAlpha(0.9);
    view.addFx(dot);
    trail.push(dot);
    // La estela se apaga por detras.
    trail.forEach((d, j) => d.setAlpha(Math.max(0, 0.9 - (trail.length - 1 - j) * 0.22)));
    await sleep(scene, ms / steps);
  }
  head.destroy();
  trail.forEach((d) => d.destroy());
}

/** Mira que se cierra sobre una casilla (esquinas): marca el objetivo antes del disparo. */
export async function targetMark(scene: Phaser.Scene, view: MapView, p: Pos, color: number, ms = 240): Promise<void> {
  const g = scene.add.graphics();
  view.addFx(g);
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    g.clear();
    const d = (steps - i) * 3;
    const x = p.x * TILE - d,
      y = p.y * TILE - d,
      w = TILE + 2 * d,
      l = 8;
    g.fillStyle(color, 1);
    for (const [cx, cy, sx, sy] of [
      [x, y, 1, 1],
      [x + w, y, -1, 1],
      [x, y + w, 1, -1],
      [x + w, y + w, -1, -1],
    ] as const) {
      g.fillRect(sx > 0 ? cx : cx - l, sy > 0 ? cy : cy - 2, l, 2);
      g.fillRect(sx > 0 ? cx : cx - 2, sy > 0 ? cy : cy - l, 2, l);
    }
    await sleep(scene, ms / steps);
  }
  // Se queda puesta un momento y se apaga.
  await sleep(scene, ms / 2);
  g.destroy();
}

/**
 * Barra de vida encima de una casilla que baja de `before` a `after` (0..100) a saltos.
 * Lo perdido se ve en blanco y luego se vacia; al final la barra se queda un momento y se va.
 */
export async function lifeBar(
  scene: Phaser.Scene,
  view: MapView,
  p: Pos,
  before: number,
  after: number,
  color: number,
  hold = 380,
): Promise<void> {
  const W = TILE - 4,
    H = 5;
  const x = p.x * TILE + 2,
    y = p.y * TILE - 8;
  const g = scene.add.graphics();
  view.addFx(g);
  const draw = (life: number, lost: number) => {
    g.clear();
    g.fillStyle(PAL.ink, 1);
    g.fillRect(x - 1, y - 1, W + 2, H + 2);
    const lw = Math.round((W * Math.max(0, life)) / 100);
    const pw = Math.round((W * Math.max(0, lost)) / 100);
    g.fillStyle(color, 1);
    g.fillRect(x, y, lw, H);
    g.fillStyle(0xffffff, 1);
    g.fillRect(x + lw, y, Math.max(0, pw - lw), H);
  };
  draw(before, before);
  await sleep(scene, 120);
  draw(after, before);
  await sleep(scene, 160);
  const steps = 5;
  for (let i = 1; i <= steps; i++) {
    draw(after, before + ((after - before) * i) / steps);
    await sleep(scene, 50);
  }
  await sleep(scene, hold);
  g.destroy();
}

export const COLORS = {
  fire: [PAL.gold, 0xff8a3d, PAL.red, 0xffffff],
  smoke: [0x5b6478, 0x3a4256, 0x8a93a8],
  gold: [PAL.gold, 0xfff1a8, 0xffb43a],
  heal: [PAL.green, 0xa8f5b5],
  white: [0xffffff, 0xcfe8ff],
};
