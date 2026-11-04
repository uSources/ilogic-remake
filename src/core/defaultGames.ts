/**
 * Partidas con el contenido del juego (src/core/content): las que juega la web y las herramientas que
 * no prueban variantes. Quien juega con otro contenido (el equilibrado) llama a generateGame y a
 * deserialize dandoselo.
 */
import type { GameContent } from './content';
import { defaultContent } from './content/default';
import { generateGame, type NewMapOptions } from './mapgen';
import { missionById, missionRules } from './missions';
import type { GameState, Rng } from './model';
import { deserialize, type SaveContext } from './save';

/** Mapa al azar con el contenido del juego. */
export function createGame(rng: Rng, options: Omit<NewMapOptions, 'content'>): GameState {
  return generateGame(rng, { ...options, content: defaultContent() });
}

/**
 * Como lee el juego sus partidas: con `content` y las reglas de las misiones del juego (con ese
 * contenido).
 */
export function saveContext(content: GameContent): SaveContext {
  return {
    content,
    missionRules: (id) => {
      const mission = missionById(id);
      return mission ? missionRules(mission, content) : undefined;
    },
  };
}

/** Lee una partida guardada con el contenido del juego (null si el fichero no es valido). */
export function loadGame(json: string): GameState | null {
  return deserialize(json, saveContext(defaultContent()));
}
