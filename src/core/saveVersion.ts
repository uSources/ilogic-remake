/**
 * Version del formato de las partidas guardadas: la de ahora, 14 (se quitan los generales: sus campos
 * de los equipos y el suceso de los poderes, que las partidas de antes no tienen). El tipo la ata al de GameState.version: subir una sin la otra
 * no compila. Solo se lee la de ahora: mientras el juego no ha salido, cambiar el formato es subir
 * la version, y las partidas guardadas con una de antes se descartan (readSave da 'badVersion'; el
 * juego hace como si no hubiera). Que cambio en cada version lo cuentan los commits que la suben.
 */
import type { GameState } from './model';

export const SAVE_VERSION: GameState['version'] = 14;
