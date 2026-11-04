/**
 * El contenido del juego: el de los ficheros JSON. Quien empieza o carga una partida lo pasa
 * (`defaultContent()`); el nucleo no lo lee nunca por su cuenta, sino de la partida (`tablesOf(s)`).
 *
 * Se lee y valida la primera vez que se pide, no al importar el modulo; despues se devuelve el mismo
 * valor, que esta congelado (es una cache, no estado: siempre vale lo mismo).
 */
import { loadContent, readContentFiles, type GameContent } from './index';

let cached: GameContent | null = null;

export function defaultContent(): GameContent {
  cached ??= loadContent(readContentFiles());
  return cached;
}
