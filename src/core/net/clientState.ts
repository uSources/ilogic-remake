/**
 * La partida de un cliente por la red: lo que sabe su equipo, tal como se lo manda el servidor
 * (`viewSnapshotOf`: la vista con la niebla de FOG en la forma de una partida guardada) y como se
 * lee en el cliente (`loadView`: una `GameState` que la pantalla dibuja como cualquier otra, con los
 * enemigos que no ve fuera, las semillas a cero y las caidas tal como las anuncia la partida).
 *
 * Es una partida guardada mas (`SavedGameState`), asi que se comprueba con lo mismo que un fichero
 * guardado (`readSave`): lo roto se rechaza igual. Solo cambia que las caidas no se contrastan con lo
 * que se ve (`SaveOrigin` 'view'). Cada vista nueva se mete en la misma partida (`fillWith`).
 */
import type { GameContent } from '../content';
import { savedPart } from '../gameContent';
import type { GameState, TeamId } from '../model';
import { GAME_MODES, type GameModeRegistry } from '../modes';
import { readSaved, type ReadSaveResult } from '../save';
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
  // Sobre una copia: leer limpia en sitio, y la partida del cliente no comparte nada con la vista que llego.
  return readSaved(copyOf(snapshot), content, { modes, origin: 'view' });
}

/**
 * La partida `state` pasa a ser `view` sin cambiar de objeto: quien la tiene (la pantalla que la
 * dibuja, la vista de un equipo que la mira) sigue con ella, ya al dia. Lo que habia en `state` y no
 * esta en `view` se quita. Las listas y unidades son las de `view` (las de antes ya no valen).
 */
export function fillWith(state: GameState, view: GameState): void {
  const target = state as unknown as Record<string, unknown>;
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(state, view);
}

/** Una copia de lo que llego (lo que no se puede copiar, como una funcion, no es una vista: null). */
function copyOf(value: unknown): unknown {
  try {
    return structuredClone(value);
  } catch {
    return null;
  }
}
