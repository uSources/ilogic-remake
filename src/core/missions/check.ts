/**
 * Lo que se mira de una mision con el mapa entero (para los tests y quien escribe una: skill
 * nueva-mision): edificios sobre suelo, unidades en un terreno en el que pueden estar, una Base por
 * equipo y el objetivo en su sitio. Lo que dice el fichero ya lo ha comprobado el contenido
 * (content/missions.ts) al cargarlo.
 */
import { findEntry, type GameContent } from '../content';
import { posKey } from '../geom';
import type { TeamId } from '../model';
import { objectiveProblems } from '../objectives';
import { canMoveOn } from '../rules/queries';
import { missionTerrainAt, type Mission } from './build';

function buildingProblems(mission: Mission, content: GameContent): string[] {
  const problems: string[] = [];
  const taken = new Set<string>();
  for (const { type, at } of mission.buildings) {
    if (!findEntry(content.buildings, type)) problems.push(`edificio "${type}" no existe (src/core/content/buildings.json)`);
    if (!missionTerrainAt(content, mission, at).buildable) problems.push(`${type} en (${posKey(at)}) no esta sobre suelo`);
    if (taken.has(posKey(at))) problems.push(`dos edificios en (${posKey(at)})`);
    taken.add(posKey(at));
  }
  return problems;
}

function unitProblems(mission: Mission, content: GameContent): string[] {
  const problems: string[] = [];
  const taken = new Set<string>();
  for (const { type, at } of mission.units) {
    const unitType = findEntry(content.units, type);
    if (!unitType) {
      problems.push(`unidad "${type}" no existe (src/core/content/units.json)`);
      continue;
    }
    if (!canMoveOn(unitType.movement, missionTerrainAt(content, mission, at)))
      problems.push(`${type} en (${posKey(at)}) no puede estar en ese terreno`);
    if (taken.has(posKey(at))) problems.push(`dos unidades en (${posKey(at)})`);
    taken.add(posKey(at));
  }
  return problems;
}

function missingBases(mission: Mission, content: GameContent): string[] {
  const hasBase = (team: TeamId) => mission.buildings.some((building) => building.type === content.hq.id && building.owner === team);
  const teams = mission.teams.map((_, team) => team);
  return teams.filter((team) => !hasBase(team)).map((team) => `falta la Base del equipo ${team}`);
}

/** Edificios y unidades de equipos que la mision no tiene. */
function unknownTeams(mission: Mission): string[] {
  const isTeam = (team: TeamId | null) => team === null || (team >= 0 && team < mission.teams.length);
  const owners = [...mission.buildings.map((building) => building.owner), ...mission.units.map((unit) => unit.team)];
  return owners.filter((owner) => !isTeam(owner)).map((owner) => `el equipo ${owner} no esta en "teams"`);
}

const vipCountOf = (mission: Mission, team: TeamId): number => mission.units.filter((unit) => unit.vip && unit.team === team).length;

/** Los objetivos de cada equipo en su sitio, y unidades a escoltar solo en los equipos que escoltan. */
function objectiveProblemsOf(mission: Mission): string[] {
  const mapSize = mission.map.length;
  return mission.teams.flatMap((team, owner) => {
    const vipCount = vipCountOf(mission, owner);
    const problems = team.objective ? objectiveProblems(team.objective, { vipCount, mapSize }) : [];
    const escorts = team.objective?.kind === 'escort';
    return escorts || !vipCount ? problems : [...problems, `el equipo ${owner} tiene una unidad con "vip" pero no tiene que escoltarla`];
  });
}

/** Comprobaciones de un mapa de mision con ese contenido (para los tests). Devuelve los problemas encontrados. */
export function checkMission(mission: Mission, content: GameContent): string[] {
  const size = mission.map.length;
  if (!findEntry(content.themes, mission.theme)) return [`el tema "${mission.theme}" no existe (src/core/content/themes.json)`];
  return [
    ...(mission.map.some((row) => row.length !== size) ? ['el mapa no es cuadrado'] : []),
    ...buildingProblems(mission, content),
    ...unitProblems(mission, content),
    ...missingBases(mission, content),
    ...unknownTeams(mission),
    ...(mission.teams.some((team) => team.controller === 'human') ? [] : ['ningun equipo es de una persona']),
    ...objectiveProblemsOf(mission),
  ];
}
