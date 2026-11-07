/**
 * Misiones de la campaña (missions.json): mapas hechos a mano, equipos, objetivos y textos. Aqui se
 * comprueba lo que dice el fichero (ids, textos, el tema, los tipos de edificios y unidades, los
 * equipos y la forma del objetivo); lo que solo se ve con el mapa entero (bases conectadas, nada
 * sobre un terreno en el que no puede estar) lo mira `checkMission` (core/missions/check.ts).
 *
 * Mapas en texto, una fila por linea (y), una letra por casilla (x): las de cada tema en themes.json
 * ("mapLetters") y las demas en terrain.json ("mapLetter"). Edificios: [tipo, dueño (numero de
 * equipo, null neutral), x, y]. Unidades: [tipo, equipo, x, y, vida?]. Ver docs/CONTENIDO.md.
 */
import type { ControllerKind, MatchSettings, Pos, TeamId } from '../model';
import { MAX_LIFE } from '../data';
import { uniqueIds, type Checker, type Scope } from './check';
import type { ContentContext, Texts } from './types';

/** El objetivo tal como se escribe en una mision: por nombre de edificio y por indice de unidad. */
export type MissionObjective =
  | { kind: 'hq' }
  | { kind: 'survive'; days: number }
  | { kind: 'capture'; count: number; type: string | null; days: number }
  | { kind: 'destroy'; days: number }
  /** `vip` es el indice en `units` de la mision de la unidad a escoltar. */
  | { kind: 'escort'; vip: number; to: Pos; days: number };

export type MissionBuilding = [type: string, owner: TeamId | null, x: number, y: number];
export type MissionUnit = [type: string, team: TeamId, x: number, y: number, life?: number];

/** Un equipo de la mision: quien lo juega y con cuanto dinero empieza. */
export interface MissionTeam {
  controller: ControllerKind;
  funds: number;
}

/** Una mision tal como esta en missions.json. */
export interface MissionDef {
  id: string;
  title: Texts;
  brief: Texts;
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

/** Quien puede jugar un equipo de una mision (los de `ControllerKind`). */
const MISSION_CONTROLLERS: readonly ControllerKind[] = ['human', 'ai'];

/** Lo que hace falta para comprobar una mision: los ids del contenido y cuantos equipos tiene. */
interface MissionContext extends ContentContext {
  teamCount: number;
}

const isTeamIn = (context: MissionContext, team: unknown): boolean =>
  Number.isInteger(team) && (team as number) >= 0 && (team as number) < context.teamCount;

/** Una casilla de la lista: dos enteros no negativos (que este dentro del mapa lo mira checkMission). */
const isTile = (x: unknown, y: unknown): boolean => [x, y].every((value) => Number.isInteger(value) && (value as number) >= 0);

function validateBuildingsOf(scope: Scope, context: MissionContext, buildings: unknown): void {
  if (!scope.expect(Array.isArray(buildings), 'buildings tiene que ser una lista')) return;
  for (const [type, owner, x, y] of buildings as unknown[][]) {
    scope.known('buildings', type, context.buildingIds, 'el edificio ');
    scope.expect(owner === null || isTeamIn(context, owner), `el dueño de ${String(type)} (${String(owner)}) no esta en "teams"`);
    scope.expect(isTile(x, y), `${String(type)}: casilla no valida`);
  }
}

function validateUnitsOf(scope: Scope, context: MissionContext, units: unknown): void {
  if (!scope.expect(Array.isArray(units), 'units tiene que ser una lista')) return;
  for (const [type, team, x, y, life] of units as unknown[][]) {
    scope.known('units', type, context.unitIds, 'la unidad ');
    scope.expect(isTeamIn(context, team), `el equipo de ${String(type)} (${String(team)}) no esta en "teams"`);
    scope.expect(isTile(x, y), `${String(type)}: casilla no valida`);
    if (life !== undefined) scope.num(`vida de ${String(type)}`, life, { min: 1, max: MAX_LIFE, int: true });
  }
}

function validateTeamsOf(scope: Scope, teams: unknown): boolean {
  if (!scope.expect(Array.isArray(teams) && teams.length >= 2, 'teams: al menos dos equipos')) return false;
  for (const team of teams as Partial<MissionTeam>[]) {
    scope.known('controller', team?.controller, MISSION_CONTROLLERS, 'el controlador ');
    scope.num('funds', team?.funds, { min: 0, int: true });
  }
  return true;
}

function validateMission(check: Checker, context: ContentContext, mission: Partial<MissionDef>): void {
  const scope = check.scope(`mision ${String(mission?.id)}`);
  scope.texts('title', mission?.title);
  scope.texts('brief', mission?.brief);
  scope.known('theme', mission?.theme, context.themeIds, 'el tema ');
  scope.expect(Array.isArray(mission?.map) && mission.map.every((row) => typeof row === 'string'), 'map tiene que ser una lista de filas');
  if (!validateTeamsOf(scope, mission?.teams)) return;
  const missionContext: MissionContext = { ...context, teamCount: mission.teams!.length };
  validateBuildingsOf(scope, missionContext, mission.buildings);
  validateUnitsOf(scope, missionContext, mission.units);
  scope.expect(typeof mission.objective?.kind === 'string', 'objective tiene que tener un "kind"');
}

/** Comprueba missions.json: una lista de misiones sin ids repetidos, cada una bien escrita. */
export function validateMissions(list: readonly MissionDef[], context: ContentContext, check: Checker): void {
  if (!check.scope('missions.json').expect(Array.isArray(list), 'tiene que tener una lista "missions"')) return;
  uniqueIds(check, 'mision', list);
  for (const mission of list) validateMission(check, context, mission);
}
