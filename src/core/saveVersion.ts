/**
 * Version del formato de las partidas guardadas. 1: hasta el arreglo de K1 (las misiones podian
 * llevar las reglas de escaramuza). 2: desde entonces (las reglas guardadas son las de la partida).
 * El tipo la ata al de GameState.version: subir una sin la otra no compila. Al subirla, los pasos para
 * leer las de antes van en MIGRATIONS (saveMigrations.ts).
 */
import type { GameState } from './model';

export const SAVE_VERSION: GameState['version'] = 2;
