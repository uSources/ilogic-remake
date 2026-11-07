/**
 * Misiones de la campaña (missions.json): mapas hechos a mano, equipos, objetivos y textos. Aqui se
 * comprueba lo que dice el fichero (ids, textos, el tema, los tipos de edificios y unidades, los
 * equipos y la forma del objetivo); lo que solo se ve con el mapa entero (bases conectadas, nada
 * sobre un terreno en el que no puede estar) lo mira `checkMission` (core/missions/check.ts).
 *
 * Mapas en texto, una fila por linea (y), una letra por casilla (x): las de cada tema en themes.json
 * ("mapLetters") y las demas en terrain.json ("mapLetter"). Edificios: { type, owner (numero de
 * equipo, null neutral), at }. Unidades: { type, team, at, life?, vip? }. Ver docs/CONTENIDO.md.
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
  /** Llevar a `to` la unidad de su equipo marcada con `vip` (MissionUnit.vip). */
  | { kind: 'escort'; to: Pos; days: number };

/** Un edificio de la mision: su tipo, su dueño (numero de equipo, null neutral) y su casilla. */
export interface MissionBuilding {
  type: string;
  owner: TeamId | null;
  at: Pos;
}

/** Una unidad de la mision: su tipo, su equipo, su casilla y, si no, su vida entera. */
export interface MissionUnit {
  type: string;
  team: TeamId;
  at: Pos;
  life?: number;
  /** Es la que tiene que escoltar su equipo (su objetivo "escort"). */
  vip?: true;
}

/**
 * Un equipo de la mision: quien lo juega, con cuanto dinero empieza y, si lo tiene, su objetivo (si
 * lo cumple gana su alianza; si falla, sus enemigos). Cada equipo tiene el suyo o ninguno, asi que
 * caben misiones con varias personas (por turnos o por la red) o con objetivos para la IA.
 */
export interface MissionTeam {
  controller: ControllerKind;
  funds: number;
  objective?: MissionObjective;
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
  /** Los equipos, en orden (su puesto es el numero de equipo de edificios y unidades), su dinero y sus objetivos. */
  teams: MissionTeam[];
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
const isTile = (at: unknown): boolean =>
  typeof at === 'object' &&
  at !== null &&
  [(at as Partial<Pos>).x, (at as Partial<Pos>).y].every((value) => Number.isInteger(value) && (value as number) >= 0);

function validateBuildingsOf(scope: Scope, context: MissionContext, buildings: unknown): void {
  if (!scope.expect(Array.isArray(buildings), 'buildings tiene que ser una lista')) return;
  for (const { type, owner, at } of buildings as Partial<MissionBuilding>[]) {
    scope.known('buildings', type, context.buildingIds, 'el edificio ');
    scope.expect(owner === null || isTeamIn(context, owner), `el dueño de ${String(type)} (${String(owner)}) no esta en "teams"`);
    scope.expect(isTile(at), `${String(type)}: casilla no valida`);
  }
}

function validateUnitsOf(scope: Scope, context: MissionContext, units: unknown): void {
  if (!scope.expect(Array.isArray(units), 'units tiene que ser una lista')) return;
  for (const { type, team, at, life, vip } of units as Partial<MissionUnit>[]) {
    scope.known('units', type, context.unitIds, 'la unidad ');
    scope.expect(isTeamIn(context, team), `el equipo de ${String(type)} (${String(team)}) no esta en "teams"`);
    scope.expect(isTile(at), `${String(type)}: casilla no valida`);
    if (life !== undefined) scope.num(`vida de ${String(type)}`, life, { min: 1, max: MAX_LIFE, int: true });
    if (vip !== undefined) scope.expect(vip === true, `vip de ${String(type)}: solo true (o nada)`);
  }
}

function validateTeamsOf(scope: Scope, teams: unknown): boolean {
  if (!scope.expect(Array.isArray(teams) && teams.length >= 2, 'teams: al menos dos equipos')) return false;
  for (const team of teams as Partial<MissionTeam>[]) {
    scope.known('controller', team?.controller, MISSION_CONTROLLERS, 'el controlador ');
    scope.num('funds', team?.funds, { min: 0, int: true });
    if (team?.objective !== undefined) scope.expect(typeof team.objective?.kind === 'string', 'objective tiene que tener un "kind"');
  }
  // Una mision sin objetivos no la gana nadie hasta quedarse solo: la partida guardada tampoco la acepta.
  scope.expect(
    (teams as Partial<MissionTeam>[]).some((team) => team?.objective !== undefined),
    'algun equipo tiene que tener un objetivo',
  );
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
}

/** Comprueba missions.json: una lista de misiones sin ids repetidos, cada una bien escrita. */
export function validateMissions(list: readonly MissionDef[], context: ContentContext, check: Checker): void {
  if (!check.scope('missions.json').expect(Array.isArray(list), 'tiene que tener una lista "missions"')) return;
  uniqueIds(check, 'mision', list);
  for (const mission of list) validateMission(check, context, mission);
}
