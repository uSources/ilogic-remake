/**
 * [CAMBIO] Animaciones de combate rediseñadas: retroceso y fogonazo al disparar, proyectil segun el
 * tipo de unidad, impacto con destello y explosion, numero de daño que salta y restos al caer.
 * Mismo estilo pixel que ui/fx.ts (cuadraditos y saltos), en coordenadas de mundo.
 *
 * Todas las duraciones van multiplicadas por `k` (velocidad de las animaciones de las Opciones:
 * 1 = normal); GameScene no llama a nada de esto si hay que saltarse las animaciones.
 */
import type Phaser from 'phaser';
import { Movement, MoveType, UNIT } from '../core/data';
import type { Pos } from '../core/types';
import { TILE } from '../layout';
import { animFrameCount, burst, center, COLORS, playAnim, reducedMotion } from './fx';
import type { Facing, MapView } from './mapView';
import { PAL, PAL_CSS } from './palette';

const sleep = (scene: Phaser.Scene, ms: number) => new Promise<void>((r) => scene.time.delayedCall(Math.max(0, ms), r));

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

export function shotKind(atkType: number, defType: number): ShotKind {
  if (UNIT.minalc[atkType]! > 0) return UNIT.alcance[atkType]! >= 6 ? 'missile' : 'arc';
  const mt = Movement.of(atkType);
  if (mt === MoveType.AIR) return Movement.of(defType) === MoveType.AIR ? 'tracer' : 'bomb';
  return mt === MoveType.FOOT ? 'bullets' : 'shell';
}

/** Punta del arma: delante de la unidad, a media altura. */
function muzzle(from: Pos, to: Pos): { x: number; y: number } {
  const c = center(from);
  const dir = Math.sign(to.x - from.x) || 0;
  const dy = Math.sign(to.y - from.y) || 0;
  return { x: c.x + dir * 13, y: c.y - 3 + dy * 8 };
}

function rect(scene: Phaser.Scene, view: MapView, x: number, y: number, w: number, h: number, color: number, alpha = 1) {
  const r = scene.add.rectangle(Math.round(x), Math.round(y), w, h, color, alpha).setOrigin(0.5);
  view.addFx(r);
  return r;
}

/** Retroceso al disparar: la unidad se echa hacia atras y vuelve (en dos saltos). */
export async function recoil(scene: Phaser.Scene, sprite: Phaser.GameObjects.Container, from: Pos, to: Pos, k: number): Promise<void> {
  const dx = -Math.sign(to.x - from.x) * 3,
    dy = -Math.sign(to.y - from.y) * 2;
  const ox = sprite.x,
    oy = sprite.y;
  sprite.setPosition(ox + dx, oy + dy);
  await sleep(scene, 70 * k);
  sprite.setPosition(ox + Math.round(dx / 2), oy + Math.round(dy / 2));
  await sleep(scene, 50 * k);
  sprite.setPosition(ox, oy);
}

/** Fogonazo en la punta del arma: estrella de cuadraditos que se apaga en tres fotogramas. */
export async function muzzleFlash(scene: Phaser.Scene, view: MapView, from: Pos, to: Pos, k: number): Promise<void> {
  const m = muzzle(from, to);
  const parts = [
    rect(scene, view, m.x, m.y, 6, 6, 0xffffff),
    rect(scene, view, m.x, m.y, 10, 2, PAL.gold),
    rect(scene, view, m.x, m.y, 2, 10, PAL.gold),
  ];
  await sleep(scene, 50 * k);
  parts[0]!.setFillStyle(PAL.gold);
  parts[1]!.setSize(6, 2);
  parts[2]!.setSize(2, 6);
  await sleep(scene, 50 * k);
  parts.forEach((p) => p.destroy());
}

/** Lleva un cuadradito de a a b en `ms`, por pasos; `lift` = altura de la parabola. Llama a `each` en cada paso. */
async function fly(
  scene: Phaser.Scene,
  obj: Phaser.GameObjects.Rectangle,
  a: { x: number; y: number },
  b: { x: number; y: number },
  ms: number,
  lift = 0,
  each?: (x: number, y: number, t: number) => void,
): Promise<void> {
  const steps = Math.max(3, Math.round(ms / 30));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t,
      y = a.y + (b.y - a.y) * t - lift * 4 * t * (1 - t);
    obj.setPosition(Math.round(x), Math.round(y));
    each?.(x, y, t);
    await sleep(scene, ms / steps);
  }
}

/** El disparo de `from` a `to`: termina en el momento del impacto. */
export async function projectile(scene: Phaser.Scene, view: MapView, kind: ShotKind, from: Pos, to: Pos, k: number): Promise<void> {
  const a = muzzle(from, to);
  const b = center(to);
  const dist = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
  switch (kind) {
    case 'bullets':
    case 'tracer': {
      // Tres balas trazadoras seguidas (dos rafagas los aviones).
      const n = kind === 'tracer' ? 5 : 3;
      const jobs: Promise<void>[] = [];
      for (let i = 0; i < n; i++) {
        const bullet = rect(scene, view, a.x, a.y, 4, 2, i % 2 ? 0xffffff : PAL.gold);
        const spread = { x: b.x + ((i % 3) - 1) * 3, y: b.y + ((i % 2) * 2 - 1) * 3 };
        jobs.push(sleep(scene, i * 45 * k).then(() => fly(scene, bullet, a, spread, 110 * k).then(() => bullet.destroy())));
      }
      await Promise.all(jobs);
      return;
    }
    case 'shell': {
      const shell = rect(scene, view, a.x, a.y, 5, 4, 0xffffff);
      const trail: Phaser.GameObjects.Rectangle[] = [];
      await fly(scene, shell, a, b, 130 * k, 0, (x, y) => {
        trail.push(rect(scene, view, x, y, 3, 2, PAL.gold, 0.8));
        if (trail.length > 3) trail.shift()!.destroy();
      });
      shell.destroy();
      trail.forEach((t) => t.destroy());
      return;
    }
    case 'arc': {
      // Parabola alta con una sombra en el suelo que avanza debajo.
      const shellA = rect(scene, view, a.x, a.y, 5, 5, 0xffffff);
      const shadow = rect(scene, view, a.x, a.y + 10, 6, 2, PAL.ink, 0.35);
      await fly(scene, shellA, a, b, (260 + dist * 30) * k, Math.min(56, 18 + dist * 9), (x, _y, t) => {
        shadow.setPosition(Math.round(x), Math.round(a.y + 10 + (b.y + 10 - a.y - 10) * t));
      });
      shellA.destroy();
      shadow.destroy();
      return;
    }
    case 'missile': {
      const missile = rect(scene, view, a.x, a.y, 6, 3, 0xffffff);
      const puffs: Phaser.GameObjects.Rectangle[] = [];
      await fly(scene, missile, a, b, (240 + dist * 25) * k, Math.min(36, 10 + dist * 4), (x, y) => {
        const p = rect(scene, view, x, y, 3, 3, 0x8a93a8, 0.85);
        puffs.push(p);
        scene.tweens.add({ targets: p, alpha: 0, duration: 380 * k, onComplete: () => p.destroy() });
      });
      missile.destroy();
      return;
    }
    case 'bomb': {
      // Dos bombas que caen desde encima del objetivo.
      const jobs = [0, 1].map(async (i) => {
        await sleep(scene, i * 70 * k);
        const top = { x: b.x + (i ? 5 : -5), y: b.y - 46 };
        const bomb = rect(scene, view, top.x, top.y, 4, 6, PAL.ink);
        await fly(scene, bomb, top, { x: top.x, y: b.y }, 170 * k);
        bomb.destroy();
      });
      await Promise.all(jobs);
      return;
    }
    default:
      return kind satisfies never;
  }
}

/** Destello blanco de una unidad al recibir el golpe (su dibujo principal). */
export async function hitFlash(
  scene: Phaser.Scene,
  sprite: Phaser.GameObjects.Container | Phaser.GameObjects.Image | null,
  k: number,
): Promise<void> {
  if (!sprite) return;
  const main = 'list' in sprite ? sprite.list.find((o): o is Phaser.GameObjects.Image => 'setTintFill' in o) : sprite;
  if (!main) return;
  // Phaser 4: color + modo FILL (1 = Phaser.TintModes.FILL; aqui Phaser solo se importa como tipo).
  main.setTint(0xffffff).setTintMode(1);
  await sleep(scene, 70 * k);
  main.clearTint();
}

/** Explosion del impacto: anillo de cuadraditos que se abre y chispas. Mas grande si cae. */
export async function impact(scene: Phaser.Scene, view: MapView, at: Pos, killed: boolean, k: number): Promise<void> {
  const c = center(at);
  if (!reducedMotion()) scene.cameras.main.shake(killed ? 200 : 100, killed ? 0.006 : 0.003);
  const g = scene.add.graphics();
  view.addFx(g);
  const ring = async () => {
    const radii = killed ? [5, 10, 15, 19] : [4, 8, 12];
    for (const [i, r] of radii.entries()) {
      g.clear();
      g.fillStyle(i === 0 ? 0xffffff : i < 2 ? PAL.gold : 0xff8a3d, 1 - i / (radii.length + 1));
      for (let a = 0; a < 12; a++) {
        const ang = (a / 12) * Math.PI * 2;
        g.fillRect(Math.round(c.x + Math.cos(ang) * r) - 2, Math.round(c.y + Math.sin(ang) * r) - 2, 4, 4);
      }
      if (i === 0) g.fillRect(c.x - 5, c.y - 5, 10, 10);
      await sleep(scene, 55 * k);
    }
    g.destroy();
  };
  // Explosion dibujada (ui/anim_boom_*) si esta en el atlas; si no, el anillo de cuadraditos de siempre.
  const drawn = animFrameCount(scene, 'boom') > 0;
  await Promise.all([
    drawn ? playAnim(scene, view, c, 'boom', { frameMs: 40 * k }) : ring(),
    burst(scene, view, c, {
      colors: COLORS.fire,
      count: drawn ? (killed ? 8 : 5) : killed ? 12 : 8,
      radius: killed ? 22 : 15,
      size: drawn ? 3 : 4,
      duration: 320 * k,
    }),
  ]);
  if (drawn) g.destroy();
}

/** Numero que salta: aparece grande, se encoge a su tamaño, sube un poco y se va. No hay que esperarlo entero. */
export function popNumber(scene: Phaser.Scene, view: MapView, at: Pos, text: string, color: string, k: number): Promise<void> {
  const c = center(at);
  const t = scene.add
    .text(c.x, c.y - 16, text, {
      fontFamily: 'Ilogic, Silkscreen, monospace',
      fontSize: '20px',
      color,
      stroke: PAL_CSS.ink,
      strokeThickness: 5,
    })
    .setOrigin(0.5, 1)
    .setScale(1.6);
  view.addFx(t);
  return (async () => {
    await sleep(scene, 50 * k);
    t.setScale(1.25);
    await sleep(scene, 50 * k);
    t.setScale(1);
    await sleep(scene, 380 * k);
    for (let i = 1; i <= 4; i++) {
      t.setY(c.y - 16 - i * 3).setAlpha(1 - i / 5);
      await sleep(scene, 45 * k);
    }
    t.destroy();
  })();
}

/** Etiqueta pequeña sobre una unidad (p. ej. "Contraataque"): no tapa el combate. */
export function tag(scene: Phaser.Scene, view: MapView, at: Pos, text: string, color: string, k: number): Promise<void> {
  const c = center(at);
  const t = scene.add
    .text(c.x, at.y * TILE - 2, text, {
      fontFamily: 'Ilogic, Silkscreen, monospace',
      fontSize: '10px',
      color,
      stroke: PAL_CSS.ink,
      strokeThickness: 3,
    })
    .setOrigin(0.5, 1);
  view.addFx(t);
  return sleep(scene, 650 * k).then(() => t.destroy());
}

/** Restos al caer una unidad: trozos del color de su bando que saltan y caen, y una columna de humo. */
export async function debris(scene: Phaser.Scene, view: MapView, at: Pos, team: number, k: number): Promise<void> {
  const c = center(at);
  const colors = [team === 0 ? PAL.blue : PAL.red, 0x5b6478, PAL.ink, 0x3a4256];
  const parts = Array.from({ length: 10 }, (_, i) => {
    const r = rect(scene, view, c.x, c.y, i % 3 ? 3 : 4, i % 3 ? 3 : 4, colors[i % colors.length]!);
    const vx = (i / 10 - 0.5) * 2.6 + (Math.random() - 0.5) * 0.4;
    const vy = -1.6 - Math.random() * 1.2;
    return { r, vx, vy };
  });
  const smoke = Array.from({ length: 5 }, (_, i) => rect(scene, view, c.x + (i - 2) * 3, c.y + 4, 5, 5, 0x5b6478, 0.8));
  for (let f = 1; f <= 9; f++) {
    for (const p of parts) {
      p.r.setPosition(Math.round(c.x + p.vx * f * 3), Math.round(c.y + p.vy * f * 3 + 0.5 * 0.9 * f * f));
      p.r.setAlpha(1 - f / 11);
    }
    smoke.forEach((s, i) => s.setPosition(s.x, Math.round(c.y + 4 - f * (2 + i * 0.4))).setAlpha(0.8 - f / 11));
    await sleep(scene, 45 * k);
  }
  parts.forEach((p) => p.r.destroy());
  smoke.forEach((s) => s.destroy());
}
