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
import { DEFAULT_RULES, MAPGEN, PROBS_PER_ADJ, TERRAIN, TERRAIN_TYPES, TILE_BASE_PROBS, Movement, TerrainType, MoveType } from './data';
import { diamond, manhattan, squareArea } from './geom';
import { blankMap, createLayer, mapGrid, terrainAt } from './mapGrid';
import { newUnit } from './rules/lifecycle';
import { groundDistance } from './rules/movement';
import { buildingAt, unitAt } from './rules/queries';
import { isInside, type Grid, type GridSize } from './util/grid';
import type { GameState, Pos, Rng, RulesConfig, Team } from './model';

const WALK = MoveType.FOOT;
const PLAYER: Team = 0;
const ENEMY: Team = 1;
/** Lado del mapa del original, con el que estan medidos los numeros de `MAPGEN`. */
const ORIGINAL_MAP_SIDE = 32;
/** Distancia minima entre las dos bases en un mapa de 32; se escala con el lado del mapa. */
const MIN_SPAWN_DISTANCE = 14;
/** Intentos con poca tierra que se descartan; a partir de ahi vale cualquier mapa. */
const MAX_ATTEMPTS_FOR_LAND = 500;
/** Intentos de elegir la casilla de un edificio inicial antes de quedarse con la primera libre. */
const BUILDING_PICK_TRIES = 100;

/** Superficie del mapa respecto al original de 32x32 (para escalar cuantos edificios hay). */
const areaScale = (size: GridSize) => (size.width * size.height) / (ORIGINAL_MAP_SIDE * ORIGINAL_MAP_SIDE);

function emptyState(size: number, rules: RulesConfig): GameState {
  return {
    version: 1,
    map: blankMap(size),
    theme: 0,
    funds: [rules.initialFunds, rules.initialFunds],
    units: [],
    buildings: [],
    nextUid: 1,
    day: 1,
    rules: { ...rules },
  };
}

const isWater = (terrain: number) => TERRAIN.iswater[terrain]!;
const canBuildOn = (terrain: number) => TERRAIN.canbuild[terrain]!;
const isWalkable = (terrain: number) => Movement.canWalk(WALK, terrain);

/** Casillas del cuadrado de lado 2*radius+1 alrededor de `center` que caen dentro del mapa. */
const squareAround = (size: GridSize, center: Pos, radius: number): Pos[] =>
  squareArea(center, radius).filter((pos) => isInside(size, pos));

// ---------------------------------------------------------------------------------------------
// Terreno
// ---------------------------------------------------------------------------------------------

/** Las vecinas en el orden del original: izquierda, arriba, derecha, abajo. */
const sideNeighbours = (size: GridSize, pos: Pos): Pos[] =>
  [
    { x: pos.x - 1, y: pos.y },
    { x: pos.x, y: pos.y - 1 },
    { x: pos.x + 1, y: pos.y },
    { x: pos.x, y: pos.y + 1 },
  ].filter((neighbour) => isInside(size, neighbour));

/** Probabilidad de que `pos` sea `terrain`: la base del tema mas un extra por cada vecina ya hecha igual. */
function terrainChance(map: Grid<number>, generated: Grid<boolean>, pos: Pos, terrain: number, theme: number): number {
  const isSameAndDone = (neighbour: Pos) => generated.at(neighbour) && map.at(neighbour) === terrain;
  // Se suma de uno en uno (no `n * extra`) para que salgan los mismos decimales que antes.
  return sideNeighbours(map, pos)
    .filter(isSameAndDone)
    .reduce((chance) => chance + PROBS_PER_ADJ[theme]![terrain]!, TILE_BASE_PROBS[theme]![terrain]!);
}

/** Prueba los terrenos en orden ciclico hasta que uno sale; devuelve ese. */
function rollTerrain(rng: Rng, chanceOf: (terrain: number) => number): number {
  for (let terrain = 0; ; terrain = (terrain + 1) % TERRAIN_TYPES) if (rng() < chanceOf(terrain)) return terrain;
}

/** Crecimiento en anillos (RandomMap.generateTerrain). Devuelve las casillas transitables a pie. */
function growTerrain(s: GameState, origin: Pos, theme: number, rng: Rng): number {
  const map = mapGrid(s);
  const generated = map.createLayer(false);
  // Casilla de origen: solo probabilidad base.
  map.set(
    origin,
    rollTerrain(rng, (terrain) => TILE_BASE_PROBS[theme]![terrain]!),
  );
  let walkable = 0;
  for (let ring = 1; ; ring++) {
    const ringTiles = [...diamond(map, origin, ring, ring)];
    if (ringTiles.length === 0) return walkable;
    for (const pos of ringTiles) {
      map.set(
        pos,
        rollTerrain(rng, (terrain) => terrainChance(map, generated, pos, terrain, theme)),
      );
      generated.set(pos, true);
      if (isWalkable(map.at(pos))) walkable++;
    }
  }
}

/** Agua con tierra a los dos lados (en horizontal o en vertical, sin salir del borde). */
function isNarrowWater(map: Grid<number>, { x, y }: Pos): boolean {
  const isLand = (pos: Pos) => !isWater(map.at(pos));
  const isNarrowAcross = x > 0 && x < map.width - 1 && isLand({ x: x - 1, y }) && isLand({ x: x + 1, y });
  const isNarrowAlong = y > 0 && y < map.height - 1 && isLand({ x, y: y - 1 }) && isLand({ x, y: y + 1 });
  return isNarrowAcross || isNarrowAlong;
}

/** Agua estrecha -> agua poco profunda. Devuelve cuantas casillas cambian. */
function addShallowWater(map: Grid<number>): number {
  let changed = 0;
  // Va cambiando segun recorre: una casilla ya cambiada cuenta como tierra para las siguientes.
  for (const { pos, value } of map.cells()) {
    if (value !== TerrainType.WATER || !isNarrowWater(map, pos)) continue;
    map.set(pos, TerrainType.SHALLOW_WATER);
    changed++;
  }
  return changed;
}

/** Agua junto a tierra (incluidas diagonales) -> hielo. [CAMBIO] cuenta una vez por casilla. */
function addIce(map: Grid<number>): number {
  const isSolidLand = (pos: Pos) => !isWater(map.at(pos)) && map.at(pos) !== TerrainType.ICE;
  const toIce = [...map.cells()]
    .filter(({ pos, value }) => isWater(value) && squareAround(map, pos, 1).some(isSolidLand))
    .map(({ pos }) => pos);
  for (const pos of toIce) map.set(pos, TerrainType.ICE);
  return toIce.length;
}

/** Agua rodeada de agua (3x3) -> agua profunda. */
function addDeepWater(map: Grid<number>): void {
  const isAllWater = (pos: Pos) => squareAround(map, pos, 1).every((around) => isWater(map.at(around)));
  const deep = [...map.cells()].filter(({ pos }) => isAllWater(pos)).map(({ pos }) => pos);
  for (const pos of deep) map.set(pos, TerrainType.DEEP_WATER);
}

// ---------------------------------------------------------------------------------------------
// Zonas de inicio
// ---------------------------------------------------------------------------------------------

/** Hay bastante sitio para edificios y unidades en la zona de inicio alrededor de `pos`. */
function hasRoomToStart(s: GameState, pos: Pos): boolean {
  const zone = spawnZone(s, pos).map((tile) => terrainAt(s, tile));
  return zone.filter(canBuildOn).length >= MAPGEN.MINBCAP && zone.filter(isWalkable).length >= MAPGEN.MINUCAP;
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

/** La segunda zona tiene que poder alcanzarse a pie desde la primera y estar lejos. */
function findSecondSpawn(s: GameState, first: Pos): Pos | null {
  const fromFirst = groundDistance(s, first, WALK, createLayer(s, false));
  const minDistance = Math.round((MIN_SPAWN_DISTANCE * mapGrid(s).width) / ORIGINAL_MAP_SIDE);
  return findSpawn(s, true, (pos) => fromFirst.at(pos) > 0 && manhattan(pos, first) >= minDistance);
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

const spawnZone = (s: GameState, spawn: Pos) => [...diamond(mapGrid(s), spawn, 0, MAPGEN.MAXSPAWNDIST)];

/** Unidades iniciales: Soldier, Soldier, Artillery cerca del centro de la zona. */
function placeStartingUnits(s: GameState, spawn: Pos, team: Team, rng: Rng): void {
  MAPGEN.INITUS.forEach((type, index) => {
    const movement = Movement.of(type);
    const free = spawnZone(s, spawn).filter((pos) => Movement.canWalk(movement, terrainAt(s, pos)) && !unitAt(s, pos));
    // Con la probabilidad corregida (INITUS.length); si no sale ninguna, la ultima libre.
    const chosen = sampleInOrder(free, MAPGEN.INITUS.length - index, rng, (left) => left - 1) ?? free.at(-1);
    if (chosen) newUnit(s, type, team, chosen, true);
  });
}

/** Edificios iniciales: Base, City, Factory, Oil, Airport en la zona de inicio. Falla si no caben. */
function placeStartingBuildings(s: GameState, spawn: Pos, team: Team, rng: Rng): boolean {
  const total = MAPGEN.INITBS.length;
  for (let index = 0; index < total; index++) {
    const free = spawnZone(s, spawn).filter((pos) => canBuildOn(terrainAt(s, pos)) && !buildingAt(s, pos));
    if (!free.length) return false;
    // El original recorre el rombo dando vueltas; equivale a elegir con prob. creciente.
    let chosen: Pos | null = null;
    for (let tries = 0; !chosen && tries < BUILDING_PICK_TRIES; tries++)
      chosen = sampleInOrder(free, total - index, rng, (left) => Math.max(1, left - 1));
    chosen ??= free[0]!;
    s.buildings.push({ type: MAPGEN.INITBS[index]!, owner: team, x: chosen.x, y: chosen.y });
  }
  return true;
}

/** Cuantos edificios neutrales de cada tipo (24..30 en total, escalado con la superficie). */
function rollNeutralCounts(size: GridSize, rng: Rng): number[] {
  const isTotalAllowed = (total: number) =>
    total >= Math.floor(MAPGEN.MINNB * areaScale(size)) && total <= Math.ceil(MAPGEN.MAXNB * areaScale(size));
  for (;;) {
    // [CAMBIO] en mapas de otro tamaño, el numero de edificios neutrales se escala con la superficie.
    const scale = areaScale(size);
    const counts = MAPGEN.MINNBS.map((min, type) => Math.round((min + Math.floor(rng() * (MAPGEN.MAXNBS[type]! - min + 1))) * scale));
    if (isTotalAllowed(counts.reduce((sum, count) => sum + count, 0))) return counts;
  }
}

/** Edificios neutrales repartidos uniformemente por el mapa (algoritmo S de Knuth). */
function placeNeutralBuildings(s: GameState, rng: Rng): void {
  const map = mapGrid(s);
  const toPlace = rollNeutralCounts(map, rng);
  const available = map.createLayer(false);
  let availableCount = 0;
  for (const { pos, value } of map.cells())
    if (canBuildOn(value) && !buildingAt(s, pos)) {
      available.set(pos, true);
      availableCount++;
    }
  toPlace.forEach((count, type) => {
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
  const zone = squareAround(mapGrid(s), center, s.rules.controlRadius);
  return zone.filter((pos) => isWalkable(terrainAt(s, pos))).length >= zone.length * MIN_CONTROL_LAND;
}

/** Casilla libre de tierra, alcanzable desde las dos salidas y no pegada a ninguna. */
function isControlSpot(s: GameState, pos: Pos, toPlayer: number, toEnemy: number, span: number): boolean {
  if (!toPlayer || !toEnemy) return false;
  if (!isWalkable(terrainAt(s, pos)) || buildingAt(s, pos) || unitAt(s, pos)) return false;
  if (Math.min(toPlayer, toEnemy) < span * MIN_CONTROL_SPAWN_SHARE) return false;
  return isMostlyLand(s, pos);
}

/**
 * [CAMBIO] Puntos de control (regla controlPoints): zonas de tierra, con el centro igual de lejos (a
 * pie) de las dos zonas de salida, ni pegadas a ellas ni entre si. Asi hay algo por lo que pelear en el
 * medio del mapa. Si no caben todos, pone los que pueda.
 */
export function placeControlPoints(s: GameState, a: Pos, b: Pos, rng: Rng): void {
  const wanted = s.rules.controlPoints;
  if (wanted <= 0) return;
  const fromA = groundDistance(s, a, WALK, createLayer(s, false));
  const fromB = groundDistance(s, b, WALK, createLayer(s, false));
  const span = fromA.at(b) || manhattan(a, b);
  const candidates: { pos: Pos; score: number }[] = [];
  for (const { pos, value: toA } of fromA.cells()) {
    const toB = fromB.at(pos);
    if (!isControlSpot(s, pos, toA, toB, span)) continue;
    // Lo justo: misma distancia a las dos salidas.
    candidates.push({ pos, score: Math.abs(toA - toB) + rng() * CONTROL_SCORE_NOISE });
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
  forcedTheme: number | null;
  /** Casillas a pie del terreno, mas las de agua que se vuelven transitables. */
  landTiles: number;
  /** Zonas de inicio del jugador y de la IA, cuando ya se han buscado. */
  spawns: { player: Pos; enemy: Pos } | null;
}

interface MapStep {
  name: string;
  /** Devuelve false si este mapa no vale y hay que empezar otro. */
  run: (draft: MapDraft) => boolean;
}

function spawnsOf(draft: MapDraft): { player: Pos; enemy: Pos } {
  if (!draft.spawns) throw new Error('Paso de mapa fuera de orden: aun no hay zonas de inicio');
  return draft.spawns;
}

/** Siempre se tira el dado del tema, aunque venga fijado, para no mover el resto de la secuencia. */
function chooseTheme(draft: MapDraft): boolean {
  const randomTheme = Math.floor(draft.rng() * MAPGEN.isSWater.length);
  draft.s.theme = draft.forcedTheme ?? randomTheme;
  return true;
}

/** Agua poco profunda o hielo segun el tema, y agua profunda. Devuelve las casillas de agua que pasan a ser transitables a pie. */
function shapeWater(s: GameState): number {
  let newLand = 0;
  const map = mapGrid(s);
  if (MAPGEN.isSWater[s.theme]) newLand += addShallowWater(map);
  if (MAPGEN.isIce[s.theme]) newLand += addIce(map);
  addDeepWater(map);
  return newLand;
}

/** Tras muchos intentos con poca tierra se acepta el mapa que salga. */
const hasEnoughLand = (draft: MapDraft) =>
  draft.landTiles >= MAPGEN.MINTILENUM * areaScale(mapGrid(draft.s)) || draft.attempt >= MAX_ATTEMPTS_FOR_LAND;

/**
 * [CAMBIO] el original daba siempre la primera zona al jugador y la segunda a la IA. La segunda
 * sale mejor situada mas a menudo (la herramienta de equilibrio: 59-61 % de ventaja para ese
 * lado, en los dos sentidos). Ahora se sortea quien empieza en cada una.
 */
function findStartZones(draft: MapDraft): boolean {
  const first = findSpawn(draft.s, false, () => true);
  if (!first) return false;
  const second = findSecondSpawn(draft.s, first);
  if (!second) return false;
  const [player, enemy] = draft.rng() < 0.5 ? [first, second] : [second, first];
  draft.spawns = { player, enemy };
  return true;
}

const MAP_STEPS: readonly MapStep[] = [
  { name: 'tema', run: chooseTheme },
  {
    name: 'terreno',
    run: (draft) => {
      draft.landTiles = growTerrain(draft.s, draft.origin, draft.s.theme, draft.rng);
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
    run: (draft) => {
      const { player, enemy } = spawnsOf(draft);
      return placeStartingBuildings(draft.s, player, PLAYER, draft.rng) && placeStartingBuildings(draft.s, enemy, ENEMY, draft.rng);
    },
  },
  {
    name: 'unidades iniciales',
    run: (draft) => {
      const { player, enemy } = spawnsOf(draft);
      placeStartingUnits(draft.s, player, PLAYER, draft.rng);
      placeStartingUnits(draft.s, enemy, ENEMY, draft.rng);
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
      const { player, enemy } = spawnsOf(draft);
      placeControlPoints(draft.s, player, enemy, draft.rng);
      return true;
    },
  },
];

/** Como se quiere el mapa al azar: lado, tema (null = al azar) y reglas de la partida. */
export interface NewMapOptions {
  size?: number;
  theme?: number | null;
  rules?: Readonly<RulesConfig>;
}

/**
 * Genera una partida nueva con mapa aleatorio y las reglas dadas (las de siempre si no se dicen). Si
 * un paso falla, se empieza otro mapa desde el principio.
 */
export function generateGame(rng: Rng = Math.random, opts: NewMapOptions = {}): GameState {
  const size = opts.size ?? ORIGINAL_MAP_SIDE;
  // El punto de partida del terreno se sortea una vez y vale para todos los intentos.
  const origin = { x: Math.floor(rng() * size), y: Math.floor(rng() * size) };
  for (let attempt = 0; ; attempt++) {
    const draft: MapDraft = {
      s: emptyState(size, opts.rules ?? DEFAULT_RULES),
      rng,
      origin,
      attempt,
      forcedTheme: opts.theme ?? null,
      landTiles: 0,
      spawns: null,
    };
    if (MAP_STEPS.every((step) => step.run(draft))) return draft.s;
  }
}
