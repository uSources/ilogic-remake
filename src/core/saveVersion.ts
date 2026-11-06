/**
 * Version del formato de las partidas guardadas. 1: hasta el arreglo de K1 (las misiones podian
 * llevar las reglas de escaramuza). 2: desde entonces (las reglas guardadas son las de la partida).
 * 3: los tipos (unidades, edificios, terreno, tema, clima) se guardan por id, no por numero.
 * 4: la partida guarda el estado de sus dados (`dice`).
 * 5: la partida guarda el numero de la siguiente escuadra (`nextSquadId`): ya no se reutiliza.
 * 6: la partida sabe de quien es el turno (`turn`, `turnOrder`, `turnStarted`), su modo (`mode`), quien
 *    se ha rendido (`TeamState.resigned`), de quien es el objetivo (`Objective.owner`) y los movimientos
 *    que se pueden deshacer (`undoableMoves`, antes uno solo: `lastMove`).
 * 7: cada equipo apunta cuando y por que cayo (`TeamState.fell`): el final dice la ultima caida.
 * El tipo la ata al de GameState.version: subir una sin la otra no compila. Al subirla, los pasos para
 * leer las de antes van en MIGRATIONS (saveMigrations.ts).
 */
import type { GameState } from './model';

export const SAVE_VERSION: GameState['version'] = 7;
