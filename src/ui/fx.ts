import type Phaser from 'phaser';
import { ATLAS, hasImage } from '../atlas';
import type { Pos } from '../core/model';
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
  options: { colors: number[]; count: number; radius: number; size?: number; duration?: number },
): Promise<void> {
  const size = options.size ?? BURST_SIZE;
  const duration = options.duration ?? BURST_MS;
  const jobs: Promise<void>[] = [];
  for (let i = 0; i < options.count; i++) {
    // Repartidos alrededor, con algo de azar en el angulo, la distancia y el tamaño.
    const angle = (i / options.count) * Math.PI * 2 + Math.random() * 0.6;
    const distance = options.radius * (0.55 + Math.random() * 0.45);
    const color = options.colors[i % options.colors.length]!;
    const squareSize = Math.random() < 0.3 ? size + 1 : size;
    const square = fxRect(scene, view, at.x, at.y, squareSize, squareSize, color);
    jobs.push(
      tween(scene, {
        targets: square,
        x: Math.round(at.x + Math.cos(angle) * distance),
        y: Math.round(at.y + Math.sin(angle) * distance),
        alpha: { from: 1, to: 0.15 },
        duration,
        ...STEPPED,
      }).then(() => square.destroy()),
    );
  }
  return Promise.all(jobs).then(() => undefined);
}

/** Fotogramas de una animacion dibujada (ui/anim_<name>_<n> del atlas); 0 si no esta. */
const animFrames = new Map<string, number>();
export function animFrameCount(scene: Phaser.Scene, name: string): number {
  const known = animFrames.get(name);
  if (known !== undefined) return known;
  let count = 0;
  while (hasImage(scene.textures, `ui/anim_${name}_${count}`)) count++;
  animFrames.set(name, count);
  return count;
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
  options: { frameMs: number; scale?: number },
): Promise<void> {
  const frames = animFrameCount(scene, name);
  if (!frames) return;
  const image = scene.add.image(Math.round(at.x), Math.round(at.y), ATLAS, `ui/anim_${name}_0`).setOrigin(0.5);
  if (options.scale) image.setScale(options.scale);
  view.addFx(image);
  for (let i = 1; i < frames; i++) {
    await sleep(scene, options.frameMs);
    image.setFrame(`ui/anim_${name}_${i}`);
  }
  await sleep(scene, options.frameMs);
  image.destroy();
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
  const label = fxText(scene, view, Math.round(at.x), Math.round(at.y), text, color, FX_TEXT.float).setAlpha(0);
  // Aparece de golpe tras `delay` (un tween de 1 ms, para contar el retraso con el reloj de la escena).
  return tween(scene, { targets: label, alpha: 1, duration: 1, delay })
    .then(() => tween(scene, { targets: label, y: Math.round(at.y) - FLOAT_RISE, duration: FLOAT_RISE_MS, ...STEPPED }))
    .then(() => tween(scene, { targets: label, alpha: 0, duration: FLOAT_FADE_MS, ...STEPPED }))
    .then(() => label.destroy());
}

/** Parpadeo (visible/invisible) un numero de veces. */
export async function blink(scene: Phaser.Scene, target: Phaser.GameObjects.Components.Visible, times: number, ms = 70): Promise<void> {
  for (let i = 0; i < times * 2; i++) {
    target.setVisible(i % 2 === 0);
    await sleep(scene, ms);
  }
  target.setVisible(true);
}

/** Destello cuadrado de una casilla (marco que se abre). */
export function tileFlash(scene: Phaser.Scene, view: FxHost, pos: Pos, color: number): Promise<void> {
  const graphics = scene.add.graphics();
  view.addFx(graphics);
  let step = 0;
  // Un paso mas que FLASH_STEPS: el ultimo solo borra el marco y acaba.
  return new Promise((resolve) => {
    const timer = scene.time.addEvent({
      delay: FLASH_STEP_MS,
      repeat: FLASH_STEPS,
      callback: () => {
        graphics.clear();
        if (step < FLASH_STEPS) {
          const spread = step * FLASH_SPREAD;
          graphics.fillStyle(color, 1 - step / FLASH_STEPS);
          const size = TILE + 2 * spread;
          frameRect(graphics, pos.x * TILE - spread, pos.y * TILE - spread, size, size, 2);
        }
        step++;
        if (timer.getRepeatCount() === 0) {
          graphics.destroy();
          resolve();
        }
      },
    });
  });
}

/** Pequeño empujon de una imagen hacia un punto y vuelta (ataque). */
export async function lunge(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.Components.Transform,
  toward: { dx: number; dy: number },
): Promise<void> {
  const length = Math.hypot(toward.dx, toward.dy) || 1;
  const restX = target.x;
  const restY = target.y;
  target.x = restX + Math.round((toward.dx / length) * LUNGE_PX);
  target.y = restY + Math.round((toward.dy / length) * LUNGE_PX);
  await sleep(scene, LUNGE_MS);
  target.x = restX;
  target.y = restY;
}

/**
 * Disparo de una casilla a otra, para que se vea quien ataca a quien. Cuerpo a cuerpo: una rafaga
 * recta de cuadraditos. A distancia: un proyectil en parabola que deja estela. `ms` = duracion.
 */
export async function shot(scene: Phaser.Scene, view: FxHost, from: Pos, to: Pos, color: number, ms = 260): Promise<void> {
  const start = center(from);
  const end = center(to);
  const distance = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
  const isRanged = distance > 1;
  const steps = Math.max(4, Math.min(12, distance * 3));
  const lift = isRanged ? Math.min(48, 10 + distance * 8) : 0;
  const headSize = isRanged ? 6 : 4;
  const dotSize = isRanged ? 4 : 3;
  const head = fxRect(scene, view, start.x, start.y, headSize, headSize, PAL.white);
  const trail: Phaser.GameObjects.Rectangle[] = [];
  for (let i = 1; i <= steps; i++) {
    const progress = i / steps;
    const x = Math.round(start.x + (end.x - start.x) * progress);
    const y = Math.round(start.y + (end.y - start.y) * progress - lift * 4 * progress * (1 - progress));
    head.setPosition(x, y);
    const dot = fxRect(scene, view, x, y, dotSize, dotSize, color).setAlpha(0.9);
    trail.push(dot);
    // La estela se apaga por detras.
    trail.forEach((trailDot, index) => trailDot.setAlpha(Math.max(0, 0.9 - (trail.length - 1 - index) * 0.22)));
    await sleep(scene, ms / steps);
  }
  head.destroy();
  trail.forEach((trailDot) => trailDot.destroy());
}

/** Mira que se cierra sobre una casilla (esquinas): marca el objetivo antes del disparo. */
export async function targetMark(scene: Phaser.Scene, view: FxHost, pos: Pos, color: number, ms = 240): Promise<void> {
  const graphics = scene.add.graphics();
  view.addFx(graphics);
  for (let i = 0; i <= FLASH_STEPS; i++) {
    graphics.clear();
    const spread = (FLASH_STEPS - i) * FLASH_SPREAD;
    const size = TILE + 2 * spread;
    graphics.fillStyle(color, 1);
    cornerBrackets(graphics, pos.x * TILE - spread, pos.y * TILE - spread, size, size, TARGET_CORNER, 2);
    await sleep(scene, ms / FLASH_STEPS);
  }
  // Se queda puesta un momento y se apaga.
  await sleep(scene, ms / 2);
  graphics.destroy();
}

/**
 * Barra de vida encima de una casilla que baja de `before` a `after` (0..100) a saltos.
 * Lo perdido se ve en blanco y luego se vacia; al final la barra se queda un momento y se va.
 */
export async function lifeBar(
  scene: Phaser.Scene,
  view: FxHost,
  pos: Pos,
  before: number,
  after: number,
  color: number,
  hold = 380,
): Promise<void> {
  const width = TILE - 4;
  const height = 5;
  const x = pos.x * TILE + 2;
  const y = pos.y * TILE - 8;
  const graphics = scene.add.graphics();
  view.addFx(graphics);
  /** `life`: lo que queda (color de su lado); `fading`: hasta donde llega aun lo perdido (blanco). */
  const draw = (life: number, fading: number) => {
    graphics.clear();
    graphics.fillStyle(PAL.ink, 1);
    graphics.fillRect(x - 1, y - 1, width + 2, height + 2);
    const lifeWidth = Math.round((width * Math.max(0, life)) / 100);
    const fadingWidth = Math.round((width * Math.max(0, fading)) / 100);
    graphics.fillStyle(color, 1);
    graphics.fillRect(x, y, lifeWidth, height);
    graphics.fillStyle(PAL.white, 1);
    graphics.fillRect(x + lifeWidth, y, Math.max(0, fadingWidth - lifeWidth), height);
  };
  draw(before, before);
  await sleep(scene, 120);
  draw(after, before);
  await sleep(scene, 160);
  const drainSteps = 5;
  for (let i = 1; i <= drainSteps; i++) {
    draw(after, before + ((after - before) * i) / drainSteps);
    await sleep(scene, 50);
  }
  await sleep(scene, hold);
  graphics.destroy();
}

export const COLORS = {
  fire: [PAL.gold, PAL_MAP.orange, PAL.red, PAL.white],
  smoke: [PAL_MAP.smoke, PAL_MAP.smokeDark, PAL_MAP.smokeLight],
  gold: [PAL.gold, PAL_MAP.paleGold, PAL_MAP.amber],
  heal: [PAL.green, 0xa8f5b5],
  white: [PAL.white, 0xcfe8ff],
};
