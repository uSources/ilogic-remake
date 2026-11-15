// Animaciones que comparten los modelos de Ashfox (unidades y edificios): bucles, vaivenes, giros sin
// fin, golpes y retrocesos. Cada una da las pistas que escribe generate.mjs (hueso, giro o escala, claves).

export const loopMotion = (duration, tracks, interp = 'catmullrom') => ({
  duration,
  fps: 20,
  loop: 'loop',
  tracks: tracks.map((track) => ({ interp, ...track })),
});
export const onceMotion = (duration, tracks) => ({
  duration,
  fps: 30,
  loop: 'once',
  tracks: tracks.map((track) => ({ interp: 'linear', ...track })),
});
/** Un vaiven de un hueso: de 0 a `amount` (grados en cada eje), de vuelta, al reves y a 0. */
export const sway = (bone, amount, duration) => ({
  bone,
  channel: 'rotation',
  keys: [
    [0, [0, 0, 0]],
    [duration / 4, amount],
    [duration / 2, [0, 0, 0]],
    [(duration * 3) / 4, amount.map((value) => -value)],
    [duration, [0, 0, 0]],
  ],
});
/**
 * Un giro sin fin (ruedas, helices, ventilador, radar), a saltos de una parte (`steps`) de lo que
 * tarda la pieza en verse igual (`symmetry`: 90 grados una rueda cuadrada, 180 una helice); al acabar
 * vuelve a 0, que se ve igual: Ashfox pide que un bucle acabe como empieza, y a saltos queda de juguete.
 */
export const spin = (bone, duration, { axis = 0, symmetry = 90, sign = -1, steps = 4 } = {}) => ({
  bone,
  channel: 'rotation',
  interp: 'step',
  keys: [
    ...Array.from({ length: steps }, (_, step) => [(duration * step) / steps, angleOn(axis, (sign * symmetry * step) / steps)]),
    [duration, [0, 0, 0]],
  ],
});
/** Un giro de esos grados sobre un eje (0 = x, 1 = y, 2 = z). */
export const angleOn = (axis, degrees) => [0, 1, 2].map((index) => (index === axis ? degrees : 0));
/** El golpe de un disparo: el hueso se echa atras (giro en x) y vuelve. */
export const kick = (bone, degrees) => ({
  bone,
  channel: 'rotation',
  keys: [
    [0, [0, 0, 0]],
    [0.06, [degrees, 0, 0]],
    [0.4, [0, 0, 0]],
  ],
});
/** El cañon se encoge un momento (retroceso) y vuelve. */
export const recoil = (bone) => ({
  bone,
  channel: 'scale',
  keys: [
    [0, [1, 1, 1]],
    [0.05, [1.15, 1.15, 0.6]],
    [0.4, [1, 1, 1]],
  ],
});
