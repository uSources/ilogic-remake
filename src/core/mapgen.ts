/**
 * El generador de mapas al azar (sus numeros, en content/mapgen.json y themes.json). Fachada de
 * `mapgen/`, un modulo por tema:
 *
 * | Modulo | Que va |
 * |---|---|
 * | `mapgen/common` | sus numeros (los de la partida) y como mide la tierra |
 * | `mapgen/terrain` | el terreno, que crece en anillos, y el agua segun el tema |
 * | `mapgen/spawns` | las zonas de salida: donde caben, conectadas y separadas |
 * | `mapgen/buildings` | los edificios y unidades de cada salida y los neutrales |
 * | `mapgen/controlPoints` | los puntos de control |
 * | `mapgen/steps` | los pasos en orden (`MAP_STEPS`) y la partida nueva (`generateGame`) |
 */
export { generateGame, type NewMapOptions } from './mapgen/steps';
export { placeControlPoints } from './mapgen/controlPoints';
