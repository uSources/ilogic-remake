/**
 * Misiones de la campaña: mapas hechos a mano, objetivos y textos.
 *
 * Mapas en texto, una fila por linea (y), una letra por casilla (x):
 * Letras (las de cada tema en themes.json, "mapLetters"; las demas en terrain.json, "mapLetter"):
 *   .  suelo (hierba, arena o nieve segun el tema)   T  bosque (o cactus, o bosque nevado)
 *   M  acantilado                                     *  flores (o escarcha)
 *   ~  agua    ,  agua poco profunda    =  agua profunda    i  hielo
 *   P  bosque nevado    N  acantilado nevado
 * Equipos: `teams`, en orden, con quien juega cada uno (`controller`) y su dinero; el objetivo es
 * del equipo de la persona (su `owner`). Edificios: [tipo, dueño (numero de
 * equipo, null neutral), x, y]. Unidades: [tipo, equipo, x, y, vida?].
 * Objetivos: uno por entrada en `objectives.ts`.
 */
import { entryOf, findEntry, type GameContent, type TerrainType, type Theme } from './content';
import { settingsWith } from './matchSettings';

import { deepFreeze, type DeepReadonly } from './util/freeze';
import { newGameState } from './gameState';
import { posKey } from './geom';
import type { GameState, Pos, MatchSettings, TeamId } from './model';
import { objectiveFromMission, objectiveProblems, type MissionObjective } from './objectives';
import { newUnit } from './rules/lifecycle';
import type { TeamSetup } from './teams';
import { canMoveOn } from './rules/queries';

type Text = { es: string; en: string };
/** Nombre interno de un edificio (buildings.json). */
type BuildingName = string;
/** Nombre interno de una unidad (units.json). */
type UnitName = string;
type MissionBuilding = [type: BuildingName, owner: TeamId | null, x: number, y: number];
type MissionUnit = [type: UnitName, team: TeamId, x: number, y: number, life?: number];
/** Un equipo de la mision: quien lo juega y con cuanto dinero empieza. */
type MissionTeam = TeamSetup & { funds: number };

/** Una mision tal como se escribe aqui abajo (MISSION_DEFS). */
interface MissionSource {
  id: string;
  title: Text;
  brief: Text;
  /** Tema del mapa (id de themes.json): graficos, y el terreno de las letras que dependen de el. */
  theme: string;
  map: string[];
  buildings: MissionBuilding[];
  units: MissionUnit[];
  /** Los equipos, en orden (su puesto es el numero de equipo de edificios y unidades), y su dinero. */
  teams: MissionTeam[];
  /** El objetivo es del equipo que juega una persona (para los demas, perder si lo cumple). */
  objective: MissionObjective;
  /** Cambios a las reglas nuevas (por defecto, las nuevas con niebla). */
  settings?: Partial<MatchSettings>;
  /** Consejos paso a paso (solo el tutorial). */
  tutorial?: boolean;
}
/** Una mision de la campaña: de solo lectura (MISSIONS esta congelada). */
export type MissionDef = DeepReadonly<MissionSource>;

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

const missionTheme = (content: GameContent, mission: MissionDef): Theme => entryOf(content.themes, mission.theme, 'tema');

/** Terreno de una casilla del mapa en texto (filas = y). */
const missionTerrainAt = (content: GameContent, mission: MissionDef, pos: Pos) =>
  terrainOf(content, mission.map[pos.y]![pos.x]!, missionTheme(content, mission));

/** El mapa en texto (filas = y) como rejilla de terreno `map[x][y]`. */
function terrainGrid(content: GameContent, mission: MissionDef): GameState['map'] {
  const size = mission.map.length;
  const terrainKey = (pos: Pos) => missionTerrainAt(content, mission, pos).id;
  return Array.from({ length: size }, (_, x) => Array.from({ length: size }, (_, y) => terrainKey({ x, y })));
}

/** Pone las unidades de la mision y devuelve sus uid, en el orden de la lista. */
function placeUnits(s: GameState, units: MissionDef['units']): number[] {
  return units.map(([type, team, x, y, life]) => {
    const unit = newUnit(s, entryOf(s.content.units, type, 'unidad'), team, { x, y });
    if (life) unit.life = life;
    return unit.uid;
  });
}

/**
 * Crea la partida de una mision, con sus reglas (`missionSettings`) guardadas en la partida. `diceSeed`:
 * la semilla de sus dados (cada vez que se juega, la que diga quien la empieza).
 */
export function buildMission(mission: MissionDef, content: GameContent, diceSeed: number): GameState {
  const s = newGameState({
    map: terrainGrid(content, mission),
    settings: missionSettings(mission, content),
    content,
    mode: 'mission',
    theme: missionTheme(content, mission).id,
    teams: mission.teams,
    diceSeed,
  });
  for (const [type, owner, x, y] of mission.buildings)
    s.buildings.push({ type: entryOf(content.buildings, type, 'edificio').id, owner, x, y });
  const unitUids = placeUnits(s, mission.units);
  s.mission = { id: mission.id, objective: objectiveFromMission(mission.objective, missionTeam(mission), unitUids, content) };
  return s;
}

/** El equipo que juega la mision: el que lleva una persona (el dueño de su objetivo). */
export function missionTeam(mission: MissionDef): TeamId {
  const team = mission.teams.findIndex((candidate) => candidate.controller === 'human');
  if (team < 0) throw new Error(`La mision ${mission.id} no tiene ningun equipo para una persona`);
  return team;
}

/**
 * Las misiones estan ajustadas sin puntos de mando, mantenimiento ni clima (salvo que la mision los
 * pida). El dinero inicial de las reglas es el del equipo que la juega.
 */
export const missionSettings = (mission: MissionDef, content: GameContent): MatchSettings =>
  settingsWith(content, {
    commandPoints: null,
    upkeep: 0,
    weather: false,
    initialFunds: mission.teams[missionTeam(mission)]!.funds,
    ...mission.settings,
  });

function buildingProblems(mission: MissionDef, content: GameContent): string[] {
  const problems: string[] = [];
  const taken = new Set<string>();
  for (const [type, , x, y] of mission.buildings) {
    if (!findEntry(content.buildings, type)) problems.push(`edificio "${type}" no existe (src/core/content/buildings.json)`);
    if (!missionTerrainAt(content, mission, { x, y }).buildable) problems.push(`${type} en (${x},${y}) no esta sobre suelo`);
    if (taken.has(posKey({ x, y }))) problems.push(`dos edificios en (${x},${y})`);
    taken.add(posKey({ x, y }));
  }
  return problems;
}

function unitProblems(mission: MissionDef, content: GameContent): string[] {
  const problems: string[] = [];
  const taken = new Set<string>();
  for (const [name, , x, y] of mission.units) {
    const unitType = findEntry(content.units, name);
    if (!unitType) {
      problems.push(`unidad "${name}" no existe (src/core/content/units.json)`);
      continue;
    }
    if (!canMoveOn(unitType.movement, missionTerrainAt(content, mission, { x, y })))
      problems.push(`${name} en (${x},${y}) no puede estar en ese terreno`);
    if (taken.has(posKey({ x, y }))) problems.push(`dos unidades en (${x},${y})`);
    taken.add(posKey({ x, y }));
  }
  return problems;
}

function missingBases(mission: MissionDef, content: GameContent): string[] {
  const hasBase = (team: TeamId) => mission.buildings.some(([type, owner]) => type === content.hq.id && owner === team);
  const teams = mission.teams.map((_, team) => team);
  return teams.filter((team) => !hasBase(team)).map((team) => `falta la Base del equipo ${team}`);
}

/** Edificios y unidades de equipos que la mision no tiene. */
function unknownTeams(mission: MissionDef): string[] {
  const isTeam = (team: TeamId | null) => team === null || (team >= 0 && team < mission.teams.length);
  const owners = [...mission.buildings.map(([, owner]) => owner), ...mission.units.map(([, team]) => team)];
  return owners.filter((owner) => !isTeam(owner)).map((owner) => `el equipo ${owner} no esta en "teams"`);
}

/** Comprobaciones de un mapa de mision con ese contenido (para los tests). Devuelve los problemas encontrados. */
export function checkMission(mission: MissionDef, content: GameContent): string[] {
  const size = mission.map.length;
  if (!findEntry(content.themes, mission.theme)) return [`el tema "${mission.theme}" no existe (src/core/content/themes.json)`];
  return [
    ...(mission.map.some((row) => row.length !== size) ? ['el mapa no es cuadrado'] : []),
    ...buildingProblems(mission, content),
    ...unitProblems(mission, content),
    ...missingBases(mission, content),
    ...unknownTeams(mission),
    ...(mission.teams.some((team) => team.controller === 'human') ? [] : ['ningun equipo es de una persona']),
    ...objectiveProblems(mission.objective, { unitCount: mission.units.length, mapSize: size }),
  ];
}

const MISSION_DEFS: MissionSource[] = [
  {
    id: 'tutorial',
    tutorial: true,
    title: { es: 'Primeros pasos', en: 'First steps' },
    brief: {
      es: 'Aprende lo básico en un mapa pequeño: mover, capturar, comprar y atacar. Te iré diciendo qué hacer en cada paso.',
      en: 'Learn the basics on a small map: moving, capturing, buying and attacking. I will tell you what to do at each step.',
    },
    theme: 'Plains',
    map: [
      '~~~~~~~~~~~~~~~~',
      '~...TT.....*..~~',
      '~..TTT.........~',
      '~..T....M......~',
      '~.......M...TT.~',
      '~..*....MM..T..~',
      '~.......*......~',
      '~..TT..........~',
      '~..T......TT...~',
      '~.......*..T...~',
      '~....MM........~',
      '~.....M....T...~',
      '~..............~',
      '~.....TT.....*.~',
      '~~.....T.......~',
      '~~~~~~~~~~~~~~~~',
    ],
    buildings: [
      ['Base', 0, 2, 13],
      ['Factory', 0, 4, 13],
      ['City', 0, 2, 11],
      ['City', null, 4, 10],
      ['City', null, 9, 11],
      ['City', null, 6, 4],
      ['Base', 1, 13, 2],
      ['City', 1, 11, 3],
    ],
    units: [
      ['Soldier', 0, 3, 12],
      ['Soldier', 0, 1, 12],
      ['Soldier', 1, 10, 5, 50],
    ],
    teams: [
      { controller: 'human', funds: 6000 },
      { controller: 'ai', funds: 0 },
    ],
    objective: { kind: 'hq' },
  },
  {
    id: 'bridgehead',
    title: { es: 'Cabeza de puente', en: 'Bridgehead' },
    brief: {
      es: 'El río parte el valle en dos. Hazte con 6 ciudades antes de que acabe el día 14: la infantería cruza el agua poco profunda, los vehículos no.',
      en: 'The river splits the valley in two. Own 6 cities before day 14 ends: infantry can wade through shallow water, vehicles cannot.',
    },
    theme: 'Plains',
    map: [
      '....TT......,,......',
      '...TTT.....,,..T....',
      '..........,,..TTT...',
      '.*........,,........',
      '......M...,,....*...',
      '..TT..M....,,.......',
      '..T........,,...TT..',
      '............,,..T...',
      '....*.......,,......',
      '..........,,,,......',
      '..TT......,,.....TT.',
      '...T.....,,......T..',
      '.........,,..M......',
      '..M......,,..M...*..',
      '..M.....,,..........',
      '.......,,.....TT....',
      '..*....,,......T....',
      '......,,............',
      '..TT..,,.....*......',
      '......,,............',
    ],
    buildings: [
      ['Base', 0, 2, 17],
      ['Factory', 0, 4, 17],
      ['City', 0, 3, 15],
      ['City', null, 8, 13],
      ['City', null, 5, 10],
      ['City', null, 12, 16],
      ['City', null, 15, 12],
      ['City', null, 15, 8],
      ['City', null, 7, 3],
      ['City', null, 13, 3],
      ['City', null, 17, 2],
      ['Base', 1, 17, 1],
      ['Factory', 1, 18, 3],
      ['City', 1, 15, 3],
    ],
    units: [
      ['Soldier', 0, 1, 16],
      ['Soldier', 0, 3, 16],
      ['Soldier', 0, 5, 16],
      ['Car', 0, 5, 17],
      ['Soldier', 1, 13, 2],
      ['Soldier', 1, 12, 4],
      ['Tank', 1, 16, 4],
    ],
    teams: [
      { controller: 'human', funds: 4000 },
      { controller: 'ai', funds: 6000 },
    ],
    objective: { kind: 'capture', count: 6, type: 'City', days: 14 },
  },
  {
    id: 'hold',
    title: { es: 'Resistir', en: 'Hold the line' },
    brief: {
      es: 'Un ejército mucho mayor viene hacia tu Base. Aguanta hasta el final del día 8. Aprovecha el terreno y el contraataque: no salgas a buscarlos.',
      en: 'A much larger army is marching on your HQ. Hold out until the end of day 8. Use the terrain and counterattacks: let them come to you.',
    },
    theme: 'Desert',
    map: [
      '..........TT........',
      '....T.....T.....M...',
      '...TT...........M...',
      '...........*........',
      '......MM............',
      '.......M.....TT.....',
      '..T..........T......',
      '..TT.......*........',
      '........M...........',
      '........M......TT...',
      '..*.............T...',
      '.....TT.............',
      '.....T.....M........',
      '...........M....*...',
      '.M...............T..',
      '.M......TT.......T..',
      '........T...........',
      '...*................',
      '.......MM.....T.....',
      '..............T.....',
    ],
    buildings: [
      ['Base', 0, 2, 17],
      ['Factory', 0, 4, 18],
      ['City', 0, 2, 15],
      ['City', 0, 6, 16],
      ['City', null, 10, 10],
      ['City', null, 12, 6],
      ['Base', 1, 17, 2],
      ['Factory', 1, 15, 1],
      ['Airport', 1, 18, 4],
      ['City', 1, 13, 3],
    ],
    units: [
      ['Tank', 0, 4, 15],
      ['Tank', 0, 7, 14],
      ['Artillery', 0, 3, 16],
      ['Soldier', 0, 5, 13],
      ['Soldier', 0, 8, 15],
      ['Antiair', 0, 6, 15],
      ['Tank', 1, 14, 6],
      ['Tank', 1, 12, 8],
      ['Tank', 1, 16, 7],
      ['LTank', 1, 10, 5],
      ['Soldier', 1, 13, 9],
      ['Soldier', 1, 11, 11],
      ['Soldier', 1, 15, 10],
      ['Soldier', 1, 9, 7],
      ['Artillery', 1, 16, 4],
      ['Artillery', 1, 18, 6],
    ],
    teams: [
      { controller: 'human', funds: 6000 },
      { controller: 'ai', funds: 15000 },
    ],
    objective: { kind: 'survive', days: 8 },
  },
  {
    id: 'escort',
    title: { es: 'Convoy', en: 'Convoy' },
    brief: {
      es: 'Lleva el camión de suministros (el que tiene la flecha) hasta la ciudad del noreste antes de que acabe el día 12. Si lo destruyen, se acabó.',
      en: 'Take the supply truck to the city in the north-east before day 12 ends. If it is destroyed, the mission is over.',
    },
    theme: 'Forest',
    map: [
      '..TT..TTTT..TT......',
      '.TT...TTTT...T......',
      '.....TTT.......TTT..',
      '..*..........TTTT...',
      '....TT..M.....TT....',
      '...TTT..M...........',
      '.......MM...TT...*..',
      '..TT.........T......',
      '..TTT....*........TT',
      '......TT.....M....T.',
      '.....TTT.....M......',
      '..M.........TTT.....',
      '..M...*......T....*.',
      '.....TT.............',
      '....TTT...M....TT...',
      '..........M...TTT...',
      '.TT.....*.......T...',
      '.T..........TT......',
      '...........TTT..*...',
      '....TT..............',
    ],
    buildings: [
      ['Base', 0, 1, 19],
      ['Factory', 0, 3, 18],
      ['City', null, 18, 2],
      ['City', null, 9, 9],
      ['City', null, 3, 13],
      ['Base', 1, 17, 0],
      ['Factory', 1, 19, 1],
      ['City', 1, 12, 3],
    ],
    units: [
      ['Supplier', 0, 2, 17],
      ['Tank', 0, 3, 16],
      ['Tank', 0, 4, 17],
      ['Soldier', 0, 1, 15],
      ['Antiair', 0, 5, 18],
      ['Tank', 1, 10, 8],
      ['Tank', 1, 14, 11],
      ['Soldier', 1, 8, 12],
      ['Soldier', 1, 12, 5],
      ['Artillery', 1, 15, 6],
      ['LTank', 1, 16, 9],
    ],
    teams: [
      { controller: 'human', funds: 5000 },
      { controller: 'ai', funds: 8000 },
    ],
    objective: { kind: 'escort', vip: 0, to: { x: 18, y: 2 }, days: 12 },
  },
  {
    id: 'cleanup',
    title: { es: 'Limpieza', en: 'Clean sweep' },
    brief: {
      es: 'Los restos de un ejército enemigo resisten en la nieve, sin fábricas. Destruye todas sus unidades antes de que acabe el día 10.',
      en: 'The remains of an enemy army hold out in the snow, with no factories. Destroy all their units before day 10 ends.',
    },
    theme: 'Snowy',
    map: [
      'iii.......PP....iiii',
      'ii.....*..P.......ii',
      'i...PP.........*...i',
      '....P.....NN.......i',
      '..........N.........',
      '..*...........PP....',
      '......PP.......P....',
      '.......P...*........',
      '...N..........N.....',
      '...N...........N....',
      '........PP..........',
      '..*......P.....*....',
      '..............PP....',
      '....PP...N.....P....',
      '.....P...N..........',
      '..........*.....PP..',
      'i...*...........P..i',
      'ii....PP...........i',
      'iii....P......*...ii',
      'iiii.............iii',
    ],
    buildings: [
      ['Base', 0, 2, 16],
      ['Factory', 0, 4, 15],
      ['City', 0, 3, 13],
      ['Airport', 0, 6, 16],
      ['Base', 1, 17, 3],
    ],
    units: [
      ['Tank', 0, 5, 14],
      ['Tank', 0, 4, 12],
      ['Artillery', 0, 2, 14],
      ['Soldier', 0, 6, 13],
      ['Soldier', 1, 13, 5],
      ['Soldier', 1, 15, 8],
      ['Tank', 1, 11, 7],
      ['Tank', 1, 16, 11],
      ['Artillery', 1, 14, 2],
      ['Antiair', 1, 12, 10],
      ['LTank', 1, 17, 13],
      ['Soldier', 1, 10, 15],
    ],
    teams: [
      { controller: 'human', funds: 10000 },
      { controller: 'ai', funds: 0 },
    ],
    objective: { kind: 'destroy', days: 10 },
  },
  {
    id: 'assault',
    title: { es: 'Asalto final', en: 'Final assault' },
    brief: {
      es: 'El enemigo tiene más dinero y se ha atrincherado tras los pantanos. Conquista su Base.',
      en: 'The enemy has more money and has dug in behind the swamps. Take their HQ.',
    },
    theme: 'Swamp',
    map: [
      '....,,......TT......',
      '...,,..*.....T...TT.',
      '..,,..............T.',
      '.,,....TT.....M.....',
      ',,.....T......M..*..',
      '......,,............',
      '..*..,,....TT.......',
      '.....,,....T.....,,.',
      '......,,........,,..',
      '..TT...,,......,,...',
      '..T.....,,....,,..*.',
      '.........,,..,,.....',
      '....*.....,,,,......',
      '..M........,,...TT..',
      '..M.........,,..T...',
      '.......TT....,,.....',
      '..*....T......,,....',
      '...............,,...',
      '.TT....*........,,..',
      '.T...............,,.',
    ],
    buildings: [
      ['Base', 0, 2, 17],
      ['Factory', 0, 4, 18],
      ['City', 0, 3, 15],
      ['Airport', 0, 6, 16],
      ['City', null, 9, 6],
      ['City', null, 14, 9],
      ['City', null, 6, 12],
      ['City', null, 15, 13],
      ['City', null, 11, 17],
      ['City', null, 4, 3],
      ['Oil', null, 9, 15],
      ['Stronghold', null, 10, 8],
      ['Base', 1, 17, 2],
      ['Factory', 1, 15, 1],
      ['City', 1, 18, 4],
      ['Airport', 1, 13, 2],
    ],
    units: [
      ['Soldier', 0, 3, 16],
      ['Soldier', 0, 5, 17],
      ['Tank', 0, 5, 15],
      ['Soldier', 1, 16, 3],
      ['Soldier', 1, 14, 4],
      ['Tank', 1, 16, 2],
    ],
    teams: [
      { controller: 'human', funds: 8000 },
      { controller: 'ai', funds: 14000 },
    ],
    objective: { kind: 'hq' },
  },
];
/** Las misiones de la campaña, congeladas: nadie las cambia mientras se juega (ni el tipo deja). */
export const MISSIONS: readonly MissionDef[] = deepFreeze(MISSION_DEFS);

export const missionById = (id: string): MissionDef | undefined => MISSIONS.find((mission) => mission.id === id);
