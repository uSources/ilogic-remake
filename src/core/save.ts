/**
 * Guardar y cargar partidas como JSON (en el original, formato binario en data/save).
 * [CAMBIO] sin comprobacion de "gameid" (el original cerraba el juego si no coincidia)
 * y sin modificar el estado al guardar.
 */
import { unitTypeOf, savedPart } from './gameContent';
import { MAP_MAX, MAP_MIN, MAX_LIFE } from './data';
import { generalDef } from './generals';
import { findEntry, type Catalog, type Identified } from './content';
import { mapGrid } from './mapGrid';
import type { GridBounds } from './util/grid';
import { sanitizeTeamStats } from './stats';
import { allianceCount, isControllerKind } from './teams';
import { assignKeys } from './squads/naming';
import { migrateChecked, migrateRead, type SaveContext } from './saveMigrations';
import { SAVE_VERSION } from './saveVersion';
import { isStandingOrderKind } from './squads/standingOrders';
import { isObject } from './util/predicates';
import { isRandomState } from './util/random';
import { isUnitTurnState } from './rules/unitTurn';
import type { GameState, GeneralState, Pos, RulesConfig, SavedGameState, StandingOrder, TeamId, TeamState, Unit } from './model';

export type { SaveContext } from './saveMigrations';

/** Un id de ese catalogo del contenido de la partida. */
const isIdIn = (catalog: Catalog<Identified>, value: unknown): value is string => typeof value === 'string' && !!findEntry(catalog, value);

const isInt = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

/** Un equipo de la partida que se lee (su numero en GameState.teams). */
const isTeam = (s: GameState, value: unknown): boolean => isInt(value, 0, s.teams.length - 1);
/** Equipos que se aceptan en una partida guardada. */
const MAX_TEAMS = 16;
/** Topes de lo que se acepta al leer: mas alla, el fichero esta roto. */
const MAX_SAVED_FUNDS = 1e9;
const MAX_COUNT = 1e6;
const MAX_UID = Number.MAX_SAFE_INTEGER;

/** Una casilla bien formada (x e y enteros). */
const isPos = (value: unknown): value is Pos => isObject(value) && Number.isInteger(value.x) && Number.isInteger(value.y);
/** Una casilla bien formada y dentro del mapa de la partida que se lee. */
const isMapPos = (board: GridBounds, value: unknown): value is Pos => isPos(value) && board.contains(value);
/** Una orden con destino bien formada (Unit.standingOrder o Squad.standingOrder). */
const isStandingOrder = (board: GridBounds, value: unknown): value is StandingOrder =>
  isObject(value) && isStandingOrderKind(value.kind) && isMapPos(board, value.at);

export function serialize(s: GameState): string {
  return JSON.stringify(savedPart(s));
}

/**
 * Lee una partida guardada. Lo que no se guarda lo da `context`: el contenido con el que se juega y
 * las reglas de las misiones. Antes de comprobarla le aplica los pasos para partidas antiguas
 * (MIGRATIONS, en saveMigrations.ts). Devuelve null si el fichero no es valido.
 */
export function deserialize(json: string, context: SaveContext): GameState | null {
  const raw = parseObject(json);
  const savedVersion = raw?.version;
  if (!raw || !isInt(savedVersion, 1, SAVE_VERSION)) return null;
  migrateRead(raw, savedVersion, context);
  raw.version = SAVE_VERSION;
  if (!hasGameShape(raw)) return null;
  // El contenido no se guarda: es el de quien lee (si el JSON trae un "content", se pisa).
  const s: GameState = { ...raw, content: context.content };
  if (!readMap(s) || !hasValidBasics(s) || !readTeams(s)) return null;
  if (!readUnits(s) || !hasConsistentCargo(s) || !readBuildings(s)) return null;
  s.nextUid = Math.max(Number(s.nextUid) || 0, Math.max(0, ...s.units.map((unit) => unit.uid)) + 1);
  s.day = isInt(s.day, 1, 1e9) ? s.day : 1;
  if (s.mission !== undefined && !isValidMission(s, s.mission)) return null;
  // Lo opcional que esta roto se quita y la partida sigue sin ello.
  cleanSetup(s);
  cleanWeather(s);
  cleanSquads(s);
  cleanControlPoints(s);
  cleanLastMove(s);
  if (!hasValidRules(s)) return null;
  migrateChecked(s, savedVersion, context);
  return s;
}

/** El JSON, si es un objeto (sin comprobar nada mas). */
function parseObject(json: string): Record<string, unknown> | null {
  try {
    const raw: unknown = JSON.parse(json);
    return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Lo de arriba del JSON (ya al dia) tiene la forma de una partida guardada: listas y objetos donde
 * tocan. Lo de dentro lo comprueba deserialize despues, campo a campo.
 */
function hasGameShape(raw: Record<string, unknown>): raw is Record<string, unknown> & SavedGameState {
  return [raw.map, raw.teams, raw.units, raw.buildings].every(Array.isArray) && isObject(raw.rules);
}

/** [CAMBIO] Mapas de varios tamaños: el tamaño sale del propio mapa guardado. */
function readMap(s: GameState): boolean {
  if (!Array.isArray(s.map) || !isInt(s.map.length, MAP_MIN, MAP_MAX) || !Array.isArray(s.map[0])) return false;
  if (s.map[0].length !== s.map.length) return false;
  const isTerrain = (value: unknown) => isIdIn(s.content.terrain, value);
  return s.map.every((column) => Array.isArray(column) && column.length === s.map.length && column.every(isTerrain));
}

function hasValidBasics(s: GameState): boolean {
  return isIdIn(s.content.themes, s.theme) && Array.isArray(s.units) && Array.isArray(s.buildings) && isRandomState(s.dice);
}

/** Un equipo bien formado (su numero es su puesto); su general y sus estadisticas, si estan rotos, se arreglan. */
function readTeam(s: GameState, team: TeamState, id: TeamId): boolean {
  if (!isObject(team) || team.id !== id || !isInt(team.alliance, 0, MAX_COUNT) || !isControllerKind(team.controller)) return false;
  if (!isInt(team.funds, 0, MAX_SAVED_FUNDS)) return false;
  team.general = cleanGeneral(s, team.general);
  team.stats = sanitizeTeamStats(team.stats);
  return true;
}

/** Entre 2 y MAX_TEAMS equipos, todos bien formados, y al menos dos alianzas (si no, nadie es enemigo de nadie). */
function readTeams(s: GameState): boolean {
  if (!isInt(s.teams.length, 2, MAX_TEAMS)) return false;
  return s.teams.every((team, id) => readTeam(s, team, id)) && allianceCount(s.teams) >= 2;
}

/** Comprueba cada unidad (uid sin repetir) y quita lo opcional que este roto. */
function readUnits(s: GameState): boolean {
  const uids = new Set<number>();
  for (const unit of s.units) {
    if (!isInt(unit.uid, 1, MAX_UID) || uids.has(unit.uid)) return false;
    uids.add(unit.uid);
    if (!isValidUnit(s, unit)) return false;
    cleanUnit(s, unit);
  }
  return true;
}

function isValidUnit(s: GameState, unit: Unit): boolean {
  if (!isIdIn(s.content.units, unit.type) || !isTeam(s, unit.team)) return false;
  if (!isMapPos(mapGrid(s), unit) || !isInt(unit.life, 1, MAX_LIFE)) return false;
  return Array.isArray(unit.cargo) && unit.cargo.length === unitTypeOf(s, unit).cargoSlots;
}

function cleanUnit(s: GameState, unit: Unit): void {
  // Un punto del turno roto: la unidad ya ha actuado (lo mas prudente; en la ronda siguiente vuelve a estar lista).
  if (!isUnitTurnState(unit.turnState)) unit.turnState = 'done';
  if (unit.kills !== undefined && !isInt(unit.kills, 0, MAX_COUNT)) delete unit.kills;
  if (unit.hitDay !== undefined && !isInt(unit.hitDay, 0, MAX_COUNT)) delete unit.hitDay;
  if (unit.standingOrder !== undefined && !isStandingOrder(mapGrid(s), unit.standingOrder)) delete unit.standingOrder;
  if (unit.squad !== undefined && !isInt(unit.squad, 1, MAX_COUNT)) delete unit.squad;
  if (unit.travelTo !== undefined && !isMapPos(mapGrid(s), unit.travelTo)) delete unit.travelTo;
}

/** Cada pasajero esta en la lista de su transporte y cada transporte lleva a quien dice. */
function hasConsistentCargo(s: GameState): boolean {
  const byUid = new Map(s.units.map((unit) => [unit.uid, unit]));
  const isInItsCarrier = (unit: Unit) => unit.carrier === null || !!byUid.get(unit.carrier)?.cargo.includes(unit.uid);
  const carriesWhoItSays = (unit: Unit) => unit.cargo.every((uid) => uid === null || byUid.get(uid)?.carrier === unit.uid);
  return s.units.every((unit) => isInItsCarrier(unit) && carriesWhoItSays(unit));
}

function readBuildings(s: GameState): boolean {
  for (const building of s.buildings) {
    if (!isIdIn(s.content.buildings, building.type) || !isMapPos(mapGrid(s), building)) return false;
    if (building.owner !== null && !isTeam(s, building.owner)) return false;
    // Una captura a medias rota se olvida (el edificio sigue).
    const progress = building.capture;
    if (progress == null) continue;
    if (!isTeam(s, progress.team) || !isInt(progress.uid, 1, MAX_UID) || !isInt(progress.left, 1, 1000)) building.capture = null;
  }
  return true;
}

function isValidMission(s: GameState, mission: GameState['mission']): boolean {
  const objective = mission?.objective as Record<string, unknown> | undefined;
  if (!mission || typeof mission.id !== 'string' || !isTeam(s, mission.team) || !objective) return false;
  const hasDays = isInt(objective.days, 1, 10000);
  switch (objective.kind) {
    case 'hq':
      return true;
    case 'survive':
    case 'destroy':
      return hasDays;
    case 'capture':
      return hasDays && isInt(objective.count, 1, 1000) && (objective.type === null || isIdIn(s.content.buildings, objective.type));
    case 'escort':
      return hasDays && isInt(objective.uid, 1, MAX_UID) && isMapPos(mapGrid(s), objective.to);
    default:
      return false;
  }
}

function cleanSetup(s: GameState): void {
  if (s.setup === undefined) return;
  const setup = s.setup;
  const ok =
    !!setup &&
    isInt(setup.seed, 0, 2 ** 32) &&
    setup.size === s.map.length &&
    (setup.theme === null || isIdIn(s.content.themes, setup.theme));
  if (!ok) delete s.setup;
}

/** Un clima roto no estropea la partida: se vuelve a empezar despejado. */
function cleanWeather(s: GameState): void {
  if (s.weather === undefined) return;
  const weather = s.weather;
  const ok =
    !!weather && isIdIn(s.content.weather, weather.kind) && isIdIn(s.content.weather, weather.next) && isInt(weather.left, 0, 1000);
  if (!ok) delete s.weather;
}

function cleanSquads(s: GameState): void {
  if (s.squads !== undefined) {
    const isValidSquad = (squad: unknown) => {
      const saved = squad as { id?: unknown; team?: unknown; name?: unknown } | null;
      const hasName = typeof saved?.name === 'string' && saved.name.length > 0;
      return !!saved && isInt(saved.id, 1, MAX_COUNT) && isTeam(s, saved.team) && hasName;
    };
    if (!Array.isArray(s.squads) || !s.squads.every(isValidSquad)) delete s.squads;
    for (const squad of s.squads ?? []) {
      // [CAMBIO] Orden y tecla de la escuadra: si estan rotas, se quitan (la escuadra sigue).
      if (squad.standingOrder !== undefined && !isStandingOrder(mapGrid(s), squad.standingOrder)) delete squad.standingOrder;
      if (squad.key !== undefined && !isInt(squad.key, 1, 9)) delete squad.key;
    }
  }
  // Una unidad solo esta en una escuadra de su equipo.
  const isInItsSquad = (unit: Unit) => s.squads?.some((squad) => squad.id === unit.squad && squad.team === unit.team);
  for (const unit of s.units) if (unit.squad !== undefined && !isInItsSquad(unit)) delete unit.squad;
  dropRepeatedKeys(s);
  assignKeys(s);
}

/**
 * [CAMBIO] Teclas de grupo sin repetir en cada equipo (se la queda la primera escuadra); las demas, la
 * primera libre (assignKeys).
 */
function dropRepeatedKeys(s: GameState): void {
  const keys = new Set<string>();
  for (const squad of s.squads ?? []) {
    const key = `${squad.team}:${squad.key}`;
    if (squad.key !== undefined && keys.has(key)) delete squad.key;
    if (squad.key !== undefined) keys.add(key);
  }
}

/** Una captura a medias bien formada de una unidad del equipo `team`. */
const isCaptureOf = (s: GameState, value: unknown): boolean =>
  isObject(value) && isTeam(s, value.team) && isInt(value.uid, 1, MAX_UID) && isInt(value.left, 1, 1000);

/** El ultimo movimiento (para deshacerlo): si esta roto, no se puede deshacer, y la partida sigue. */
function cleanLastMove(s: GameState): void {
  const lastMove = s.lastMove as unknown;
  if (lastMove === undefined) return;
  const isValid =
    isObject(lastMove) &&
    isInt(lastMove.uid, 1, MAX_UID) &&
    isMapPos(mapGrid(s), lastMove.from) &&
    (lastMove.capture === null || isCaptureOf(s, lastMove.capture));
  if (!isValid) delete s.lastMove;
}

function cleanControlPoints(s: GameState): void {
  if (s.controlPoints === undefined) return;
  const ok =
    Array.isArray(s.controlPoints) &&
    s.controlPoints.every((point) => point && isMapPos(mapGrid(s), point) && (point.owner === null || isTeam(s, point.owner)));
  if (!ok) delete s.controlPoints;
}

/** Un general que no existe (o con datos rotos) se quita: el equipo sigue sin el. */
function cleanGeneral(s: GameState, saved: GeneralState | null): GeneralState | null {
  const definition = isObject(saved) && typeof saved.id === 'string' ? generalDef(s, saved.id) : undefined;
  if (!saved || !definition) return null;
  const hasCharge = typeof saved.charge === 'number' && Number.isFinite(saved.charge);
  const charge = hasCharge ? Math.max(0, Math.min(saved.charge, definition.charge.max)) : 0;
  return { id: saved.id, charge, used: !!saved.used, reveal: !!saved.reveal };
}

/** Un tanto por uno (0..1). */
const isFraction = (value: unknown): boolean => typeof value === 'number' && value >= 0 && value <= 1;

/** Las reglas que tiene toda partida guardada (desde la primera version) son validas. */
function hasValidCoreRules(rules: Partial<RulesConfig>): boolean {
  const incomeScale = rules.incomeScale;
  return (
    isInt(rules.initialFunds, 0, MAX_SAVED_FUNDS) &&
    isInt(rules.maxUnits, 1, 200) &&
    typeof rules.counterattack === 'boolean' &&
    (rules.damageSpread === null || isFraction(rules.damageSpread)) &&
    isInt(rules.capturePoints, 1, 1000) &&
    isInt(rules.hqCapturePoints, 1, 1000) &&
    typeof incomeScale === 'number' &&
    incomeScale >= 0 &&
    incomeScale <= 10 &&
    typeof rules.fog === 'boolean' &&
    (rules.dayLimit === null || isInt(rules.dayLimit, 1, 10000))
  );
}

/** Las reglas que se añadieron despues (en las partidas antiguas las pone MIGRATIONS) son validas. */
function hasValidLaterRules(rules: Partial<RulesConfig>): boolean {
  const switches = [
    rules.veterancy,
    rules.passAllies,
    rules.ambush,
    rules.forestHides,
    rules.terrainCost,
    rules.weather,
    rules.abilities,
    rules.noHealUnderFire,
  ];
  return (
    switches.every((value) => typeof value === 'boolean') &&
    (rules.commandPoints === null || isInt(rules.commandPoints, 1, 10000)) &&
    [rules.upkeep, rules.vetBonus, rules.bounty, rules.flankBonus].every(isFraction) &&
    isInt(rules.controlPoints, 0, 6) &&
    isInt(rules.controlIncome, 0, 1e6) &&
    isInt(rules.controlRadius, 0, 3)
  );
}

/** Las reglas guardadas son validas y estan todas. */
function isValidRules(rules: Partial<RulesConfig>): boolean {
  return hasValidCoreRules(rules) && hasValidLaterRules(rules);
}

/**
 * Las reglas de la partida, que viajan con ella. Las de las partidas antiguas (sin reglas, sin las
 * que se añadieron despues, misiones con las de escaramuza) ya las ha puesto al dia MIGRATIONS.
 */
function hasValidRules(s: GameState): boolean {
  const saved = s.rules as Partial<RulesConfig> | undefined;
  return saved !== undefined && isValidRules(saved);
}
