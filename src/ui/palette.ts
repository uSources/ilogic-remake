/**
 * Colores de la interfaz dibujada con Phaser. Son los mismos que las variables de src/hud/hud.css
 * (--gold, --red...): si cambia uno, cambiar el otro.
 */
export const PAL = {
  ink: 0x0b1220,
  gold: 0xffd447,
  red: 0xff4d45,
  blue: 0x3aa8ff,
  green: 0x4fd36a,
  white: 0xffffff,
} as const;

/** Los mismos, como texto CSS (para Phaser.Text y lienzos). */
export const PAL_CSS = {
  ink: '#0b1220',
  gold: '#ffd447',
  red: '#ff4d45',
  redSoft: '#ff7a73',
  green: '#4fd36a',
} as const;

/**
 * Colores que solo usan el mapa, los efectos y los punteros (no estan en hud.css). Con nombre para
 * no repetir el mismo numero en cada fichero ni dudar de si dos "turquesas" son el mismo.
 */
export const PAL_MAP = {
  /** Cargar en un transporte (resaltado, marca de carga, puntero). */
  teal: 0x2fd3c3,
  /** Defender / "ir alli" (bandera de la orden, puntero). */
  mint: 0x5fd6c6,
  /** Unirse a otra unidad. */
  violet: 0xb15cff,
  /** Alcance, fuego, explosiones. */
  orange: 0xff8a3d,
  /** Brillo dorado (estrellas, mastiles, confeti). */
  paleGold: 0xfff1a8,
  /** Ambar: unidad destacada de su escuadra, chispas. */
  amber: 0xffb43a,
  /** Rojo claro: flecha del camino cuando al soltar se ataca (= PAL_CSS.redSoft). */
  redSoft: 0xff7a73,
  /** Flecha de lo que hara una unidad con orden. */
  intent: 0xdff4ff,
  /** Placa de la letra de la mision cuando falta el icono dibujado. */
  plaque: 0x2f8f83,
  /** Punto de control sin dueño. */
  neutral: 0xc8c8c8,
  /** Niebla del dibujo de 2013 (casillas que no se ven). */
  fog: 0x05080c,
  /** Humo y restos. */
  smoke: 0x5b6478,
  smokeDark: 0x3a4256,
  smokeLight: 0x8a93a8,
  /** Quemado en el suelo y sus motas. */
  scorch: 0x1b1f14,
  scorchSpeck: 0x3a3426,
} as const;
