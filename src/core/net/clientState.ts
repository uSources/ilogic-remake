/**
 * La partida de un cliente por la red: lo que sabe su equipo, tal como se lo manda el servidor
 * (`viewSnapshotOf`: la vista con la niebla de FOG en la forma de una partida guardada) y como se
 * lee en el cliente (`loadView`: una `GameState` que la pantalla dibuja como cualquier otra, con los
 * enemigos que no ve fuera, las semillas a cero y las caidas tal como las anuncia la partida).
 *
 * Es una partida guardada mas (`SavedGameState`), asi que se comprueba con lo mismo que un fichero
 * guardado (`readSave`): lo roto se rechaza igual. Solo cambia que las caidas no se contrastan con lo
 * que se ve (`SaveOrigin` 'view').
 */
import type { GameContent } from '../content';
import { savedPart } from '../gameContent';
import type { GameState, TeamId } from '../model';
import { GAME_MODES, type GameModeRegistry } from '../modes';
import { readSave, type ReadSaveResult } from '../save';
import { knowledgeOf } from './eventFog';
import type { ViewSnapshot } from './protocol';

/** La vista del equipo `team` de la partida `s`, lista para mandarla (JSON). */
export const viewSnapshotOf = (s: GameState, team: TeamId): ViewSnapshot => savedPart(knowledgeOf(s, team).state);

/**
 * La partida de un cliente a partir de la vista que le ha llegado (comprobada como una partida
 * guardada; `snapshot` puede ser cualquier cosa: si no es una vista, dice que falla). El contenido lo
 * pone quien lee, como al cargar.
 */
export function loadView(snapshot: unknown, content: GameContent, modes: GameModeRegistry = GAME_MODES): ReadSaveResult {
  // Por JSON: lo que llega por la red es JSON, y asi la partida del cliente no comparte nada con la vista.
  return readSave(JSON.stringify(snapshot), content, modes, 'view');
}
