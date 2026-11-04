/**
 * [CAMBIO] Animaciones de combate rediseñadas: retroceso y fogonazo al disparar, proyectil segun el
 * tipo de unidad, impacto con destello y explosion, numero de daño que salta y restos al caer.
 * Mismo estilo pixel que ui/fx.ts (cuadraditos y saltos), en coordenadas de mundo; las piezas
 * comunes (esperas, cuadraditos, textos) estan en ui/fxKit.ts.
 *
 * Las duraciones se escriben a velocidad normal y las ajusta el `FxTimeline` que se pasa (velocidad
 * de las animaciones de las Opciones); GameScene no llama a nada de esto si hay que saltarse las
 * animaciones.
 */
import type Phaser from 'phaser';
import { Movement, MoveType, UNIT } from '../core/data';
import type { Pos } from '../core/model';
import { TILE } from '../layout';
import { animFrameCount, burst, center, COLORS, playAnim, reducedMotion } from './fx';
import { fxRect as rect, fxText, FX_TEXT, sleep, type FxHost, type FxTimeline } from './fxKit';
import type { Facing } from './mapView';
import { PAL, PAL_MAP } from './palette';

/** Lado al que tiene que mirar quien esta en `from` para disparar a `to` (null si estan en la misma columna). */
export const facingToward = (from: Pos, to: Pos): Facing | null => (to.x > from.x ? 'right' : to.x < from.x ? 'left' : null);

/**
 * Como dispara cada unidad, sacado de sus datos (no de su nombre):
 * - arc: a distancia (artilleria, mortero): proyectil en parabola con sombra.
 * - missile: a mucha distancia (lanzamisiles): misil con estela de humo.
 * - bomb: un avion contra tierra: bombas que caen.
 * - tracer: un avion contra otro: rafagas.
 * - bullets: infanteria: rafaga de balas.
 * - shell: vehiculos: un cañonazo recto.
 */
export type ShotKind = 'arc' | 'missile' | 'bomb' | 'tracer' | 'bullets' | 'shell';

/** Alcance desde el que un arma a distancia lanza misiles en vez de proyectiles en parabola. */
const MISSILE_RANGE = 6;

export function shotKind(attackerType: number, defenderType: number): ShotKind {
  const isRangedWeapon = UNIT.minalc[attackerType]! > 0;
  if (isRangedWeapon) return UNIT.alcance[attackerType]! >= MISSILE_RANGE ? 'missile' : 'arc';
  const movement = Movement.of(attackerType);
  if (movement === MoveType.AIR) return Movement.of(defenderType) === MoveType.AIR ? 'tracer' : 'bomb';
  return movement === MoveType.FOOT ? 'bullets' : 'shell';
}

/** Un punto del mundo (pixeles del dibujo), no una casilla. */
type Point = { x: number; y: number };

/** Punta del arma: delante de la unidad, a media altura. */
function muzzle(from: Pos, to: Pos): Point {
  const c = center(from);
  const sideways = Math.sign(to.x - from.x) || 0;
  const upDown = Math.sign(to.y - from.y) || 0;
  return { x: c.x + sideways * 13, y: c.y - 3 + upDown * 8 };
}

/** Retroceso al disparar: la unidad se echa hacia atras y vuelve (en dos saltos). */
export async function recoil(timeline: FxTimeline, sprite: Phaser.GameObjects.Container, from: Pos, to: Pos): Promise<void> {
  const pushX = -Math.sign(to.x - from.x) * 3;
  const pushY = -Math.sign(to.y - from.y) * 2;
  const restX = sprite.x;
  const restY = sprite.y;
  sprite.setPosition(restX + pushX, restY + pushY);
  await timeline.wait(70);
  sprite.setPosition(restX + Math.round(pushX / 2), restY + Math.round(pushY / 2));
  await timeline.wait(50);
  sprite.setPosition(restX, restY);
}

/** Fogonazo en la punta del arma: estrella de cuadraditos que se apaga en tres fotogramas. */
export async function muzzleFlash(timeline: FxTimeline, view: FxHost, from: Pos, to: Pos): Promise<void> {
  const scene = timeline.scene;
  const tip = muzzle(from, to);
  const core = rect(scene, view, tip.x, tip.y, 6, 6, PAL.white);
  const horizontalRay = rect(scene, view, tip.x, tip.y, 10, 2, PAL.gold);
  const verticalRay = rect(scene, view, tip.x, tip.y, 2, 10, PAL.gold);
  await timeline.wait(50);
  core.setFillStyle(PAL.gold);
  horizontalRay.setSize(6, 2);
  verticalRay.setSize(2, 6);
  await timeline.wait(50);
  [core, horizontalRay, verticalRay].forEach((part) => part.destroy());
}

/**
 * Lleva un cuadradito de `from` a `to` en `ms` (ya a la velocidad elegida), por pasos; `lift` =
 * altura de la parabola. Llama a `onStep` en cada paso con la posicion y lo recorrido (0..1).
 */
async function fly(
  scene: Phaser.Scene,
  obj: Phaser.GameObjects.Rectangle,
  from: Point,
  to: Point,
  ms: number,
  lift = 0,
  onStep?: (x: number, y: number, progress: number) => void,
): Promise<void> {
  const steps = Math.max(3, Math.round(ms / 30));
  for (let i = 1; i <= steps; i++) {
    const progress = i / steps;
    const x = from.x + (to.x - from.x) * progress;
    const y = from.y + (to.y - from.y) * progress - lift * 4 * progress * (1 - progress);
    obj.setPosition(Math.round(x), Math.round(y));
    onStep?.(x, y, progress);
    await sleep(scene, ms / steps);
  }
}

/** Lo que necesita cada tipo de disparo: de donde sale, a donde va y cuantas casillas hay. */
interface Shot {
  readonly timeline: FxTimeline;
  readonly view: FxHost;
  readonly from: Point;
  readonly to: Point;
  readonly distance: number;
}

/** Rafaga de balas trazadoras seguidas (5 los aviones, 3 la infanteria), un poco abiertas. */
async function shootBullets(shot: Shot, count: number): Promise<void> {
  const { timeline, view, from, to } = shot;
  const scene = timeline.scene;
  const jobs: Promise<void>[] = [];
  for (let i = 0; i < count; i++) {
    const bullet = rect(scene, view, from.x, from.y, 4, 2, i % 2 ? PAL.white : PAL.gold);
    const spread = { x: to.x + ((i % 3) - 1) * 3, y: to.y + ((i % 2) * 2 - 1) * 3 };
    const flight = () => fly(scene, bullet, from, spread, timeline.ms(110)).then(() => bullet.destroy());
    jobs.push(timeline.wait(i * 45).then(flight));
  }
  await Promise.all(jobs);
}

/** Cañonazo recto con una estela corta de 3 puntos. */
async function shootShell(shot: Shot): Promise<void> {
  const { timeline, view, from, to } = shot;
  const scene = timeline.scene;
  const shell = rect(scene, view, from.x, from.y, 5, 4, PAL.white);
  const trail: Phaser.GameObjects.Rectangle[] = [];
  await fly(scene, shell, from, to, timeline.ms(130), 0, (x, y) => {
    trail.push(rect(scene, view, x, y, 3, 2, PAL.gold, 0.8));
    if (trail.length > 3) trail.shift()!.destroy();
  });
  shell.destroy();
  trail.forEach((dot) => dot.destroy());
}

/** Parabola alta con una sombra en el suelo que avanza debajo. */
async function shootArc(shot: Shot): Promise<void> {
  const { timeline, view, from, to, distance } = shot;
  const scene = timeline.scene;
  const shell = rect(scene, view, from.x, from.y, 5, 5, PAL.white);
  const shadow = rect(scene, view, from.x, from.y + 10, 6, 2, PAL.ink, 0.35);
  const lift = Math.min(56, 18 + distance * 9);
  await fly(scene, shell, from, to, timeline.ms(260 + distance * 30), lift, (x, _y, progress) => {
    shadow.setPosition(Math.round(x), Math.round(from.y + 10 + (to.y + 10 - from.y - 10) * progress));
  });
  shell.destroy();
  shadow.destroy();
}

/** Misil en parabola baja que deja bocanadas de humo que se apagan. */
async function shootMissile(shot: Shot): Promise<void> {
  const { timeline, view, from, to, distance } = shot;
  const scene = timeline.scene;
  const missile = rect(scene, view, from.x, from.y, 6, 3, PAL.white);
  const lift = Math.min(36, 10 + distance * 4);
  await fly(scene, missile, from, to, timeline.ms(240 + distance * 25), lift, (x, y) => {
    const puff = rect(scene, view, x, y, 3, 3, PAL_MAP.smokeLight, 0.85);
    scene.tweens.add({ targets: puff, alpha: 0, duration: timeline.ms(380), onComplete: () => puff.destroy() });
  });
  missile.destroy();
}

/** Dos bombas que caen desde encima del objetivo, una detras de otra. */
async function dropBombs(shot: Shot): Promise<void> {
  const { timeline, view, to } = shot;
  const drops = [0, 1].map(async (i) => {
    await timeline.wait(i * 70);
    const top = { x: to.x + (i ? 5 : -5), y: to.y - 46 };
    const bomb = rect(timeline.scene, view, top.x, top.y, 4, 6, PAL.ink);
    await fly(timeline.scene, bomb, top, { x: top.x, y: to.y }, timeline.ms(170));
    bomb.destroy();
  });
  await Promise.all(drops);
}

/** El disparo de `from` a `to`: termina en el momento del impacto. */
export async function projectile(timeline: FxTimeline, view: FxHost, kind: ShotKind, from: Pos, to: Pos): Promise<void> {
  const shot: Shot = {
    timeline,
    view,
    from: muzzle(from, to),
    to: center(to),
    distance: Math.abs(to.x - from.x) + Math.abs(to.y - from.y),
  };
  switch (kind) {
    case 'bullets':
      return shootBullets(shot, 3);
    case 'tracer':
      return shootBullets(shot, 5);
    case 'shell':
      return shootShell(shot);
    case 'arc':
      return shootArc(shot);
    case 'missile':
      return shootMissile(shot);
    case 'bomb':
      return dropBombs(shot);
    default:
      return kind satisfies never;
  }
}

/** Modo de tinte FILL de Phaser 4 (Phaser.TintModes.FILL; aqui Phaser solo se importa como tipo). */
const TINT_FILL = 1;

/** Destello blanco de una unidad al recibir el golpe (su dibujo principal). */
export async function hitFlash(
  timeline: FxTimeline,
  sprite: Phaser.GameObjects.Container | Phaser.GameObjects.Image | null,
): Promise<void> {
  if (!sprite) return;
  const main = 'list' in sprite ? sprite.list.find((o): o is Phaser.GameObjects.Image => 'setTintFill' in o) : sprite;
  if (!main) return;
  main.setTint(PAL.white).setTintMode(TINT_FILL);
  await timeline.wait(70);
  main.clearTint();
}

/** Puntos del anillo de la explosion de cuadraditos. */
const RING_DOTS = 12;

/** Anillo de cuadraditos que se abre (la explosion si no hay una dibujada en el atlas). */
async function explosionRing(timeline: FxTimeline, view: FxHost, c: Point, killed: boolean): Promise<void> {
  const g = timeline.scene.add.graphics();
  view.addFx(g);
  const radii = killed ? [5, 10, 15, 19] : [4, 8, 12];
  for (const [i, radius] of radii.entries()) {
    g.clear();
    g.fillStyle(i === 0 ? PAL.white : i < 2 ? PAL.gold : PAL_MAP.orange, 1 - i / (radii.length + 1));
    for (let dot = 0; dot < RING_DOTS; dot++) {
      const angle = (dot / RING_DOTS) * Math.PI * 2;
      g.fillRect(Math.round(c.x + Math.cos(angle) * radius) - 2, Math.round(c.y + Math.sin(angle) * radius) - 2, 4, 4);
    }
    if (i === 0) g.fillRect(c.x - 5, c.y - 5, 10, 10);
    await timeline.wait(55);
  }
  g.destroy();
}

/** Explosion del impacto: la dibujada (ui/anim_boom_*) o un anillo de cuadraditos, y chispas. Mas grande si cae. */
export async function impact(timeline: FxTimeline, view: FxHost, at: Pos, killed: boolean): Promise<void> {
  const scene = timeline.scene;
  const c = center(at);
  if (!reducedMotion()) scene.cameras.main.shake(killed ? 200 : 100, killed ? 0.006 : 0.003);
  const isDrawn = animFrameCount(scene, 'boom') > 0;
  const sparks = isDrawn ? (killed ? 8 : 5) : killed ? 12 : 8;
  await Promise.all([
    isDrawn ? playAnim(scene, view, c, 'boom', { frameMs: timeline.ms(65) }) : explosionRing(timeline, view, c, killed),
    burst(scene, view, c, {
      colors: COLORS.fire,
      count: sparks,
      radius: killed ? 22 : 15,
      size: isDrawn ? 3 : 4,
      duration: timeline.ms(320),
    }),
  ]);
}

/** Numero que salta: aparece grande, se encoge a su tamaño, sube un poco y se va. No hay que esperarlo entero. */
export function popNumber(timeline: FxTimeline, view: FxHost, at: Pos, text: string, color: string): Promise<void> {
  const c = center(at);
  const label = fxText(timeline.scene, view, c.x, c.y - 16, text, color, FX_TEXT.pop).setScale(1.6);
  return (async () => {
    await timeline.wait(50);
    label.setScale(1.25);
    await timeline.wait(50);
    label.setScale(1);
    await timeline.wait(380);
    for (let i = 1; i <= 4; i++) {
      label.setY(c.y - 16 - i * 3).setAlpha(1 - i / 5);
      await timeline.wait(45);
    }
    label.destroy();
  })();
}

/** Etiqueta pequeña sobre una unidad (p. ej. "Contraataque"): no tapa el combate. */
export function tag(timeline: FxTimeline, view: FxHost, at: Pos, text: string, color: string): Promise<void> {
  const c = center(at);
  const label = fxText(timeline.scene, view, c.x, at.y * TILE - 2, text, color, FX_TEXT.tag);
  return timeline.wait(650).then(() => label.destroy());
}

/** Fotogramas de los restos al caer. */
const DEBRIS_FRAMES = 9;

/** Restos al caer una unidad: trozos del color de su bando que saltan y caen, y una columna de humo. */
export async function debris(timeline: FxTimeline, view: FxHost, at: Pos, team: number): Promise<void> {
  const scene = timeline.scene;
  const c = center(at);
  const colors = [team === 0 ? PAL.blue : PAL.red, PAL_MAP.smoke, PAL.ink, PAL_MAP.smokeDark];
  const pieces = Array.from({ length: 10 }, (_, i) => {
    const size = i % 3 ? 3 : 4;
    const piece = rect(scene, view, c.x, c.y, size, size, colors[i % colors.length]!);
    const speedX = (i / 10 - 0.5) * 2.6 + (Math.random() - 0.5) * 0.4;
    const speedY = -1.6 - Math.random() * 1.2;
    return { piece, speedX, speedY };
  });
  const smoke = Array.from({ length: 5 }, (_, i) => rect(scene, view, c.x + (i - 2) * 3, c.y + 4, 5, 5, PAL_MAP.smoke, 0.8));
  for (let frame = 1; frame <= DEBRIS_FRAMES; frame++) {
    for (const { piece, speedX, speedY } of pieces) {
      // Tiro parabolico: sale disparado y la gravedad lo hace caer.
      piece.setPosition(Math.round(c.x + speedX * frame * 3), Math.round(c.y + speedY * frame * 3 + 0.5 * 0.9 * frame * frame));
      piece.setAlpha(1 - frame / 11);
    }
    smoke.forEach((puff, i) => puff.setPosition(puff.x, Math.round(c.y + 4 - frame * (2 + i * 0.4))).setAlpha(0.8 - frame / 11));
    await timeline.wait(45);
  }
  pieces.forEach(({ piece }) => piece.destroy());
  smoke.forEach((puff) => puff.destroy());
}
