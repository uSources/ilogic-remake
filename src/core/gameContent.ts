/**
 * El contenido de cada partida (unidades, edificios, terreno, clima, generales, pesos de la IA). Es un
 * campo de la partida (`GameState.content`), no un modulo: dos partidas con contenidos distintos (el
 * del juego y el de una variante de equilibrio) se juegan a la vez en el mismo proceso.
 *
 * No se guarda (es el del juego, o el de la herramienta que la crea): `serialize` escribe solo lo
 * guardado (`SavedGameState`) y lo ponen quien crea la partida (`newGameState`) y quien la lee
 * (`deserialize`). Se lee como `s.content` (o sus atajos `tablesOf`, `weightsOf`). Para copiar una
 * partida, `cloneState` (comparte el contenido, que esta congelado).
 */
import type { ContentTables } from './content';
import type { GameState, SavedGameState } from './model';

/** Las tablas del contenido de la partida (UNIT, POWER, TERRAIN...). */
export function tablesOf(s: GameState): ContentTables {
  return s.content.tables;
}

/** Los pesos de la IA de la partida (ai.json). */
export function weightsOf(s: GameState): ContentTables['AI'] {
  return s.content.tables.AI;
}

/** Lo que se guarda de la partida: todo menos el contenido. */
export function savedPart(s: GameState): SavedGameState {
  const { content: _content, ...saved } = s;
  return saved;
}

/** Copia de la partida: lo guardado se copia entero y el contenido (congelado) se comparte. */
export function cloneState(s: GameState): GameState {
  return { ...structuredClone(savedPart(s)), content: s.content };
}
