import { entryOf, type BuildingType, type TerrainType, type UnitType } from '@core/content';
import { defaultContent } from '@core/content/default';
import { SAVE_VERSION } from '@core/saveVersion';
import { rulesWith } from '@core/rulesConfig';
import { newGameState } from '@core/gameState';
import { blankMap } from '@core/mapGrid';
import type { GameEvent, GameState, RulesConfig } from '@core/model';
import { aiTurn } from '@core/ai';
import { seededRng } from '@core/geom';
import { endRound, takesTurn } from '@core/rules';
import { teamIds, type TeamSetup } from '@core/teams';

/** Lado del mapa de las partidas de prueba (como el original). */
export const BLANK_SIZE = 32;

/**
 * Una partida guardada que dice ser del formato 1 (`version: 1`): para probar que MIGRATIONS hace con
 * ella lo de entonces (los pasos de los tipos por numero dejan los ids como estan).
 */
export function savedByVersion1(json: string): string {
  return json.replace(`"version":${SAVE_VERSION}`, '"version":1');
}

/** Partida vacia toda de hierba, para tests de reglas: con las reglas de siempre y los cambios de `rules`. */
/** Dinero de cada equipo en las partidas de prueba. */
export const BLANK_FUNDS = 5000;

/** Los equipos de una partida de prueba normal: el 0 lo juega una persona y el 1, la IA; enemigos. */
export const PLAYER = 0;
export const ENEMY = 1;
const PERSON_VS_AI: TeamSetup[] = [
  { controller: 'human', funds: BLANK_FUNDS },
  { controller: 'ai', funds: BLANK_FUNDS },
];

/** Una partida vacia (todo llano, sin unidades ni edificios) con esas reglas y esos equipos. */
export function blankState(rules: Partial<RulesConfig> = {}, teams: readonly TeamSetup[] = PERSON_VS_AI): GameState {
  return newGameState({
    map: blankMap(BLANK_SIZE, defaultContent().plainTerrain.id),
    rules: rulesWith(defaultContent(), rules),
    content: defaultContent(),
    teams,
  });
}

/** Un tipo de unidad del contenido del juego, por su id ('Tank'). */
export const unitTypeNamed = (id: string): UnitType => entryOf(defaultContent().units, id, 'unidad');
/** Un tipo de edificio del contenido del juego, por su id ('City'). */
export const buildingTypeNamed = (id: string): BuildingType => entryOf(defaultContent().buildings, id, 'edificio');
/** Un terreno del contenido del juego, por su id ('Woods'). */
export const terrainNamed = (id: string): TerrainType => entryOf(defaultContent().terrain, id, 'terreno');

/** El id del cuartel general del contenido del juego (lo que guarda `Building.type`). */
export const hqId = (): string => defaultContent().hq.id;

/**
 * Juega `days` rondas IA contra IA de cada partida a la vez, turno a turno (un turno de cada una por
 * equipo), cada una con su azar de semilla `seed`: para ver que dos partidas en el mismo proceso no
 * se mezclan. Los equipos que han perdido no juegan (takesTurn). Devuelve los eventos de cada una.
 */
export function playInterleaved(games: readonly GameState[], days: number, seed: number): GameEvent[][] {
  const rngs = games.map(() => seededRng(seed));
  const events: GameEvent[][] = games.map(() => []);
  for (let day = 0; day < days; day++) {
    for (const team of teamIds(games[0]!))
      games.forEach((s, i) => {
        if (takesTurn(s, team)) events[i]!.push(...aiTurn(s, rngs[i]!, team));
      });
    games.forEach((s) => endRound(s));
  }
  return events;
}
