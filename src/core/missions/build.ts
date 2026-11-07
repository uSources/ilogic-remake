/**
 * La partida de una mision de la campaña (las misiones son contenido: content/missions.json, en
 * `content.missions`): su mapa, sus edificios y unidades, sus equipos y su objetivo, con sus reglas.
 */
import type { MatchSeeds } from '../util/random';
import { entryOf, findEntry, type GameContent, type MissionDef, type TerrainType, type Theme } from '../content';
import { settingsWith } from '../matchSettings';
import type { DeepReadonly } from '../util/freeze';
import { newGameState } from '../gameState';
import type { GameModeRegistry } from '../modes';
import type { GameState, MatchSettings, Objective, Pos, TeamId } from '../model';
import { objectiveFromMission, type MissionPlacement } from '../objectives';
import { posOf } from '../geom';
import { newUnit } from '../rules/lifecycle';

/** Una mision de la campaña tal como esta en el contenido (de solo lectura). */
export type Mission = DeepReadonly<MissionDef>;

/** La mision con ese id en el contenido, o undefined si no la tiene. */
export const missionById = (content: GameContent, id: string): Mission | undefined => findEntry(content.missions, id);

/**
 * El terreno de una letra del mapa en texto: la del tema (themes.json, "mapLetters") o, si no
 * depende del tema, la del terreno (terrain.json, "mapLetter").
 */
export function terrainOf(content: GameContent, letter: string, theme: Theme): TerrainType {
  const byTheme = theme.mapLetters[letter];
  const terrain = byTheme ? findEntry(content.terrain, byTheme) : content.terrain.list.find((candidate) => candidate.mapLetter === letter);
  if (!terrain) throw new Error(`Letra de terreno desconocida: "${letter}"`);
  return terrain;
}

const missionTheme = (content: GameContent, mission: Mission): Theme => entryOf(content.themes, mission.theme, 'tema');

/** Terreno de una casilla del mapa en texto (filas = y). */
export const missionTerrainAt = (content: GameContent, mission: Mission, pos: Pos) =>
  terrainOf(content, mission.map[pos.y]![pos.x]!, missionTheme(content, mission));

/** El mapa en texto (filas = y) como rejilla de terreno `map[x][y]`. */
function terrainGrid(content: GameContent, mission: Mission): GameState['map'] {
  const size = mission.map.length;
  const terrainKey = (pos: Pos) => missionTerrainAt(content, mission, pos).id;
  return Array.from({ length: size }, (_, x) => Array.from({ length: size }, (_, y) => terrainKey({ x, y })));
}

/** Pone las unidades de la mision y devuelve sus uid, en el orden de la lista. */
function placeUnits(s: GameState, units: Mission['units']): number[] {
  return units.map(({ type, team, at, life }) => {
    const unit = newUnit(s, entryOf(s.content.units, type, 'unidad'), team, posOf(at));
    if (life) unit.life = life;
    return unit.uid;
  });
}

/** Lo de la mision puesto en la partida para el objetivo de `team`: el uid de su unidad a escoltar (`vip`). */
function placementFor(mission: Mission, unitUids: readonly number[], team: TeamId): MissionPlacement {
  const vipIndex = mission.units.findIndex((unit) => unit.vip && unit.team === team);
  return vipIndex < 0 ? {} : { vipUid: unitUids[vipIndex]! };
}

/**
 * Crea la partida de una mision, con sus reglas (`missionSettings`) guardadas en la partida. `seeds`:
 * las de su azar (cada vez que se juega, las que diga quien la empieza).
 */
export function buildMission(mission: Mission, content: GameContent, seeds: MatchSeeds, modes?: GameModeRegistry): GameState {
  const s = newGameState({
    map: terrainGrid(content, mission),
    settings: missionSettings(mission, content),
    content,
    mode: 'mission',
    theme: missionTheme(content, mission).id,
    teams: mission.teams,
    seeds,
    modes,
  });
  for (const { type, owner, at } of mission.buildings)
    s.buildings.push({ type: entryOf(content.buildings, type, 'edificio').id, owner, ...posOf(at) });
  const unitUids = placeUnits(s, mission.units);
  s.mission = { id: mission.id, objectives: missionObjectives(mission, unitUids, content) };
  return s;
}

/** Los objetivos de los equipos de la mision en la partida, en el orden de los equipos (los que no tienen, ninguno). */
function missionObjectives(mission: Mission, unitUids: readonly number[], content: GameContent): Objective[] {
  return mission.teams.flatMap((team, owner) =>
    team.objective ? [objectiveFromMission(team.objective, owner, placementFor(mission, unitUids, owner), content)] : [],
  );
}

/** El dinero con el que empieza quien juega la mision (el primer equipo de una persona; si no hay, el primero). */
const playerFunds = (mission: Mission): number => (mission.teams.find((team) => team.controller === 'human') ?? mission.teams[0])!.funds;

/**
 * Las misiones estan ajustadas sin puntos de mando, mantenimiento ni clima (salvo que la mision los
 * pida). El dinero de cada equipo lo dice la mision (`MissionTeam.funds`); el de las reglas
 * (`initialFunds`, el que se enseña como dinero inicial) es el de quien la juega.
 */
export const missionSettings = (mission: Mission, content: GameContent): MatchSettings =>
  settingsWith(content, {
    commandPoints: null,
    upkeep: 0,
    weather: false,
    initialFunds: playerFunds(mission),
    ...mission.settings,
  });
