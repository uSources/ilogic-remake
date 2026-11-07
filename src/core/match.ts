/**
 * Empezar una partida: lo que se elige de ella (`MatchConfig`, datos que se pueden guardar o mandar)
 * y como se prepara (`buildMatch`). Hay una forma de configurarla por modo de juego (el `mode` de la
 * configuracion es el de `GAME_MODES`, core/modes.ts) y una forma de prepararla por modo
 * (`MATCH_SETUPS`, aqui: necesita el generador de mapas y las misiones, que no son de las reglas).
 * Un modo nuevo es su entrada en GAME_MODES (como se juega), su configuracion en `MatchConfig` y su
 * entrada en MATCH_SETUPS (el tipo obliga). La pantalla, la partida por texto, las herramientas y
 * los tests empiezan sus partidas por aqui; las que se cargan, por `readSave`.
 */
import { entryOf, type GameContent } from './content';
import { appointGeneral } from './generals';
import { changeSettings, newGameState } from './gameState';
import { generateGame } from './mapgen';
import { gameModeOf, type GameModeRegistry } from './modes';
import { blankMap } from './mapGrid';
import { buildMission, missionById } from './missions';
import { assertAllStanding } from './rules/falls';
import { newUnit } from './rules/lifecycle';
import { settingsWith } from './matchSettings';
import { hooksOf } from './ruleModules/ruleset';
import { sampleArmy } from './stats';
import { matchSeedsFrom, seededRng } from './util/random';
import type { GameModeId, GameSetup, GameState, Pos, Rng, MatchSettings, TeamId } from './model';
import { teamIds, type TeamSetup } from './teams';

/** Un equipo de una partida nueva: quien lo juega, su alianza, su dinero y su general (id de generals.json, o ninguno). */
export interface MatchTeam extends TeamSetup {
  general?: string | null;
}

/** Escaramuza: un mapa al azar (el de `map.seed`, de su lado y tema) con estas reglas y estos equipos. */
export interface SkirmishConfig {
  mode: 'skirmish';
  map: GameSetup;
  /** Cambios a las reglas por defecto del contenido (sin cambios, las de siempre). */
  settingChanges?: Partial<MatchSettings>;
  teams: readonly MatchTeam[];
  /** El equipo que juega primero cada ronda (si no, el primero de la lista). */
  firstTeam?: TeamId;
  /**
   * Con dos equipos, cada uno empieza donde le tocaba al otro (sus unidades y sus edificios): para
   * medir si el mapa favorece a un lado (la herramienta de equilibrio). La revancha no lo repite.
   */
  swapStarts?: true;
}

/**
 * Una mision de la campaña (por su id), con su mapa, sus equipos y sus reglas; `seed`, la de su azar
 * (de ella salen las de sus dados y las de las decisiones de la IA: `matchSeedsFrom`).
 */
export interface MissionConfig {
  mode: 'mission';
  mission: string;
  seed: number;
}

/** Algo en una casilla de una partida preparada a mano: un edificio (de un equipo o de nadie) o una unidad. */
export interface PlacedBuilding {
  type: string;
  owner: TeamId | null;
  at: Pos;
}
export interface PlacedUnit {
  type: string;
  team: TeamId;
  at: Pos;
  life?: number;
}

/**
 * Una partida preparada a mano para mirar algo (el laboratorio de animaciones): un campo llano de
 * `size` casillas con esos edificios y esas unidades. No se acaba sola (GAME_MODES.sandbox).
 */
export interface SandboxConfig {
  mode: 'sandbox';
  size: number;
  settingChanges?: Partial<MatchSettings>;
  teams: readonly MatchTeam[];
  buildings: readonly PlacedBuilding[];
  units: readonly PlacedUnit[];
  /** La semilla de su azar (sus dados y las decisiones de la IA: `matchSeedsFrom`). */
  seed: number;
}

/** Como empieza una partida nueva, en cualquier modo. */
export type MatchConfig = SkirmishConfig | MissionConfig | SandboxConfig;
export type MatchConfigOf<M extends GameModeId> = Extract<MatchConfig, { mode: M }>;

/**
 * Lo que da quien prepara la partida: su contenido y, si quiere seguir tirando del mismo azar despues
 * (las herramientas y las partidas de referencia, que juegan la IA con el), el del generador de mapas.
 * Si no, el mapa sale de su semilla (`seededRng(map.seed)`).
 */
export interface MatchSetupContext {
  content: GameContent;
  mapRng?: Rng;
  /** Los modos que se conocen (si no, los del juego: GAME_MODES): un modo de prueba o de un servidor. */
  modes?: GameModeRegistry;
}

type MatchSetup<M extends GameModeId> = (config: MatchConfigOf<M>, context: MatchSetupContext) => GameState;

/** Lado del mapa al azar si no se dice otro (el de 2013). */
export const DEFAULT_MAP_SIZE = 32;

/** Los generales de cada equipo (los que no dicen ninguno se quedan sin general). */
function appointGenerals(s: GameState, teams: readonly MatchTeam[]): void {
  teams.forEach((team, id) => appointGeneral(s, id, team.general));
}

function skirmish(config: SkirmishConfig, { content, mapRng, modes }: MatchSetupContext): GameState {
  const { map } = config;
  const theme = map.theme === null ? null : entryOf(content.themes, map.theme, 'tema');
  const s = generateGame(mapRng ?? seededRng(map.seed), {
    size: map.size,
    theme,
    settings: settingsWith(content, config.settingChanges ?? {}),
    content,
    teams: config.teams,
    firstTeam: config.firstTeam,
    modes,
  });
  s.setup = { ...map };
  if (config.swapStarts) swapStarts(s);
  appointGenerals(s, config.teams);
  return s;
}

/** Cada uno de los dos equipos se queda con las unidades y los edificios con los que empezaba el otro. */
function swapStarts(s: GameState): void {
  const [first, second, ...more] = teamIds(s);
  if (first === undefined || second === undefined || more.length)
    throw new Error(`Cambiar de sitio es para dos equipos (hay ${s.teams.length})`);
  const other = (team: TeamId): TeamId => (team === first ? second : first);
  for (const unit of s.units) unit.team = other(unit.team);
  for (const building of s.buildings) if (building.owner !== null) building.owner = other(building.owner);
}

function mission(config: MissionConfig, { content, modes }: MatchSetupContext): GameState {
  const found = missionById(content, config.mission);
  if (!found) throw new Error(`No existe la mision "${config.mission}"`);
  return buildMission(found, content, matchSeedsFrom(config.seed), modes);
}

function sandbox(config: SandboxConfig, { content, modes }: MatchSetupContext): GameState {
  const s = newGameState({
    modes,
    map: blankMap(config.size, content.plainTerrain.id),
    settings: settingsWith(content, config.settingChanges ?? {}),
    content,
    mode: 'sandbox',
    teams: config.teams,
    seeds: matchSeedsFrom(config.seed),
  });
  for (const building of config.buildings)
    s.buildings.push({ type: entryOf(content.buildings, building.type, 'edificio').id, owner: building.owner, ...building.at });
  for (const placed of config.units) {
    const unit = newUnit(s, entryOf(content.units, placed.type, 'unidad'), placed.team, placed.at);
    if (placed.life !== undefined) unit.life = placed.life;
  }
  appointGenerals(s, config.teams);
  return s;
}

/** Como se prepara cada modo que se configura con un `MatchConfig` (el tipo obliga a tener uno por cada uno). */
export const MATCH_SETUPS: { readonly [M in MatchConfig['mode']]: MatchSetup<M> } = { skirmish, mission, sandbox };

/** La preparacion del modo de la configuracion. */
function setupOf(config: MatchConfig): (config: MatchConfig, context: MatchSetupContext) => GameState {
  // TypeScript no sabe que la entrada de cada modo recibe la configuracion de ese mismo modo.
  return MATCH_SETUPS[config.mode] as (config: MatchConfig, context: MatchSetupContext) => GameState;
}

/** Las reglas que impone el modo de la partida, por encima de las elegidas (GameMode.fixedSettings). */
function imposeModeSettings(s: GameState, content: GameContent): void {
  const fixed = gameModeOf(s).fixedSettings;
  if (fixed) changeSettings(s, settingsWith(content, { ...s.settings, ...fixed }));
}

/**
 * La partida nueva de esa configuracion, lista para jugar: con su modo, sus equipos, lo que
 * preparan sus modulos de reglas (el clima del primer dia) y la muestra del ejercito de ese dia (para la grafica del final). El primer equipo aun
 * no ha empezado su turno (lo empieza quien la juega: la sesion, 'startTurn').
 */
export function buildMatch(config: MatchConfig, context: MatchSetupContext): GameState {
  const s = setupOf(config)(config, context);
  assertAllStanding(s);
  imposeModeSettings(s, context.content);
  for (const step of hooksOf(s, 'matchSetup')) step.run(s);
  sampleArmy(s);
  return s;
}

/**
 * La revancha de una escaramuza: el mismo mapa, las mismas reglas y los mismos equipos con sus
 * generales (null si no es una escaramuza o no se sabe su mapa).
 */
export function rematchOf(s: GameState): SkirmishConfig | null {
  if (s.mode !== 'skirmish' || !s.setup) return null;
  const teams = s.teams.map((team) => ({ controller: team.controller, alliance: team.alliance, general: team.general?.id ?? null }));
  return { mode: 'skirmish', map: { ...s.setup }, settingChanges: { ...s.settings }, teams, firstTeam: s.turnOrder[0] };
}

/** Lo que se elige de una escaramuza; lo demas, lo de siempre (mapa de DEFAULT_MAP_SIZE, tema al azar, reglas por defecto). */
export interface SkirmishChoices {
  /** Semilla del mapa (el codigo de mapa de la pantalla). */
  seed: number;
  size?: number;
  theme?: string | null;
  settingChanges?: Partial<MatchSettings>;
  teams: readonly MatchTeam[];
  firstTeam?: TeamId;
}

/**
 * Una escaramuza con lo de siempre en lo que no se elige: lo mismo en la pantalla, la partida por
 * texto y las herramientas (K4: la misma semilla da la misma partida en todas).
 */
export function skirmishConfig({ seed, size, theme, settingChanges, teams, firstTeam }: SkirmishChoices): SkirmishConfig {
  const map = { seed, size: size ?? DEFAULT_MAP_SIZE, theme: theme ?? null };
  return { mode: 'skirmish', map, settingChanges, teams, ...(firstTeam === undefined ? {} : { firstTeam }) };
}
