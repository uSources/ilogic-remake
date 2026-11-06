/**
 * Las partes de una partida guardada, una a una: si estan bien (las que la partida necesita) o como
 * se limpian (las opcionales: lo roto se quita y la partida sigue sin ello). Trabajan sobre el JSON
 * ya leido (`SavedGame`, sin comprobar) y lo dejan con la forma de `GameState`; las junta save.ts
 * (`readSave`), que es quien dice que error ha habido.
 */
import { findEntry, isEntryId, type GameContent } from './content';
import { MAP_MAX, MAP_MIN, MAX_LIFE } from './data';
import { isValidObjective, type SavedMap } from './objectives';
import { isUnitTurnState } from './rules/unitTurn';
import { SQUAD_KEYS } from './squads/naming';
import { isStandingOrderKind } from './squads/standingOrders';
import { sanitizeTeamStats } from './stats';
import { allianceCount, isControllerKind } from './teams';
import { isDefeatReason } from './rules/falls';
import type { GeneralState, SavedGameState } from './model';
import { Grid, type GridBounds } from './util/grid';
import { isInt, isPosOn, isObject, isUid } from './util/validation';

/**
 * Una partida guardada tal como llega (ya puesta al dia por MIGRATIONS): cualquier campo puede faltar
 * o estar roto. Solo despues de comprobarla entera se usa como `GameState`.
 */
export type SavedGame = { [Field in keyof SavedGameState]?: unknown } & Record<string, unknown>;

/** Un objeto del JSON, sin comprobar. */
type Saved = Record<string, unknown>;

/** Lo que hace falta de la partida que se lee para comprobar sus partes: contenido, mapa y equipos. */
export interface SaveFrame extends SavedMap {
  teamCount: number;
}

/** Equipos que se aceptan en una partida guardada. */
const MAX_TEAMS = 16;
/** Topes de lo que se acepta al leer: mas alla, el fichero esta roto. */
const MAX_SAVED_FUNDS = 1e9;
const MAX_COUNT = 1e6;
const MAX_DAY = 1e9;
/** Puntos que le pueden quedar a una captura a medias (los de captura de una regla, como mucho). */
const MAX_CAPTURE_LEFT = 1000;
/** Dias que puede durar un clima guardado. */
const MAX_WEATHER_DAYS = 1000;
/** Las semillas de los mapas son enteros sin signo de 32 bits. */
const MAX_MAP_SEED = 2 ** 32;

/** Un equipo de la partida que se lee (su numero en GameState.teams). */
const isTeam = (frame: SaveFrame, value: unknown): boolean => isInt(value, 0, frame.teamCount - 1);
/** Los objetos de una lista del JSON (lo que no lo es, fuera). */
const objectsIn = (value: unknown): Saved[] => (Array.isArray(value) ? value.filter(isObject) : []);

/** Las listas de una partida guardada que ya tiene su forma (hasGameShape); lo de dentro, sin mirar. */
export interface SavedLists {
  map: unknown[];
  teams: unknown[];
  units: unknown[];
  buildings: unknown[];
}

/** Lo de arriba tiene la forma de una partida: listas y objetos donde tocan. Lo de dentro se mira despues. */
export function hasGameShape(saved: SavedGame): saved is SavedGame & SavedLists {
  return [saved.map, saved.teams, saved.units, saved.buildings].every(Array.isArray) && isObject(saved.rules);
}

/** [CAMBIO] Mapas de varios tamaños: el tamaño sale del propio mapa guardado, que tiene que ser cuadrado y de terrenos que existan. */
export function isValidMap(map: unknown, content: GameContent): map is string[][] {
  if (!Array.isArray(map) || !isInt(map.length, MAP_MIN, MAP_MAX)) return false;
  const isTerrain = (value: unknown) => isEntryId(content.terrain, value);
  return map.every((column) => Array.isArray(column) && column.length === map.length && column.every(isTerrain));
}

/** Los bordes de un mapa ya comprobado. */
export function boardOf(map: readonly (readonly string[])[]): GridBounds {
  const size = { width: map.length, height: map.length };
  return { ...size, contains: (pos) => Grid.fits(size, pos) };
}

/** Un general que no existe (o con datos rotos) se quita: el equipo sigue sin el. */
function cleanGeneral(content: GameContent, saved: unknown): GeneralState | null {
  const definition = isObject(saved) && typeof saved.id === 'string' ? findEntry(content.generals, saved.id) : undefined;
  if (!isObject(saved) || !definition) return null;
  const hasCharge = typeof saved.charge === 'number' && Number.isFinite(saved.charge);
  const charge = hasCharge ? Math.max(0, Math.min(saved.charge as number, definition.charge.max)) : 0;
  return { id: definition.id, charge, used: !!saved.used, reveal: !!saved.reveal };
}

/** Cuando y por que cayo un equipo (o null, si sigue en pie). Que cuadre con la partida lo mira readSave (fallsMatch). */
const isTeamFall = (fell: unknown): boolean =>
  fell === null || (isObject(fell) && isInt(fell.order, 1, MAX_COUNT) && isDefeatReason(fell.reason));

/** Un equipo bien formado (su numero es su puesto); su general y sus estadisticas, si estan rotos, se arreglan. */
function isValidTeam(content: GameContent, team: unknown, id: number): boolean {
  if (!isObject(team) || team.id !== id || !isInt(team.alliance, 0, MAX_COUNT) || !isControllerKind(team.controller)) return false;
  if (!isInt(team.funds, 0, MAX_SAVED_FUNDS) || typeof team.resigned !== 'boolean' || !isTeamFall(team.fell)) return false;
  team.general = cleanGeneral(content, team.general);
  team.stats = sanitizeTeamStats(team.stats);
  return true;
}

/** Entre 2 y MAX_TEAMS equipos, todos bien formados, y al menos dos alianzas (si no, nadie es enemigo de nadie). */
export function isValidTeamList(teams: unknown[], content: GameContent): boolean {
  if (!isInt(teams.length, 2, MAX_TEAMS) || !teams.every((team, id) => isValidTeam(content, team, id))) return false;
  return allianceCount(teams as { alliance: number }[]) >= 2;
}

/** Una orden con destino bien formada (Unit.standingOrder o Squad.standingOrder). */
const isStandingOrder = (board: GridBounds, value: unknown): boolean =>
  isObject(value) && isStandingOrderKind(value.kind) && isPosOn(board, value.at);

/** Quita el campo opcional `field` si esta pero no vale. */
function dropIfInvalid(holder: Saved, field: string, isValid: (value: unknown) => boolean): void {
  if (holder[field] !== undefined && !isValid(holder[field])) delete holder[field];
}

/** Lo que una unidad tiene que tener bien: tipo, equipo, casilla, vida y sus plazas de carga. */
function isValidUnit(frame: SaveFrame, unit: Saved): boolean {
  const unitType = typeof unit.type === 'string' ? findEntry(frame.content.units, unit.type) : undefined;
  if (!unitType || !isTeam(frame, unit.team) || !isPosOn(frame.board, unit) || !isInt(unit.life, 1, MAX_LIFE)) return false;
  return Array.isArray(unit.cargo) && unit.cargo.length === unitType.cargoSlots;
}

/** Lo opcional de una unidad que este roto se quita. */
function cleanUnit(frame: SaveFrame, unit: Saved): void {
  // Un punto del turno roto: la unidad ya ha actuado (lo mas prudente; en la ronda siguiente vuelve a estar lista).
  if (!isUnitTurnState(unit.turnState)) unit.turnState = 'done';
  dropIfInvalid(unit, 'kills', (kills) => isInt(kills, 0, MAX_COUNT));
  dropIfInvalid(unit, 'hitDay', (day) => isInt(day, 0, MAX_COUNT));
  dropIfInvalid(unit, 'standingOrder', (order) => isStandingOrder(frame.board, order));
  dropIfInvalid(unit, 'squad', (squad) => isInt(squad, 1, MAX_COUNT));
  dropIfInvalid(unit, 'travelTo', (pos) => isPosOn(frame.board, pos));
}

/** Cada unidad esta bien en lo que tiene que tener, y su uid no se repite. Solo mira. */
export function hasValidUnits(frame: SaveFrame, units: readonly unknown[]): boolean {
  const uids = new Set<unknown>();
  for (const unit of units) {
    if (!isObject(unit) || !isUid(unit.uid) || uids.has(unit.uid) || !isValidUnit(frame, unit)) return false;
    uids.add(unit.uid);
  }
  return true;
}

/** Lo opcional roto de cada unidad se quita (despues de hasValidUnits). */
export function cleanUnits(frame: SaveFrame, units: readonly unknown[]): void {
  for (const unit of objectsIn(units)) cleanUnit(frame, unit);
}

/** Cada pasajero esta en la lista de su transporte y cada transporte lleva a quien dice. */
export function hasConsistentCargo(list: readonly unknown[]): boolean {
  const units = list.filter(isObject);
  const byUid = new Map(units.map((unit) => [unit.uid, unit]));
  const cargoOf = (uid: unknown): unknown[] => {
    const carrier = byUid.get(uid);
    return carrier && Array.isArray(carrier.cargo) ? carrier.cargo : [];
  };
  const isInItsCarrier = (unit: Saved) => unit.carrier === null || cargoOf(unit.carrier).includes(unit.uid);
  const carriesWhoItSays = (unit: Saved) => cargoOf(unit.uid).every((uid) => uid === null || byUid.get(uid)?.carrier === unit.uid);
  return units.every((unit) => isInItsCarrier(unit) && carriesWhoItSays(unit));
}

/** Una captura a medias bien formada de una unidad de un equipo de la partida. */
const isCaptureProgress = (frame: SaveFrame, value: unknown): boolean =>
  isObject(value) && isTeam(frame, value.team) && isUid(value.uid) && isInt(value.left, 1, MAX_CAPTURE_LEFT);

/** Cada edificio esta bien en lo que tiene que tener: tipo, casilla y dueño. Solo mira. */
export function hasValidBuildings(frame: SaveFrame, buildings: readonly unknown[]): boolean {
  return buildings.every(
    (building) =>
      isObject(building) &&
      isEntryId(frame.content.buildings, building.type) &&
      isPosOn(frame.board, building) &&
      (building.owner === null || isTeam(frame, building.owner)),
  );
}

/** Una captura a medias rota se olvida, el edificio sigue (despues de hasValidBuildings). */
export function cleanBuildings(frame: SaveFrame, buildings: readonly unknown[]): void {
  for (const building of objectsIn(buildings))
    if (building.capture != null && !isCaptureProgress(frame, building.capture)) building.capture = null;
}

/** La mision: su id y su objetivo, de un equipo de la partida (cada tipo de objetivo comprueba sus campos). */
export function isValidMission(frame: SaveFrame, mission: unknown): boolean {
  if (!isObject(mission) || typeof mission.id !== 'string' || !isObject(mission.objective)) return false;
  return isTeam(frame, mission.objective.owner) && isValidObjective(frame, mission.objective);
}

/**
 * El turno: el orden de cada ronda tiene a todos los equipos una vez, y le toca a uno de ellos (que
 * sepa si ya ha empezado su turno).
 */
export function isValidTurn(frame: SaveFrame, saved: SavedGame): boolean {
  const order = saved.turnOrder;
  if (!Array.isArray(order) || order.length !== frame.teamCount || !order.every((team) => isTeam(frame, team))) return false;
  if (new Set(order).size !== order.length) return false;
  return order.includes(saved.turn) && typeof saved.turnStarted === 'boolean';
}

/**
 * El siguiente uid y el de la siguiente escuadra nunca repiten uno que ya este; el dia, si esta roto,
 * es el primero.
 */
export function cleanCounters(saved: SavedGame): void {
  saved.nextUid = nextCounter(saved.nextUid, highestId(saved.units, 'uid'));
  saved.nextSquadId = nextCounter(saved.nextSquadId, highestId(saved.squads, 'id'));
  if (!isInt(saved.day, 1, MAX_DAY)) saved.day = 1;
}

/** El mayor numero valido (uid o id) de una lista guardada (0 si no hay ninguno). */
const highestId = (list: unknown, field: 'uid' | 'id'): number =>
  Math.max(0, ...objectsIn(list).flatMap((entry) => (isUid(entry[field]) ? [entry[field]] : [])));

/** Un contador guardado vale si es un uid valido por encima del mayor que hay; si no, el mayor + 1. */
const nextCounter = (saved: unknown, highest: number): number => (isUid(saved) && saved > highest ? saved : highest + 1);

/** Como se genero el mapa: semilla, lado (el del mapa) y tema. */
function isValidSetup(frame: SaveFrame, setup: unknown): boolean {
  if (!isObject(setup) || !isInt(setup.seed, 0, MAX_MAP_SEED) || setup.size !== frame.board.width) return false;
  return setup.theme === null || isEntryId(frame.content.themes, setup.theme);
}

/** Un clima roto no estropea la partida: se vuelve a empezar despejado. */
function isValidWeather(frame: SaveFrame, weather: unknown): boolean {
  const isWeather = (id: unknown) => isEntryId(frame.content.weather, id);
  return isObject(weather) && isWeather(weather.kind) && isWeather(weather.next) && isInt(weather.left, 0, MAX_WEATHER_DAYS);
}

/** Una escuadra con su id, su equipo y su nombre. */
function isValidSquad(frame: SaveFrame, squad: unknown): boolean {
  if (!isObject(squad) || !isInt(squad.id, 1, MAX_COUNT) || !isTeam(frame, squad.team)) return false;
  return typeof squad.name === 'string' && squad.name.length > 0;
}

/**
 * [CAMBIO] Las escuadras: si la lista esta rota se quita; la orden o la tecla rotas de una escuadra
 * se quitan (la escuadra sigue), y una tecla repetida en su equipo se la queda la primera. Una unidad
 * solo esta en una escuadra de su equipo que exista.
 */
function cleanSquads(frame: SaveFrame, saved: SavedGame): void {
  if (saved.squads !== undefined && !(Array.isArray(saved.squads) && saved.squads.every((squad) => isValidSquad(frame, squad))))
    delete saved.squads;
  const squads = objectsIn(saved.squads);
  const keysTaken = new Set<string>();
  /** La tecla de grupo de un equipo (cada equipo tiene sus nueve). */
  const teamKey = (squad: Saved, key: number) => `${squad.team as number}:${key}`;
  for (const squad of squads) {
    dropIfInvalid(squad, 'standingOrder', (order) => isStandingOrder(frame.board, order));
    dropIfInvalid(squad, 'key', (key) => isInt(key, 1, SQUAD_KEYS) && !keysTaken.has(teamKey(squad, key)));
    if (isInt(squad.key, 1, SQUAD_KEYS)) keysTaken.add(teamKey(squad, squad.key));
  }
  const isInItsSquad = (unit: Saved) => squads.some((squad) => squad.id === unit.squad && squad.team === unit.team);
  for (const unit of objectsIn(saved.units)) if (unit.squad !== undefined && !isInItsSquad(unit)) delete unit.squad;
}

/** Un punto de control en el mapa, de un equipo o de nadie. */
const isControlPoint = (frame: SaveFrame, point: unknown): boolean =>
  isObject(point) && isPosOn(frame.board, point) && (point.owner === null || isTeam(frame, point.owner));

/** Un movimiento que se puede deshacer: de una unidad, desde una casilla del mapa, con la captura que perdio. */
function isValidUndoableMove(frame: SaveFrame, move: unknown): boolean {
  if (!isObject(move) || !isUid(move.uid) || !isPosOn(frame.board, move.from)) return false;
  if (typeof move.revealed !== 'boolean') return false;
  if (move.travelTo !== undefined && !isPosOn(frame.board, move.travelTo)) return false;
  return move.capture === null || isCaptureProgress(frame, move.capture);
}

/** Lo opcional de la partida que este roto se quita, y la partida sigue sin ello. */
export function cleanOptionalParts(frame: SaveFrame, saved: SavedGame): void {
  dropIfInvalid(saved, 'setup', (setup) => isValidSetup(frame, setup));
  dropIfInvalid(saved, 'weather', (weather) => isValidWeather(frame, weather));
  cleanSquads(frame, saved);
  dropIfInvalid(saved, 'controlPoints', (points) => Array.isArray(points) && points.every((point) => isControlPoint(frame, point)));
  // Si esta roto, solo no se puede deshacer.
  dropIfInvalid(saved, 'undoableMoves', (moves) => Array.isArray(moves) && moves.every((move) => isValidUndoableMove(frame, move)));
}
