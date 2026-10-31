import type Phaser from 'phaser';
import { reducedMotion } from './fx';

/**
 * Efecto de clima sobre el mapa: lluvia, nieve, tormenta o arena, y un velo de color.
 * Se dibuja en coordenadas de mundo dentro de lo que ve la camara, con tamaños en pixeles de
 * pantalla (no crece con el zoom). Con "reducir el movimiento" solo queda el velo.
 */
export interface Particle {
  /** Posicion en la vista, de 0 a 1. */
  x: number;
  y: number;
  /** Velocidad en vistas por segundo. */
  vx: number;
  vy: number;
  len: number;
}

export interface Style {
  count: number;
  /** Velocidad base (vistas por segundo) y viento. */
  fall: number;
  wind: number;
  color: number;
  alpha: number;
  /** Raya (lluvia, arena) o copo cuadrado (nieve). */
  shape: 'streak' | 'flake';
  /** Largo de la raya en pixeles de pantalla. */
  len: number;
  /** Velo sobre el mapa. */
  veil: number;
  veilAlpha: number;
  /** Relampagos: probabilidad por segundo. */
  lightning?: number;
  /** Nubes de polvo que cruzan con el viento: cuantas, color, opacidad y ancho en pixeles de pantalla. */
  dust?: { count: number; color: number; alpha: number; size: number };
}

export const STYLES: Record<string, Style> = {
  Rain: { count: 140, fall: 1.1, wind: 0.18, color: 0x9fd0ff, alpha: 0.55, shape: 'streak', len: 14, veil: 0x0b1a33, veilAlpha: 0.14 },
  Snow: { count: 110, fall: 0.12, wind: 0.04, color: 0xffffff, alpha: 0.85, shape: 'flake', len: 3, veil: 0xdfe8ff, veilAlpha: 0.1 },
  Storm: {
    count: 220,
    fall: 1.5,
    wind: 0.45,
    color: 0xb8d8ff,
    alpha: 0.6,
    shape: 'streak',
    len: 18,
    veil: 0x060d1c,
    veilAlpha: 0.24,
    lightning: 0.12,
  },
  // Rayas claras (las de color arena no se veian sobre el desierto, donde pasa), un velo ocre mas
  // denso y nubes de polvo que cruzan: se tiene que notar que no se ve bien.
  Sandstorm: {
    count: 240,
    fall: 0.08,
    wind: 0.85,
    color: 0xfff1cf,
    alpha: 0.7,
    shape: 'streak',
    len: 22,
    veil: 0xb5742e,
    veilAlpha: 0.3,
    dust: { count: 10, color: 0xd9a35a, alpha: 0.3, size: 300 },
  },
};

/** Particula nueva en (x, y) de la vista; `r` (0..1) varia su velocidad y su largo. */
export function spawnParticle(s: Style, x: number, y: number, r: number): Particle {
  const k = 0.7 + r * 0.6;
  return { x, y, vx: s.wind * k, vy: s.fall * k, len: s.len * k };
}

/**
 * Avanza una particula y la recicla al salir de la vista: si cae por abajo vuelve por arriba (a
 * cualquier altura de lado); si el viento la saca por la derecha vuelve por la izquierda a cualquier
 * altura. Antes volvia siempre por arriba, y con la arena (casi todo viento, casi nada de caida)
 * todas las rayas acababan en una franja en lo alto de la pantalla.
 */
export function stepParticle(p: Particle, s: Style, dt: number, wobble: number, rnd: () => number): void {
  p.x += (p.vx + wobble) * dt;
  p.y += p.vy * dt;
  if (p.x > 1.15) Object.assign(p, spawnParticle(s, -0.15 + rnd() * 0.1, rnd() * 1.1 - 0.05, rnd()));
  else if (p.y > 1.05) Object.assign(p, spawnParticle(s, rnd() * 1.2 - 0.1, -0.05, rnd()));
}

export class WeatherFx {
  private readonly g: Phaser.GameObjects.Graphics;
  private particles: Particle[] = [];
  private dust: Particle[] = [];
  private style: Style | null = null;
  private id = 'Clear';
  private flash = 0;

  constructor(private readonly scene: Phaser.Scene) {
    this.g = scene.add.graphics();
  }

  /** Cambia el clima que se pinta (id de weather.json; "Clear" o desconocido = nada). */
  set(id: string | null): void {
    const next = id ?? 'Clear';
    if (next === this.id) return;
    this.id = next;
    this.style = STYLES[next] ?? null;
    this.particles = this.style ? Array.from({ length: this.style.count }, () => this.spawn(Math.random())) : [];
    this.dust = Array.from({ length: this.style?.dust?.count ?? 0 }, () => this.spawn(Math.random()));
    if (!this.style) this.g.clear();
  }

  private spawn(y: number): Particle {
    return spawnParticle(this.style!, Math.random() * 1.2 - 0.1, y, Math.random());
  }

  update(deltaMs: number): void {
    const s = this.style;
    if (!s) return;
    const cam = this.scene.cameras.main;
    const v = cam.worldView;
    const px = 1 / cam.zoom; // un pixel de pantalla en unidades de mundo
    const g = this.g;
    g.clear();
    g.fillStyle(s.veil, s.veilAlpha);
    g.fillRect(v.x, v.y, v.width, v.height);
    if (reducedMotion()) return;
    const dt = Math.min(deltaMs, 100) / 1000;
    const wobble = this.id === 'Snow' ? Math.sin(this.scene.time.now / 700) * 0.03 : 0;
    if (s.dust) {
      // Nubes de polvo: manchas grandes y suaves, mas lentas que las rayas (van detras de ellas).
      // Tres capas cada vez mas pequeñas: el borde queda suave, en escalones (como el pixel art).
      g.fillStyle(s.dust.color, s.dust.alpha / 3);
      for (const d of this.dust) {
        stepParticle(d, s, dt * 0.45, 0, Math.random);
        const w = s.dust.size * (d.len / s.len) * px;
        for (const k of [1, 0.72, 0.45]) g.fillEllipse(v.x + d.x * v.width, v.y + d.y * v.height, w * k, w * k * 0.45);
      }
    }
    g.lineStyle(Math.max(1, (s.dust ? 2 : 1.5) * px), s.color, s.alpha);
    g.fillStyle(s.color, s.alpha);
    for (const p of this.particles) {
      stepParticle(p, s, dt, wobble, Math.random);
      const wx = v.x + p.x * v.width;
      const wy = v.y + p.y * v.height;
      if (s.shape === 'flake') {
        g.fillRect(wx, wy, 3 * px, 3 * px);
      } else {
        // La raya va en la direccion del movimiento.
        const sp = Math.hypot(p.vx, p.vy) || 1;
        g.lineBetween(wx, wy, wx - (p.vx / sp) * p.len * px, wy - (p.vy / sp) * p.len * px);
      }
    }
    if (s.lightning && Math.random() < s.lightning * dt) this.flash = 1;
    if (this.flash > 0) {
      g.fillStyle(0xffffff, 0.35 * this.flash);
      g.fillRect(v.x, v.y, v.width, v.height);
      this.flash = Math.max(0, this.flash - dt * 4);
    }
  }

  destroy(): void {
    this.g.destroy();
  }
}
