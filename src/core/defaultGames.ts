/**
 * Partidas con el contenido del juego (src/core/content): las que juega la web y las herramientas que
 * no prueban variantes. Quien juega con otro contenido (el equilibrado) llama a buildMatch y a
 * deserialize dandoselo.
 */
import type { GameContent } from './content';
import { defaultContent } from './content/default';
import { buildMatch, type MatchConfig } from './match';
import { missionById, missionRules } from './missions';
import type { GameState, Rng } from './model';
import { deserialize, type SaveContext } from './save';

/**
 * Una partida nueva con el contenido del juego (ver MatchConfig y buildMatch en match.ts). `mapRng`:
 * el azar del generador de mapas, si quien la juega quiere seguir tirando de el (las herramientas);
 * si no, el de la semilla del mapa.
 */
export function createMatch(config: MatchConfig, mapRng?: Rng): GameState {
  return buildMatch(config, { content: defaultContent(), mapRng });
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
