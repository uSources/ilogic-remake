import type Phaser from 'phaser';
import { ATLAS, hasImage } from '../atlas';
import type { Pos } from '../core/types';
import { TILE } from '../layout';
import { fxRect, fxText, FX_TEXT, sleep, STEPPED, tween, type FxHost } from './fxKit';
import { tileCenter } from './map/geometry';
import { PAL, PAL_MAP } from './palette';
import { cornerBrackets, frameRect } from './pixelDraw';

/**
 * Efectos "pixel": cuadraditos que saltan, textos que suben a saltos y parpadeos.
 * Todo en coordenadas de mundo (1 unidad = 1 pixel del dibujo original) y con
 * movimientos por pasos, para que encajen con los graficos.
 * Las piezas comunes (esperas, tweens, cuadraditos, textos) estan en ui/fxKit.ts.
 */

// Se siguen exportando desde aqui: las escenas y src/debug.ts los importan de ui/fx.
export { reducedMotion, setFrozen } from './motion';

export const center = tileCenter;

/** Estallido: tamaño de los cuadraditos y duracion por defecto. */
const BURST_SIZE = 4;
const BURST_MS = 420;
/** Texto que sube: cuanto sube y cuanto tarda en subir y en apagarse. */
const FLOAT_RISE = 18;
const FLOAT_RISE_MS = 520;
const FLOAT_FADE_MS = 200;
/** Destello y mira de una casilla: pasos, ms por paso y pixeles que se abre por paso. */
const FLASH_STEPS = 4;
const FLASH_STEP_MS = 60;
const FLASH_SPREAD = 3;
/** Empujon del ataque: pixeles y ms. */
const LUNGE_PX = 4;
const LUNGE_MS = 90;
/** Largo de las esquinas de la mira. */
const TARGET_CORNER = 8;

/** Estallido de cuadraditos desde un punto. */
export function burst(
  scene: Phaser.Scene,
  view: FxHost,
  at: { x: number; y: number },
  opts: { colors: number[]; count: number; radius: number; size?: number; duration?: number },
): Promise<void> {
  const size = opts.size ?? BURST_SIZE;
  const duration = opts.duration ?? BURST_MS;
  const jobs: Promise<void>[] = [];
  for (let i = 0; i < opts.count; i++) {
    const a = (i / opts.count) * Math.PI * 2 + Math.random() * 0.6;
    const r = opts.radius * (0.55 + Math.random() * 0.45);
    const color = opts.colors[i % opts.colors.length]!;
    const s = Math.random() < 0.3 ? size + 1 : size;
    const sq = fxRect(scene, view, at.x, at.y, s, s, color);
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
  view: FxHost,
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
    await sleep(scene, opts.frameMs);
    img.setFrame(`ui/anim_${name}_${i}`);
  }
  await sleep(scene, opts.frameMs);
  img.destroy();
}

/** Texto que sube a saltos y desaparece (daño, curacion, captura...). */
export function floatText(
  scene: Phaser.Scene,
  view: FxHost,
  at: { x: number; y: number },
  text: string,
  color: string,
  delay = 0,
): Promise<void> {
  const t = fxText(scene, view, Math.round(at.x), Math.round(at.y), text, color, FX_TEXT.float).setAlpha(0);
  return tween(scene, { targets: t, alpha: 1, duration: 1, delay })
    .then(() => tween(scene, { targets: t, y: Math.round(at.y) - FLOAT_RISE, duration: FLOAT_RISE_MS, ...STEPPED }))
    .then(() => tween(scene, { targets: t, alpha: 0, duration: FLOAT_FADE_MS, ...STEPPED }))
    .then(() => t.destroy());
}

/** Parpadeo (visible/invisible) un numero de veces. */
export async function blink(scene: Phaser.Scene, obj: Phaser.GameObjects.Components.Visible, times: number, ms = 70): Promise<void> {
  for (let i = 0; i < times * 2; i++) {
    obj.setVisible(i % 2 === 0);
    await sleep(scene, ms);
  }
  obj.setVisible(true);
}

/** Destello cuadrado de una casilla (marco que se abre). */
export function tileFlash(scene: Phaser.Scene, view: FxHost, p: Pos, color: number): Promise<void> {
  const g = scene.add.graphics();
  view.addFx(g);
  let i = 0;
  return new Promise((resolve) => {
    const ev = scene.time.addEvent({
      delay: FLASH_STEP_MS,
      repeat: FLASH_STEPS,
      callback: () => {
        g.clear();
        if (i < FLASH_STEPS) {
          const d = i * FLASH_SPREAD;
          g.fillStyle(color, 1 - i / FLASH_STEPS);
          const w = TILE + 2 * d;
          frameRect(g, p.x * TILE - d, p.y * TILE - d, w, w, 2);
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
  obj.x = ox + Math.round((toward.dx / len) * LUNGE_PX);
  obj.y = oy + Math.round((toward.dy / len) * LUNGE_PX);
  await sleep(scene, LUNGE_MS);
  obj.x = ox;
  obj.y = oy;
}

/**
 * Disparo de una casilla a otra, para que se vea quien ataca a quien. Cuerpo a cuerpo: una rafaga
 * recta de cuadraditos. A distancia: un proyectil en parabola que deja estela. `ms` = duracion.
 */
export async function shot(scene: Phaser.Scene, view: FxHost, from: Pos, to: Pos, color: number, ms = 260): Promise<void> {
  const a = center(from),
    b = center(to);
  const dist = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
  const ranged = dist > 1;
  const steps = Math.max(4, Math.min(12, dist * 3));
  const lift = ranged ? Math.min(48, 10 + dist * 8) : 0;
  const head = fxRect(scene, view, a.x, a.y, ranged ? 6 : 4, ranged ? 6 : 4, PAL.white);
  const trail: Phaser.GameObjects.Rectangle[] = [];
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    const x = Math.round(a.x + (b.x - a.x) * k);
    const y = Math.round(a.y + (b.y - a.y) * k - lift * 4 * k * (1 - k));
    head.setPosition(x, y);
    const dot = fxRect(scene, view, x, y, ranged ? 4 : 3, ranged ? 4 : 3, color).setAlpha(0.9);
    trail.push(dot);
    // La estela se apaga por detras.
    trail.forEach((d, j) => d.setAlpha(Math.max(0, 0.9 - (trail.length - 1 - j) * 0.22)));
    await sleep(scene, ms / steps);
  }
  head.destroy();
  trail.forEach((d) => d.destroy());
}

/** Mira que se cierra sobre una casilla (esquinas): marca el objetivo antes del disparo. */
export async function targetMark(scene: Phaser.Scene, view: FxHost, p: Pos, color: number, ms = 240): Promise<void> {
  const g = scene.add.graphics();
  view.addFx(g);
  for (let i = 0; i <= FLASH_STEPS; i++) {
    g.clear();
    const d = (FLASH_STEPS - i) * FLASH_SPREAD;
    const w = TILE + 2 * d;
    g.fillStyle(color, 1);
    cornerBrackets(g, p.x * TILE - d, p.y * TILE - d, w, w, TARGET_CORNER, 2);
    await sleep(scene, ms / FLASH_STEPS);
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
  view: FxHost,
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
    g.fillStyle(PAL.white, 1);
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
  fire: [PAL.gold, PAL_MAP.orange, PAL.red, PAL.white],
  smoke: [PAL_MAP.smoke, PAL_MAP.smokeDark, PAL_MAP.smokeLight],
  gold: [PAL.gold, PAL_MAP.paleGold, PAL_MAP.amber],
  heal: [PAL.green, 0xa8f5b5],
  white: [PAL.white, 0xcfe8ff],
};
