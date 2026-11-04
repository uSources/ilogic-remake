/**
 * El contenido de cada partida (unidades, edificios, terreno, clima, generales, pesos de la IA). Va
 * unido a la partida, no a un modulo: dos partidas con contenidos distintos (el del juego y el de una
 * variante de equilibrio) pueden jugarse a la vez en el mismo proceso.
 *
 * No se guarda con la partida (es el del juego, o el de la herramienta que la crea): va en una
 * propiedad que no se enumera, asi que ni JSON.stringify, ni structuredClone, ni los tests lo ven.
 * Lo ponen quien crea la partida (`newGameState`) y quien la lee (`deserialize`); para copiar una
 * partida, `cloneState`.
 */
import type { ContentTables, GameContent, MoveType } from './content';
import type { GameState } from './model';

/** Donde va el contenido dentro de la partida (solo este modulo lo conoce). */
const CONTENT = Symbol('content');

type WithContent = GameState & { [CONTENT]?: GameContent };

/** Pone el contenido a una partida (una vez: no se cambia despues). Devuelve la misma partida. */
export function withContent(s: GameState, content: GameContent): GameState {
  Object.defineProperty(s, CONTENT, { value: content, enumerable: false, writable: false, configurable: false });
  return s;
}

/** El contenido con el que se juega la partida. */
export function contentOf(s: GameState): GameContent {
  const content = (s as WithContent)[CONTENT];
  if (!content) throw new Error('Partida sin contenido: creala con newGameState o leela con deserialize');
  return content;
}

/** Las tablas del contenido de la partida (UNIT, POWER, TERRAIN...). */
export function tablesOf(s: GameState): ContentTables {
  return contentOf(s).tables;
}

/** Los pesos de la IA de la partida (ai.json). */
export function weightsOf(s: GameState): ContentTables['AI'] {
  return contentOf(s).tables.AI;
}

/** Copia de la partida con el mismo contenido (structuredClone solo no lo copiaria). */
export function cloneState(s: GameState): GameState {
  return withContent(structuredClone(s), contentOf(s));
}

/** Tipo de movimiento de un tipo de unidad. */
export function movementOf(s: GameState, unitType: number): MoveType {
  return tablesOf(s).UNIT.movtype[unitType]!;
}

/** Ese tipo de movimiento puede pasar por ese terreno. */
export function canMoveOn(s: GameState, moveType: MoveType, terrain: number): boolean {
  return walkableFor(tablesOf(s), moveType, terrain);
}

/** Lo mismo con unas tablas sueltas (al comprobar contenido que aun no es de ninguna partida). */
export function walkableFor(tables: ContentTables, moveType: MoveType, terrain: number): boolean {
  return tables.CAN_WALK[moveType]?.[terrain] ?? false;
}

/** Lo que le cuesta a ese tipo de movimiento entrar en ese terreno (solo cuenta con la regla terrainCost). */
export function terrainMoveCost(s: GameState, moveType: MoveType, terrain: number): number {
  return tablesOf(s).MOVE_COST[moveType]?.[terrain] ?? 1;
}
