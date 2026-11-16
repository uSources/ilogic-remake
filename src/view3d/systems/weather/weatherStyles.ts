/**
 * Como se ve cada clima (id de weather.json): cuantas particulas, como caen, de que color, el velo
 * sobre la pantalla, los relampagos y las nubes de polvo. Los usa el clima de la vista 3D (weather3d.ts).
 */
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
