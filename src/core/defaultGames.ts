/**
 * Partidas con el contenido del juego (src/core/content): las que juega la web y las herramientas que
 * no prueban variantes. Quien juega con otro contenido (el equilibrado) llama a generateGame y a
 * deserialize dandoselo.
 */
import { entryOf, type GameContent } from './content';
import { defaultContent } from './content/default';
import { generateGame } from './mapgen';
import { missionById, missionRules } from './missions';
import type { GameState, RulesConfig, Rng } from './model';
import { rulesWith } from './rulesConfig';
import type { TeamSetup } from './teams';
import { deserialize, type SaveContext } from './save';

/** Lo que se elige de una partida nueva con el contenido del juego. */
export interface CreateGameOptions {
  /** Lado del mapa (32 si no se dice). */
  size?: number;
  /** Tema del mapa (id de themes.json), o null (o nada) para uno al azar. */
  theme?: string | null;
  /** Cambios a las reglas por defecto de ese contenido (sin cambios, las de siempre). */
  ruleChanges?: Partial<RulesConfig>;
  /** Los equipos: quien juega cada uno (p. ej. `duel('human', 'ai')`). */
  teams: readonly TeamSetup[];
}

/**
 * Mapa al azar con el contenido del juego. Las reglas salen del mismo contenido
 * (`rulesWith(contenido, ruleChanges)`): el contenido y las reglas no pueden ser de dos sitios.
 */
export function createGame(rng: Rng, { size, theme, ruleChanges = {}, teams }: CreateGameOptions): GameState {
  const content = defaultContent();
  const chosenTheme = theme === null || theme === undefined ? null : entryOf(content.themes, theme, 'tema');
  return generateGame(rng, { size, theme: chosenTheme, rules: rulesWith(content, ruleChanges), content, teams });
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
