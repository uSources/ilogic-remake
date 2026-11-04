/**
 * Guardar y cargar partidas como JSON (en el original, formato binario en data/save).
 * [CAMBIO] sin comprobacion de "gameid" (el original cerraba el juego si no coincidia)
 * y sin modificar el estado al guardar.
 */
import { savedPart, tablesOf } from './gameContent';
import { MAP_MAX, MAP_MIN, MAX_LIFE } from './data';
import { TERRAIN_TYPES, THEME_NAMES } from './content';
import { generalDef } from './generals';
import { mapGrid } from './mapGrid';
import type { GridBounds } from './util/grid';
import { sanitizeStats } from './stats';
import { assignKeys } from './squads/naming';
import { migrateChecked, migrateRead, type SaveContext } from './saveMigrations';
import { SAVE_VERSION } from './saveVersion';
import { isStandingOrderKind } from './squads/standingOrders';
import { isObject } from './util/predicates';
import type { GameState, Pos, RulesConfig, SavedGameState, StandingOrder, Unit } from './model';

export type { SaveContext } from './saveMigrations';

const isInt = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** Bando valido (0 jugador, 1 IA). */
const isTeam = (v: unknown): boolean => v === 0 || v === 1;
/** Ultimo tema de mapa (Plains..Snowy, ver GameState.theme). */
const MAX_THEME = THEME_NAMES.length - 1;
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
  if (!readMap(s) || !hasValidBasics(s)) return null;
  if (!readUnits(s) || !hasConsistentCargo(s) || !readBuildings(s)) return null;
  s.nextUid = Math.max(Number(s.nextUid) || 0, Math.max(0, ...s.units.map((unit) => unit.uid)) + 1);
  s.day = isInt(s.day, 1, 1e9) ? s.day : 1;
  if (s.stats !== undefined) s.stats = sanitizeStats(s.stats);
  if (s.mission !== undefined && !isValidMission(s, s.mission)) return null;
  // Lo opcional que esta roto se quita y la partida sigue sin ello.
  cleanSetup(s);
  cleanWeather(s);
  cleanSquads(s);
  cleanControlPoints(s);
  cleanGenerals(s);
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
  return [raw.map, raw.funds, raw.units, raw.buildings].every(Array.isArray) && isObject(raw.rules);
}

/** [CAMBIO] Mapas de varios tamaños: el tamaño sale del propio mapa guardado. */
function readMap(s: GameState): boolean {
  if (!Array.isArray(s.map) || !isInt(s.map.length, MAP_MIN, MAP_MAX) || !Array.isArray(s.map[0])) return false;
  if (s.map[0].length !== s.map.length) return false;
  const isTerrain = (t: unknown) => isInt(t, 0, TERRAIN_TYPES - 1);
  return s.map.every((column) => Array.isArray(column) && column.length === s.map.length && column.every(isTerrain));
}

function hasValidBasics(s: GameState): boolean {
  if (!isInt(s.theme, 0, MAX_THEME) || !Array.isArray(s.funds) || s.funds.length !== 2) return false;
  if (!s.funds.every((funds) => isInt(funds, 0, MAX_SAVED_FUNDS))) return false;
  return Array.isArray(s.units) && Array.isArray(s.buildings);
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
  if (!isInt(unit.type, 0, tablesOf(s).UNIT_NAMES.length - 1) || !isTeam(unit.team)) return false;
  if (!isMapPos(mapGrid(s), unit) || !isInt(unit.life, 1, MAX_LIFE)) return false;
  return Array.isArray(unit.cargo) && unit.cargo.length === tablesOf(s).UNIT.maxcarry[unit.type];
}

function cleanUnit(s: GameState, unit: Unit): void {
  unit.active = !!unit.active;
  unit.canMove = !!unit.canMove;
  unit.canFire = !!unit.canFire;
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
    if (!isInt(building.type, 0, tablesOf(s).BUILDING_NAMES.length - 1) || !isMapPos(mapGrid(s), building)) return false;
    if (building.owner !== null && !isTeam(building.owner)) return false;
    // Una captura a medias rota se olvida (el edificio sigue).
    const progress = building.capture;
    if (progress == null) continue;
    if (!isTeam(progress.team) || !isInt(progress.uid, 1, MAX_UID) || !isInt(progress.left, 1, 1000)) building.capture = null;
  }
  return true;
}

function isValidMission(s: GameState, mission: GameState['mission']): boolean {
  const objective = mission?.objective as Record<string, unknown> | undefined;
  if (!mission || typeof mission.id !== 'string' || !objective) return false;
  const hasDays = isInt(objective.days, 1, 10000);
  switch (objective.kind) {
    case 'hq':
      return true;
    case 'survive':
    case 'destroy':
      return hasDays;
    case 'capture':
      return (
        hasDays &&
        isInt(objective.count, 1, 1000) &&
        (objective.type === null || isInt(objective.type, 0, tablesOf(s).BUILDING_NAMES.length - 1))
      );
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
    !!setup && isInt(setup.seed, 0, 2 ** 32) && setup.size === s.map.length && (setup.theme === null || isInt(setup.theme, 0, MAX_THEME));
  if (!ok) delete s.setup;
}

/** Un clima roto no estropea la partida: se vuelve a empezar despejado. */
function cleanWeather(s: GameState): void {
  if (s.weather === undefined) return;
  const weather = s.weather;
  const ok =
    !!weather &&
    isInt(weather.kind, 0, tablesOf(s).WEATHER.ids.length - 1) &&
    isInt(weather.next, 0, tablesOf(s).WEATHER.ids.length - 1) &&
    isInt(weather.left, 0, 1000);
  if (!ok) delete s.weather;
}

function cleanSquads(s: GameState): void {
  if (s.squads !== undefined) {
    const isValidSquad = (squad: unknown) => {
      const saved = squad as { id?: unknown; name?: unknown } | null;
      return !!saved && isInt(saved.id, 1, MAX_COUNT) && typeof saved.name === 'string' && saved.name.length > 0;
    };
    if (!Array.isArray(s.squads) || !s.squads.every(isValidSquad)) delete s.squads;
    for (const squad of s.squads ?? []) {
      // [CAMBIO] Orden y tecla de la escuadra: si estan rotas, se quitan (la escuadra sigue).
      if (squad.standingOrder !== undefined && !isStandingOrder(mapGrid(s), squad.standingOrder)) delete squad.standingOrder;
      if (squad.key !== undefined && !isInt(squad.key, 1, 9)) delete squad.key;
    }
  }
  for (const unit of s.units) if (unit.squad !== undefined && !s.squads?.some((squad) => squad.id === unit.squad)) delete unit.squad;
  dropRepeatedKeys(s);
  assignKeys(s);
}

/** [CAMBIO] Teclas de grupo sin repetir (se la queda la primera escuadra); las demas, la primera libre (assignKeys). */
function dropRepeatedKeys(s: GameState): void {
  const keys = new Set<number>();
  for (const squad of s.squads ?? []) {
    if (squad.key !== undefined && keys.has(squad.key)) delete squad.key;
    if (squad.key !== undefined) keys.add(squad.key);
  }
}

function cleanControlPoints(s: GameState): void {
  if (s.controlPoints === undefined) return;
  const ok =
    Array.isArray(s.controlPoints) &&
    s.controlPoints.every((point) => point && isMapPos(mapGrid(s), point) && (point.owner === null || isTeam(point.owner)));
  if (!ok) delete s.controlPoints;
}

/** Un general que no existe (o con datos rotos) se quita: la partida sigue sin el. */
function cleanGenerals(s: GameState): void {
  if (s.generals === undefined) return;
  if (!Array.isArray(s.generals) || s.generals.length !== 2) {
    delete s.generals;
    return;
  }
  s.generals = s.generals.map((saved) => {
    const def = saved ? generalDef(s, saved.id) : undefined;
    if (!saved || !def) return null;
    const hasCharge = typeof saved.charge === 'number' && Number.isFinite(saved.charge);
    const charge = hasCharge ? Math.max(0, Math.min(saved.charge, def.charge.max)) : 0;
    return { id: saved.id, charge, used: !!saved.used, reveal: !!saved.reveal };
  }) as GameState['generals'];
}

/** Un tanto por uno (0..1). */
const isFraction = (v: unknown): boolean => typeof v === 'number' && v >= 0 && v <= 1;

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
