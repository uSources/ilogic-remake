/**
 * Generador de mapas aleatorios (RandomMap.java), como una lista de pasos (`MAP_STEPS`).
 * El terreno crece en anillos desde un punto al azar; cada casilla elige terreno segun
 * una probabilidad base del tema mas un extra por cada vecina igual ya generada.
 * Despues: agua poco profunda o hielo, agua profunda, zonas de inicio, edificios y unidades.
 * [CAMBIO] las zonas de inicio se buscan al final, deben existir, estar conectadas por
 * tierra y separadas; si no, se genera otro mapa (en el original podian faltar o solaparse).
 *
 * El orden de los pasos y de las llamadas a `rng` dentro de cada uno es parte del resultado: con la
 * misma semilla tiene que salir el mismo mapa (lo comprueban `npm run huella` y `tests/sim.test.ts`).
 */
import { terrainAt, themeOf } from './gameContent';
import { entryOf, MoveType, type GameContent, type MapgenSettings, type TerrainType, type Theme } from './content';
import { diamond, manhattan, squareArea } from './geom';
import { newGameState } from './gameState';
import type { TeamSetup } from './teams';
import { blankMap, createLayer, mapGrid } from './mapGrid';
import { newUnit } from './rules/lifecycle';
import { groundDistance } from './rules/movement';
import { buildingAt, canMoveOn, unitAt } from './rules/queries';
import type { Grid, GridBounds, GridSize } from './util/grid';
import { seedFromDraw } from './util/random';
import type { GameState, Pos, Rng, MatchSettings, TeamId } from './model';

const WALK = MoveType.FOOT;
/** Lado del mapa del original, con el que estan medidos los numeros de mapgen.json. */
const ORIGINAL_MAP_SIDE = 32;
/** Distancia minima entre dos bases en un mapa de 32; se escala con el lado del mapa. */
const MIN_SPAWN_DISTANCE = 14;
/** Intentos con poca tierra que se descartan; a partir de ahi vale cualquier mapa. */
const MAX_ATTEMPTS_FOR_LAND = 500;
/** Intentos de elegir la casilla de un edificio inicial antes de quedarse con la primera libre. */
const BUILDING_PICK_TRIES = 100;

/** Superficie del mapa respecto al original de 32x32 (para escalar cuantos edificios hay). */
const areaScale = (size: GridSize) => (size.width * size.height) / (ORIGINAL_MAP_SIDE * ORIGINAL_MAP_SIDE);

/** Los numeros del generador del contenido de la partida (mapgen.json). */
const settingsOf = (s: GameState): MapgenSettings => s.content.mapgen;

function emptyState(size: number, options: NewMapOptions, diceSeed: number): GameState {
  // El terreno de partida no importa: el generador pone todas las casillas.
  const plain = options.content.plainTerrain.id;
  return newGameState({
    map: blankMap(size, plain),
    rules: options.rules,
    content: options.content,
    mode: 'skirmish',
    teams: options.teams,
    firstTeam: options.firstTeam,
    diceSeed,
  });
}

const isWalkable = (terrain: TerrainType) => canMoveOn(WALK, terrain);
/** El terreno de un id de themes.json (validado al cargar el contenido). */
const terrainNamed = (s: GameState, id: string): TerrainType => entryOf(s.content.terrain, id, 'terreno');

// ---------------------------------------------------------------------------------------------
// Terreno
// ---------------------------------------------------------------------------------------------

/** Las vecinas en el orden del original: izquierda, arriba, derecha, abajo. */
const sideNeighbours = (board: GridBounds, pos: Pos): Pos[] =>
  [
    { x: pos.x - 1, y: pos.y },
    { x: pos.x, y: pos.y - 1 },
    { x: pos.x + 1, y: pos.y },
    { x: pos.x, y: pos.y + 1 },
  ].filter((neighbour) => board.contains(neighbour));

/** Probabilidad base de un terreno en el tema y lo que suma cada vecina igual (0 si el tema no lo tiene). */
const chanceIn = (theme: Theme, terrain: TerrainType) => theme.generator.terrainChance[terrain.id] ?? { base: 0, perNeighbour: 0 };

/** Probabilidad de que `pos` sea `terrain`: la base del tema mas un extra por cada vecina ya hecha igual. */
function terrainChance(s: GameState, generated: Grid<boolean>, pos: Pos, terrain: TerrainType, theme: Theme): number {
  const isSameAndDone = (neighbour: Pos) => generated.at(neighbour) && terrainAt(s, neighbour) === terrain;
  const { base, perNeighbour } = chanceIn(theme, terrain);
  // Se suma de uno en uno (no `n * extra`) para que salgan los mismos decimales que antes.
  return sideNeighbours(generated, pos)
    .filter(isSameAndDone)
    .reduce((chance) => chance + perNeighbour, base);
}

/**
 * Prueba los terrenos en orden ciclico (el de terrain.json, tambien los que el tema no tiene: cada
 * prueba gasta una tirada) hasta que uno sale; devuelve ese.
 */
function rollTerrain(terrains: readonly TerrainType[], rng: Rng, chanceOf: (terrain: TerrainType) => number): TerrainType {
  for (let index = 0; ; index = (index + 1) % terrains.length) if (rng() < chanceOf(terrains[index]!)) return terrains[index]!;
}

/** Crecimiento en anillos (RandomMap.generateTerrain). Devuelve las casillas transitables a pie. */
function growTerrain(s: GameState, origin: Pos, theme: Theme, rng: Rng): number {
  const map = mapGrid(s);
  const terrains = s.content.terrain.list;
  const generated = map.createLayer(false);
  // Casilla de origen: solo probabilidad base.
  map.set(origin, rollTerrain(terrains, rng, (terrain) => chanceIn(theme, terrain).base).id);
  let walkable = 0;
  for (let ring = 1; ; ring++) {
    const ringTiles = [...diamond(map, origin, ring, ring)];
    if (ringTiles.length === 0) return walkable;
    for (const pos of ringTiles) {
      const rolled = rollTerrain(terrains, rng, (terrain) => terrainChance(s, generated, pos, terrain, theme));
      map.set(pos, rolled.id);
      generated.set(pos, true);
      if (isWalkable(rolled)) walkable++;
    }
  }
}

/** Agua con tierra a los dos lados (en horizontal o en vertical, sin salir del borde). */
function isNarrowWater(s: GameState, { x, y }: Pos): boolean {
  const isLand = (pos: Pos) => mapGrid(s).contains(pos) && !terrainAt(s, pos).isWater;
  const isNarrowAcross = isLand({ x: x - 1, y }) && isLand({ x: x + 1, y });
  const isNarrowAlong = isLand({ x, y: y - 1 }) && isLand({ x, y: y + 1 });
  return isNarrowAcross || isNarrowAlong;
}

/** Agua estrecha del tema -> `narrow` (agua poco profunda). Devuelve cuantas casillas cambian. */
function narrowWater(s: GameState, open: TerrainType, narrow: TerrainType): number {
  let changed = 0;
  // Va cambiando segun recorre: una casilla ya cambiada cuenta como tierra para las siguientes.
  for (const { pos } of mapGrid(s).cells()) {
    if (terrainAt(s, pos) !== open || !isNarrowWater(s, pos)) continue;
    mapGrid(s).set(pos, narrow.id);
    changed++;
  }
  return changed;
}

/** Agua junto a tierra (incluidas diagonales) -> `shore` (hielo). [CAMBIO] cuenta una vez por casilla. */
function freezeShores(s: GameState, shore: TerrainType): number {
  const map = mapGrid(s);
  const isSolidLand = (pos: Pos) => !terrainAt(s, pos).isWater && terrainAt(s, pos) !== shore;
  const toFreeze = [...map.cells()]
    .filter(({ pos }) => terrainAt(s, pos).isWater && squareArea(map, pos, 1).some(isSolidLand))
    .map(({ pos }) => pos);
  for (const pos of toFreeze) map.set(pos, shore.id);
  return toFreeze.length;
}

/** Agua rodeada de agua (3x3) -> `deep` (agua profunda). */
function deepenWater(s: GameState, deep: TerrainType): void {
  const map = mapGrid(s);
  const isAllWater = (pos: Pos) => squareArea(map, pos, 1).every((around) => terrainAt(s, around).isWater);
  const toDeepen = [...map.cells()].filter(({ pos }) => isAllWater(pos)).map(({ pos }) => pos);
  for (const pos of toDeepen) map.set(pos, deep.id);
}

// ---------------------------------------------------------------------------------------------
// Zonas de inicio
// ---------------------------------------------------------------------------------------------

/** Hay bastante sitio para edificios y unidades en la zona de inicio alrededor de `pos`. */
function hasRoomToStart(s: GameState, pos: Pos): boolean {
  const zone = spawnZone(s, pos).map((tile) => terrainAt(s, tile));
  return (
    zone.filter((terrain) => terrain.buildable).length >= settingsOf(s).minSpawnBuildable &&
    zone.filter(isWalkable).length >= settingsOf(s).minSpawnWalkable
  );
}

/** Casillas del mapa columna a columna; con `fromTheEnd`, empezando por la esquina opuesta. */
function* scanOrder(size: GridSize, fromTheEnd: boolean): Generator<Pos> {
  const { width, height } = size;
  for (let i = 0; i < width; i++)
    for (let j = 0; j < height; j++) yield fromTheEnd ? { x: width - 1 - i, y: height - 1 - j } : { x: i, y: j };
}

/** Zona de inicio (RandomMap.getSpawn): la primera casilla a pie con bastante sitio alrededor. */
function findSpawn(s: GameState, fromTheEnd: boolean, accept: (pos: Pos) => boolean): Pos | null {
  for (const pos of scanOrder(mapGrid(s), fromTheEnd))
    if (isWalkable(terrainAt(s, pos)) && hasRoomToStart(s, pos) && accept(pos)) return pos;
  return null;
}

/**
 * Las demas zonas, una tras otra: cada una tiene que poder alcanzarse a pie desde todas las de antes
 * y estar lejos de ellas. Se buscan desde la esquina opuesta a la primera.
 */
function findMoreSpawns(s: GameState, first: Pos, count: number): Pos[] | null {
  const minDistance = Math.round((MIN_SPAWN_DISTANCE * mapGrid(s).width) / ORIGINAL_MAP_SIDE);
  const spawns = [first];
  const distancesFrom = [groundDistance(s, first, WALK, createLayer(s, false))];
  while (spawns.length < count) {
    const isFarFromAll = (pos: Pos) =>
      spawns.every((earlier, i) => distancesFrom[i]!.at(pos) > 0 && manhattan(pos, earlier) >= minDistance);
    const next = findSpawn(s, true, isFarFromAll);
    if (!next) return null;
    spawns.push(next);
    if (spawns.length < count) distancesFrom.push(groundDistance(s, next, WALK, createLayer(s, false)));
  }
  return spawns;
}

/**
 * Baraja la lista en su sitio (Fisher-Yates desde el final). Con dos, un solo numero: por debajo de
 * 0.5 se quedan como estan (como el sorteo de siempre, para que los mapas de dos no cambien).
 */
function shuffleInPlace<T>(list: T[], rng: Rng): void {
  for (let i = list.length - 1; i > 0; i--) {
    const j = i - Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j]!, list[i]!];
  }
}

// ---------------------------------------------------------------------------------------------
// Edificios y unidades
// ---------------------------------------------------------------------------------------------

/**
 * Muestreo secuencial (como el original): recorre `candidates` y se queda con cada una con
 * probabilidad `wanted / left`; devuelve la elegida o null si no salio ninguna.
 */
function sampleInOrder(candidates: readonly Pos[], wanted: number, rng: Rng, nextLeft: (left: number) => number): Pos | null {
  let left = candidates.length;
  for (const pos of candidates) {
    if (rng() < wanted / left) return pos;
    left = nextLeft(left);
  }
  return null;
}

const spawnZone = (s: GameState, spawn: Pos) => [...diamond(mapGrid(s), spawn, 0, settingsOf(s).spawnRadius)];

/** Unidades iniciales (mapgen.json, "startingUnits") cerca del centro de la zona. */
function placeStartingUnits(s: GameState, spawn: Pos, team: TeamId, rng: Rng): void {
  const starting = settingsOf(s).startingUnits;
  starting.forEach((id, index) => {
    const unitType = entryOf(s.content.units, id, 'unidad');
    const free = spawnZone(s, spawn).filter((pos) => canMoveOn(unitType.movement, terrainAt(s, pos)) && !unitAt(s, pos));
    // Con la probabilidad corregida (las que quedan por poner); si no sale ninguna, la ultima libre.
    const chosen = sampleInOrder(free, starting.length - index, rng, (left) => left - 1) ?? free.at(-1);
    if (chosen) newUnit(s, unitType, team, chosen);
  });
}

/** Edificios iniciales (mapgen.json, "startingBuildings") en la zona de inicio. Falla si no caben. */
function placeStartingBuildings(s: GameState, spawn: Pos, team: TeamId, rng: Rng): boolean {
  const starting = settingsOf(s).startingBuildings;
  const total = starting.length;
  for (let index = 0; index < total; index++) {
    const free = spawnZone(s, spawn).filter((pos) => terrainAt(s, pos).buildable && !buildingAt(s, pos));
    if (!free.length) return false;
    // El original recorre el rombo dando vueltas; equivale a elegir con prob. creciente.
    let chosen: Pos | null = null;
    for (let tries = 0; !chosen && tries < BUILDING_PICK_TRIES; tries++)
      chosen = sampleInOrder(free, total - index, rng, (left) => Math.max(1, left - 1));
    chosen ??= free[0]!;
    const buildingType = entryOf(s.content.buildings, starting[index]!, 'edificio');
    s.buildings.push({ type: buildingType.id, owner: team, x: chosen.x, y: chosen.y });
  }
  return true;
}

/**
 * Cuantos edificios neutrales de cada tipo, en el orden de buildings.json (mapgen.json,
 * "neutralBuildings" y "neutralTotal", escalado con la superficie).
 */
function rollNeutralCounts(s: GameState, size: GridSize, rng: Rng): number[] {
  const settings = settingsOf(s);
  const [minTotal, maxTotal] = settings.neutralTotal;
  const isTotalAllowed = (total: number) =>
    total >= Math.floor(minTotal * areaScale(size)) && total <= Math.ceil(maxTotal * areaScale(size));
  // Todos los tipos tiran el dado, tambien los que no tienen neutrales: la misma semilla, el mismo mapa.
  const ranges = s.content.buildings.list.map((building) => settings.neutralBuildings[building.id] ?? [0, 0]);
  for (;;) {
    // [CAMBIO] en mapas de otro tamaño, el numero de edificios neutrales se escala con la superficie.
    const scale = areaScale(size);
    const counts = ranges.map(([min, max]) => Math.round((min + Math.floor(rng() * (max - min + 1))) * scale));
    if (isTotalAllowed(counts.reduce((sum, count) => sum + count, 0))) return counts;
  }
}

/** Edificios neutrales repartidos uniformemente por el mapa (algoritmo S de Knuth). */
function placeNeutralBuildings(s: GameState, rng: Rng): void {
  const map = mapGrid(s);
  const toPlace = rollNeutralCounts(s, map, rng);
  const available = map.createLayer(false);
  let availableCount = 0;
  for (const { pos } of map.cells())
    if (terrainAt(s, pos).buildable && !buildingAt(s, pos)) {
      available.set(pos, true);
      availableCount++;
    }
  toPlace.forEach((count, index) => {
    const type = s.content.buildings.list[index]!.id;
    let missing = count;
    let remaining = availableCount;
    for (const { pos, value: isAvailable } of available.cells()) {
      if (missing <= 0) return;
      if (!isAvailable) continue;
      if (rng() < missing / remaining) {
        s.buildings.push({ type, owner: null, x: pos.x, y: pos.y });
        available.set(pos, false);
        missing--;
        availableCount--;
      }
      remaining--;
    }
  });
}

// ---------------------------------------------------------------------------------------------
// Puntos de control
// ---------------------------------------------------------------------------------------------

/** Parte de la zona de un punto de control que tiene que ser tierra para poder pelear por ella. */
const MIN_CONTROL_LAND = 0.6;
/** Ni pegados a las salidas: al menos esta parte del camino entre ellas. */
const MIN_CONTROL_SPAWN_SHARE = 1 / 4;
/** Azar que se suma a la puntuacion para que no salgan siempre igual. */
const CONTROL_SCORE_NOISE = 1.5;
/** Puntuacion maxima (diferencia de distancias a las salidas) para valer como punto de control. */
const MAX_CONTROL_SCORE = 4;

function isMostlyLand(s: GameState, center: Pos): boolean {
  const zone = squareArea(mapGrid(s), center, s.rules.controlRadius);
  return zone.filter((pos) => isWalkable(terrainAt(s, pos))).length >= zone.length * MIN_CONTROL_LAND;
}

/** Casilla libre de tierra, alcanzable desde todas las salidas (`toSpawns`: distancia a pie a cada una) y no pegada a ninguna. */
function isControlSpot(s: GameState, pos: Pos, toSpawns: readonly number[], span: number): boolean {
  if (toSpawns.some((distance) => !distance)) return false;
  if (!isWalkable(terrainAt(s, pos)) || buildingAt(s, pos) || unitAt(s, pos)) return false;
  if (Math.min(...toSpawns) < span * MIN_CONTROL_SPAWN_SHARE) return false;
  return isMostlyLand(s, pos);
}

/** Lo que hay del camino mas corto entre dos salidas (a pie; en linea si no se llega). */
function shortestSpan(spawns: readonly Pos[], distancesFrom: readonly Grid<number>[]): number {
  const spans = spawns.flatMap((spawn, i) => spawns.slice(i + 1).map((other) => distancesFrom[i]!.at(other) || manhattan(spawn, other)));
  return Math.min(...spans);
}

/**
 * [CAMBIO] Puntos de control (regla controlPoints): zonas de tierra, con el centro igual de lejos (a
 * pie) de todas las zonas de salida, ni pegadas a ellas ni entre si. Asi hay algo por lo que pelear
 * en el medio del mapa. Si no caben todos, pone los que pueda.
 */
export function placeControlPoints(s: GameState, spawns: readonly Pos[], rng: Rng): void {
  const wanted = s.rules.controlPoints;
  if (wanted <= 0) return;
  const distancesFrom = spawns.map((spawn) => groundDistance(s, spawn, WALK, createLayer(s, false)));
  const span = shortestSpan(spawns, distancesFrom);
  const candidates: { pos: Pos; score: number }[] = [];
  for (const { pos } of distancesFrom[0]!.cells()) {
    const toSpawns = distancesFrom.map((distances) => distances.at(pos));
    if (!isControlSpot(s, pos, toSpawns, span)) continue;
    // Lo justo: la misma distancia a todas las salidas (con dos, la diferencia entre ellas).
    const spread = Math.max(...toSpawns) - Math.min(...toSpawns);
    candidates.push({ pos, score: spread + rng() * CONTROL_SCORE_NOISE });
  }
  candidates.sort((first, second) => first.score - second.score);
  const minGap = Math.max(3, Math.round(mapGrid(s).width / 4)) + 2 * s.rules.controlRadius;
  const chosen: Pos[] = [];
  for (const candidate of candidates) {
    if (chosen.length >= wanted || candidate.score > MAX_CONTROL_SCORE) break;
    if (chosen.every((other) => manhattan(other, candidate.pos) >= minGap)) chosen.push(candidate.pos);
  }
  if (chosen.length) s.controlPoints = chosen.map((pos) => ({ ...pos, owner: null }));
}

// ---------------------------------------------------------------------------------------------
// Los pasos, en orden
// ---------------------------------------------------------------------------------------------

/** Un intento de mapa, que cada paso va completando. */
interface MapDraft {
  s: GameState;
  rng: Rng;
  origin: Pos;
  attempt: number;
  forcedTheme: Theme | null;
  /** Casillas a pie del terreno, mas las de agua que se vuelven transitables. */
  landTiles: number;
  /** Zona de inicio de cada equipo (por numero de equipo), cuando ya se han buscado. */
  spawns: Pos[] | null;
}

interface MapStep {
  name: string;
  /** Devuelve false si este mapa no vale y hay que empezar otro. */
  run: (draft: MapDraft) => boolean;
}

/** La salida de cada equipo: la zona `i` es del equipo `i` de la partida. */
const startsOf = (draft: MapDraft): { spawn: Pos; team: TeamId }[] =>
  spawnsOf(draft).map((spawn, index) => ({ spawn, team: draft.s.teams[index]!.id }));

function spawnsOf(draft: MapDraft): Pos[] {
  if (!draft.spawns) throw new Error('Paso de mapa fuera de orden: aun no hay zonas de inicio');
  return draft.spawns;
}

/** Siempre se tira el dado del tema, aunque venga fijado, para no mover el resto de la secuencia. */
function chooseTheme(draft: MapDraft): boolean {
  const themes = draft.s.content.themes;
  const randomTheme = themes.list[Math.floor(draft.rng() * themes.list.length)]!;
  draft.s.theme = (draft.forcedTheme ?? randomTheme).id;
  return true;
}

/**
 * El agua segun el tema (themes.json, "generator"): la estrecha y la de la orilla cambian (agua poco
 * profunda, hielo) y la rodeada de agua se hace profunda. Devuelve las casillas de agua que pasan a
 * ser transitables a pie.
 */
function shapeWater(s: GameState): number {
  const generator = themeOf(s).generator;
  let newLand = 0;
  if (generator.narrowWater) newLand += narrowWater(s, terrainNamed(s, generator.openWater), terrainNamed(s, generator.narrowWater));
  if (generator.shoreWater) newLand += freezeShores(s, terrainNamed(s, generator.shoreWater));
  deepenWater(s, terrainNamed(s, generator.deepWater));
  return newLand;
}

/** Tras muchos intentos con poca tierra se acepta el mapa que salga. */
const hasEnoughLand = (draft: MapDraft) =>
  draft.landTiles >= settingsOf(draft.s).minLandTiles * areaScale(mapGrid(draft.s)) || draft.attempt >= MAX_ATTEMPTS_FOR_LAND;

/**
 * Una zona de salida por equipo. [CAMBIO] el original daba siempre la primera zona al jugador y la
 * segunda a la IA. La segunda sale mejor situada mas a menudo (la herramienta de equilibrio: 59-61 %
 * de ventaja para ese lado, en los dos sentidos). Ahora se sortea quien empieza en cada una.
 */
function findStartZones(draft: MapDraft): boolean {
  const first = findSpawn(draft.s, false, () => true);
  if (!first) return false;
  const spawns = findMoreSpawns(draft.s, first, draft.s.teams.length);
  if (!spawns) return false;
  shuffleInPlace(spawns, draft.rng);
  draft.spawns = spawns;
  return true;
}

const MAP_STEPS: readonly MapStep[] = [
  { name: 'tema', run: chooseTheme },
  {
    name: 'terreno',
    run: (draft) => {
      draft.landTiles = growTerrain(draft.s, draft.origin, themeOf(draft.s), draft.rng);
      return true;
    },
  },
  {
    name: 'agua',
    run: (draft) => {
      draft.landTiles += shapeWater(draft.s);
      return hasEnoughLand(draft);
    },
  },
  { name: 'zonas de inicio', run: findStartZones },
  {
    name: 'edificios iniciales',
    run: (draft) => startsOf(draft).every(({ spawn, team }) => placeStartingBuildings(draft.s, spawn, team, draft.rng)),
  },
  {
    name: 'unidades iniciales',
    run: (draft) => {
      for (const { spawn, team } of startsOf(draft)) placeStartingUnits(draft.s, spawn, team, draft.rng);
      return true;
    },
  },
  {
    name: 'edificios neutrales',
    run: (draft) => {
      placeNeutralBuildings(draft.s, draft.rng);
      return true;
    },
  },
  {
    name: 'puntos de control',
    run: (draft) => {
      placeControlPoints(draft.s, spawnsOf(draft), draft.rng);
      return true;
    },
  },
];

/** Como se quiere el mapa al azar: lado, tema (null = al azar) y reglas de la partida. */
export interface NewMapOptions {
  size?: number;
  /** Tema del mapa (de themes.json), o null (o nada) para uno al azar. */
  theme?: Theme | null;
  rules: Readonly<MatchSettings>;
  /** Contenido de la partida (unidades, edificios, terreno...). */
  content: GameContent;
  /** Los equipos (dos o mas): el generador hace una salida para cada uno. */
  teams: readonly TeamSetup[];
  /** El equipo que juega primero cada ronda (si no, el primero). */
  firstTeam?: TeamId;
}

/**
 * Genera una partida nueva con mapa aleatorio y las reglas dadas. Si un paso falla, se empieza otro
 * mapa desde el principio.
 */
export function generateGame(rng: Rng, options: NewMapOptions): GameState {
  const size = options.size ?? ORIGINAL_MAP_SIDE;
  // El punto de partida del terreno se sortea una vez y vale para todos los intentos.
  const originDraw = rng();
  const origin = { x: Math.floor(originDraw * size), y: Math.floor(rng() * size) };
  // Los dados de la partida salen de esa misma tirada: sin gastar otra, cada semilla sigue dando su mapa.
  const diceSeed = seedFromDraw(originDraw);
  for (let attempt = 0; ; attempt++) {
    const draft: MapDraft = {
      s: emptyState(size, options, diceSeed),
      rng,
      origin,
      attempt,
      forcedTheme: options.theme ?? null,
      landTiles: 0,
      spawns: null,
    };
    if (MAP_STEPS.every((step) => step.run(draft))) return draft.s;
  }
}
