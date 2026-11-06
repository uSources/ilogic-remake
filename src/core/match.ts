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
import { newGameState } from './gameState';
import { generateGame } from './mapgen';
import { gameModeOf } from './modes';
import { blankMap } from './mapGrid';
import { buildMission, missionById } from './missions';
import { newUnit } from './rules/lifecycle';
import { rulesWith } from './rulesConfig';
import { sampleArmy } from './stats';
import { seededRng } from './util/random';
import { ensureWeather } from './weather';
import type { GameModeId, GameSetup, GameState, Pos, Rng, RulesConfig, TeamId } from './model';
import type { TeamSetup } from './teams';

/** Un equipo de una partida nueva: quien lo juega, su alianza, su dinero y su general (id de generals.json, o ninguno). */
export interface MatchTeam extends TeamSetup {
  general?: string | null;
}

/** Escaramuza: un mapa al azar (el de `map.seed`, de su lado y tema) con estas reglas y estos equipos. */
export interface SkirmishConfig {
  mode: 'skirmish';
  map: GameSetup;
  /** Cambios a las reglas por defecto del contenido (sin cambios, las de siempre). */
  ruleChanges?: Partial<RulesConfig>;
  teams: readonly MatchTeam[];
  /** El equipo que juega primero cada ronda (si no, el primero de la lista). */
  firstTeam?: TeamId;
  /**
   * Con dos equipos, cada uno empieza donde le tocaba al otro (sus unidades y sus edificios): para
   * medir si el mapa favorece a un lado (la herramienta de equilibrio). La revancha no lo repite.
   */
  swapStarts?: true;
}

/** Una mision de la campaña (por su id), con su mapa, sus equipos y sus reglas; `diceSeed`, la de sus dados. */
export interface MissionConfig {
  mode: 'mission';
  mission: string;
  diceSeed: number;
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
  ruleChanges?: Partial<RulesConfig>;
  teams: readonly MatchTeam[];
  buildings: readonly PlacedBuilding[];
  units: readonly PlacedUnit[];
  diceSeed: number;
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
}

type MatchSetup<M extends GameModeId> = (config: MatchConfigOf<M>, context: MatchSetupContext) => GameState;

/** Lado del mapa al azar si no se dice otro (el de 2013). */
export const DEFAULT_MAP_SIZE = 32;

/** Los generales de cada equipo (los que no dicen ninguno se quedan sin general). */
function appointGenerals(s: GameState, teams: readonly MatchTeam[]): void {
  teams.forEach((team, id) => appointGeneral(s, id, team.general));
}

function skirmish(config: SkirmishConfig, { content, mapRng }: MatchSetupContext): GameState {
  const { map } = config;
  const theme = map.theme === null ? null : entryOf(content.themes, map.theme, 'tema');
  const s = generateGame(mapRng ?? seededRng(map.seed), {
    size: map.size,
    theme,
    rules: rulesWith(content, config.ruleChanges ?? {}),
    content,
    teams: config.teams,
    firstTeam: config.firstTeam,
  });
  s.setup = { ...map };
  if (config.swapStarts) swapStarts(s);
  appointGenerals(s, config.teams);
  return s;
}

/** Cada uno de los dos equipos se queda con las unidades y los edificios con los que empezaba el otro. */
function swapStarts(s: GameState): void {
  if (s.teams.length !== 2) throw new Error(`Cambiar de sitio es para dos equipos (hay ${s.teams.length})`);
  const other = (team: TeamId): TeamId => 1 - team;
  for (const unit of s.units) unit.team = other(unit.team);
  for (const building of s.buildings) if (building.owner !== null) building.owner = other(building.owner);
}

function mission(config: MissionConfig, { content }: MatchSetupContext): GameState {
  const found = missionById(config.mission);
  if (!found) throw new Error(`No existe la mision "${config.mission}"`);
  return buildMission(found, content, config.diceSeed);
}

function sandbox(config: SandboxConfig, { content }: MatchSetupContext): GameState {
  const s = newGameState({
    map: blankMap(config.size, content.plainTerrain.id),
    rules: rulesWith(content, config.ruleChanges ?? {}),
    content,
    mode: 'sandbox',
    teams: config.teams,
    diceSeed: config.diceSeed,
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

/** Como se prepara cada modo (el tipo obliga a tener uno por modo de GAME_MODES). */
export const MATCH_SETUPS: { readonly [M in GameModeId]: MatchSetup<M> } = { skirmish, mission, sandbox };

/** La preparacion del modo de la configuracion. */
function setupOf(config: MatchConfig): (config: MatchConfig, context: MatchSetupContext) => GameState {
  // TypeScript no sabe que la entrada de cada modo recibe la configuracion de ese mismo modo.
  return MATCH_SETUPS[config.mode] as (config: MatchConfig, context: MatchSetupContext) => GameState;
}

/** Las reglas que impone el modo de la partida, por encima de las elegidas (GameMode.fixedRules). */
function imposeModeRules(s: GameState, content: GameContent): void {
  const fixed = gameModeOf(s).fixedRules;
  if (fixed) s.rules = rulesWith(content, { ...s.rules, ...fixed });
}

/**
 * La partida nueva de esa configuracion, lista para jugar: con su modo, sus equipos, el clima del
 * primer dia y la muestra del ejercito de ese dia (para la grafica del final). El primer equipo aun
 * no ha empezado su turno (lo empieza quien la juega: la sesion, 'startTurn').
 */
export function buildMatch(config: MatchConfig, context: MatchSetupContext): GameState {
  const s = setupOf(config)(config, context);
  imposeModeRules(s, context.content);
  ensureWeather(s);
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
  return { mode: 'skirmish', map: { ...s.setup }, ruleChanges: { ...s.rules }, teams, firstTeam: s.turnOrder[0] };
}

/** Lo que se elige de una escaramuza; lo demas, lo de siempre (mapa de DEFAULT_MAP_SIZE, tema al azar, reglas por defecto). */
export interface SkirmishChoices {
  /** Semilla del mapa (el codigo de mapa de la pantalla). */
  seed: number;
  size?: number;
  theme?: string | null;
  ruleChanges?: Partial<RulesConfig>;
  teams: readonly MatchTeam[];
  firstTeam?: TeamId;
}

/**
 * Una escaramuza con lo de siempre en lo que no se elige: lo mismo en la pantalla, la partida por
 * texto y las herramientas (K4: la misma semilla da la misma partida en todas).
 */
export function skirmishConfig({ seed, size, theme, ruleChanges, teams, firstTeam }: SkirmishChoices): SkirmishConfig {
  const map = { seed, size: size ?? DEFAULT_MAP_SIZE, theme: theme ?? null };
  return { mode: 'skirmish', map, ruleChanges, teams, ...(firstTeam === undefined ? {} : { firstTeam }) };
}
