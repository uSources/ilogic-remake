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
