/**
 * Constantes del juego que no son contenido ni dependen de el: tamaños de mapa y vida maxima.
 * Unidades, edificios, terreno, temas, generador de mapas, clima, generales y pesos de la IA son el contenido
 * (src/core/content, ver docs/CONTENIDO.md), que cada partida lleva en `s.content`; las reglas por
 * defecto salen de el (`settingsWith`, matchSettings.ts).
 */

/** Tamaños de mapa admitidos en los mapas al azar (el tamaño de cada partida sale de su `map`). */
export const MAP_SIZES = [20, 32, 40] as const;
/** El lado mas pequeño de un mapa hecho a mano (misiones, editor). */
export const MAP_MIN = 10;
/** El lado mas grande de un mapa hecho a mano. */
export const MAP_MAX = 48;
/** La vida de una unidad entera (la que tiene al comprarla). */
export const MAX_LIFE = 100;
