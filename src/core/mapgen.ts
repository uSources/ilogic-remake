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
import {
  RULES,
  MAP_H,
  MAP_W,
  setMapSize,
  MAPGEN,
  PROBS_PER_ADJ,
  TERRAIN,
  TERRAIN_TYPES,
  TILE_BASE_PROBS,
  Movement,
  TerrainType,
  MoveType,
} from './data';
import { diamond, grid, inBounds, manhattan } from './geom';
import { newUnit } from './rules/lifecycle';
import { groundDistance } from './rules/movement';
import { buildingAt, unitAt } from './rules/queries';
import { cellAt, cells, setCell, type Grid } from './util/grid';
import type { GameState, Pos, Rng, Team } from './types';

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
const areaScale = () => (MAP_W * MAP_H) / (ORIGINAL_MAP_SIDE * ORIGINAL_MAP_SIDE);

function emptyState(): GameState {
  return {
    version: 1,
    map: grid(0),
    theme: 0,
    funds: [RULES.initialFunds, RULES.initialFunds],
    units: [],
    buildings: [],
    nextUid: 1,
    day: 1,
    rules: { ...RULES },
  };
}

const isWater = (terrain: number) => TERRAIN.iswater[terrain]!;
const canBuildOn = (terrain: number) => TERRAIN.canbuild[terrain]!;
const isWalkable = (terrain: number) => Movement.canWalk(WALK, terrain);

/** Casillas del cuadrado de lado 2*radius+1 alrededor de `center` que caen dentro del mapa. */
function* squareAround(center: Pos, radius: number): Generator<Pos> {
  for (let dx = -radius; dx <= radius; dx++)
    for (let dy = -radius; dy <= radius; dy++) {
      const pos = { x: center.x + dx, y: center.y + dy };
      if (inBounds(pos.x, pos.y)) yield pos;
    }
}

// ---------------------------------------------------------------------------------------------
// Terreno
// ---------------------------------------------------------------------------------------------

/** Las vecinas en el orden del original: izquierda, arriba, derecha, abajo. */
const sideNeighbours = (pos: Pos): Pos[] =>
  [
    { x: pos.x - 1, y: pos.y },
    { x: pos.x, y: pos.y - 1 },
    { x: pos.x + 1, y: pos.y },
    { x: pos.x, y: pos.y + 1 },
  ].filter((neighbour) => inBounds(neighbour.x, neighbour.y));

/** Probabilidad de que `pos` sea `terrain`: la base del tema mas un extra por cada vecina ya hecha igual. */
function terrainChance(map: Grid<number>, generated: Grid<boolean>, pos: Pos, terrain: number, theme: number): number {
  const isSameAndDone = (neighbour: Pos) => cellAt(generated, neighbour) && cellAt(map, neighbour) === terrain;
  // Se suma de uno en uno (no `n * extra`) para que salgan los mismos decimales que antes.
  return sideNeighbours(pos)
    .filter(isSameAndDone)
    .reduce((chance) => chance + PROBS_PER_ADJ[theme]![terrain]!, TILE_BASE_PROBS[theme]![terrain]!);
}

/** Prueba los terrenos en orden ciclico hasta que uno sale; devuelve ese. */
function rollTerrain(rng: Rng, chanceOf: (terrain: number) => number): number {
  for (let terrain = 0; ; terrain = (terrain + 1) % TERRAIN_TYPES) if (rng() < chanceOf(terrain)) return terrain;
}

/** Crecimiento en anillos (RandomMap.generateTerrain). Devuelve las casillas transitables a pie. */
function growTerrain(s: GameState, origin: Pos, theme: number, rng: Rng): number {
  const generated = grid(false);
  // Casilla de origen: solo probabilidad base.
  setCell(
    s.map,
    origin,
    rollTerrain(rng, (terrain) => TILE_BASE_PROBS[theme]![terrain]!),
  );
  let walkable = 0;
  for (let ring = 1; ; ring++) {
    const ringTiles = [...diamond(origin, ring, ring)];
    if (ringTiles.length === 0) return walkable;
    for (const pos of ringTiles) {
      setCell(
        s.map,
        pos,
        rollTerrain(rng, (terrain) => terrainChance(s.map, generated, pos, terrain, theme)),
      );
      setCell(generated, pos, true);
      if (isWalkable(cellAt(s.map, pos))) walkable++;
    }
  }
}

/** Agua con tierra a los dos lados (en horizontal o en vertical, sin salir del borde). */
function isNarrowWater(map: Grid<number>, { x, y }: Pos): boolean {
  const isLand = (pos: Pos) => !isWater(cellAt(map, pos));
  const isNarrowAcross = x > 0 && x < MAP_W - 1 && isLand({ x: x - 1, y }) && isLand({ x: x + 1, y });
  const isNarrowAlong = y > 0 && y < MAP_H - 1 && isLand({ x, y: y - 1 }) && isLand({ x, y: y + 1 });
  return isNarrowAcross || isNarrowAlong;
}

/** Agua estrecha -> agua poco profunda. Devuelve cuantas casillas cambian. */
function addShallowWater(map: Grid<number>): number {
  let changed = 0;
  // Va cambiando segun recorre: una casilla ya cambiada cuenta como tierra para las siguientes.
  for (const { pos, value } of cells(map)) {
    if (value !== TerrainType.WATER || !isNarrowWater(map, pos)) continue;
    setCell(map, pos, TerrainType.SHALLOW_WATER);
    changed++;
  }
  return changed;
}

/** Agua junto a tierra (incluidas diagonales) -> hielo. [CAMBIO] cuenta una vez por casilla. */
function addIce(map: Grid<number>): number {
  const isSolidLand = (pos: Pos) => !isWater(cellAt(map, pos)) && cellAt(map, pos) !== TerrainType.ICE;
  const toIce = [...cells(map)]
    .filter(({ pos, value }) => isWater(value) && [...squareAround(pos, 1)].some(isSolidLand))
    .map(({ pos }) => pos);
  for (const pos of toIce) setCell(map, pos, TerrainType.ICE);
  return toIce.length;
}

/** Agua rodeada de agua (3x3) -> agua profunda. */
function addDeepWater(map: Grid<number>): void {
  const isAllWater = (pos: Pos) => [...squareAround(pos, 1)].every((around) => isWater(cellAt(map, around)));
  const deep = [...cells(map)].filter(({ pos }) => isAllWater(pos)).map(({ pos }) => pos);
  for (const pos of deep) setCell(map, pos, TerrainType.DEEP_WATER);
}

// ---------------------------------------------------------------------------------------------
// Zonas de inicio
// ---------------------------------------------------------------------------------------------

/** Hay bastante sitio para edificios y unidades en la zona de inicio alrededor de `pos`. */
function hasRoomToStart(s: GameState, pos: Pos): boolean {
  const zone = [...diamond(pos, 0, MAPGEN.MAXSPAWNDIST)].map((tile) => cellAt(s.map, tile));
  return zone.filter(canBuildOn).length >= MAPGEN.MINBCAP && zone.filter(isWalkable).length >= MAPGEN.MINUCAP;
}

/** Casillas del mapa columna a columna; con `fromTheEnd`, empezando por la esquina opuesta. */
function* scanOrder(fromTheEnd: boolean): Generator<Pos> {
  for (let i = 0; i < MAP_W; i++)
    for (let j = 0; j < MAP_H; j++) yield fromTheEnd ? { x: MAP_W - 1 - i, y: MAP_H - 1 - j } : { x: i, y: j };
}

/** Zona de inicio (RandomMap.getSpawn): la primera casilla a pie con bastante sitio alrededor. */
function findSpawn(s: GameState, fromTheEnd: boolean, accept: (pos: Pos) => boolean): Pos | null {
  for (const pos of scanOrder(fromTheEnd)) if (isWalkable(cellAt(s.map, pos)) && hasRoomToStart(s, pos) && accept(pos)) return pos;
  return null;
}

/** La segunda zona tiene que poder alcanzarse a pie desde la primera y estar lejos. */
function findSecondSpawn(s: GameState, first: Pos): Pos | null {
  const fromFirst = groundDistance(s, first, WALK, grid(false));
  const minDistance = Math.round((MIN_SPAWN_DISTANCE * MAP_W) / ORIGINAL_MAP_SIDE);
  return findSpawn(s, true, (pos) => cellAt(fromFirst, pos) > 0 && manhattan(pos, first) >= minDistance);
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

const spawnZone = (spawn: Pos) => [...diamond(spawn, 0, MAPGEN.MAXSPAWNDIST)];

/** Unidades iniciales: Soldier, Soldier, Artillery cerca del centro de la zona. */
function placeStartingUnits(s: GameState, spawn: Pos, team: Team, rng: Rng): void {
  MAPGEN.INITUS.forEach((type, index) => {
    const movement = Movement.of(type);
    const free = spawnZone(spawn).filter((pos) => Movement.canWalk(movement, cellAt(s.map, pos)) && !unitAt(s, pos.x, pos.y));
    // Con la probabilidad corregida (INITUS.length); si no sale ninguna, la ultima libre.
    const chosen = sampleInOrder(free, MAPGEN.INITUS.length - index, rng, (left) => left - 1) ?? free.at(-1);
    if (chosen) newUnit(s, type, team, chosen.x, chosen.y, true);
  });
}

/** Edificios iniciales: Base, City, Factory, Oil, Airport en la zona de inicio. Falla si no caben. */
function placeStartingBuildings(s: GameState, spawn: Pos, team: Team, rng: Rng): boolean {
  const total = MAPGEN.INITBS.length;
  for (let index = 0; index < total; index++) {
    const free = spawnZone(spawn).filter((pos) => canBuildOn(cellAt(s.map, pos)) && !buildingAt(s, pos.x, pos.y));
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
function rollNeutralCounts(rng: Rng): number[] {
  const isTotalAllowed = (total: number) =>
    total >= Math.floor(MAPGEN.MINNB * areaScale()) && total <= Math.ceil(MAPGEN.MAXNB * areaScale());
  for (;;) {
    // [CAMBIO] en mapas de otro tamaño, el numero de edificios neutrales se escala con la superficie.
    const scale = areaScale();
    const counts = MAPGEN.MINNBS.map((min, type) => Math.round((min + Math.floor(rng() * (MAPGEN.MAXNBS[type]! - min + 1))) * scale));
    if (isTotalAllowed(counts.reduce((sum, count) => sum + count, 0))) return counts;
  }
}

/** Edificios neutrales repartidos uniformemente por el mapa (algoritmo S de Knuth). */
function placeNeutralBuildings(s: GameState, rng: Rng): void {
  const toPlace = rollNeutralCounts(rng);
  const available = grid(false);
  let availableCount = 0;
  for (const { pos, value } of cells(s.map))
    if (canBuildOn(value) && !buildingAt(s, pos.x, pos.y)) {
      setCell(available, pos, true);
      availableCount++;
    }
  toPlace.forEach((count, type) => {
    let missing = count;
    let remaining = availableCount;
    for (const { pos, value: isAvailable } of cells(available)) {
      if (missing <= 0) return;
      if (!isAvailable) continue;
      if (rng() < missing / remaining) {
        s.buildings.push({ type, owner: null, x: pos.x, y: pos.y });
        setCell(available, pos, false);
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
  const zone = [...squareAround(center, RULES.controlRadius)];
  return zone.filter((pos) => isWalkable(cellAt(s.map, pos))).length >= zone.length * MIN_CONTROL_LAND;
}

/** Casilla libre de tierra, alcanzable desde las dos salidas y no pegada a ninguna. */
function isControlSpot(s: GameState, pos: Pos, toPlayer: number, toEnemy: number, span: number): boolean {
  if (!toPlayer || !toEnemy) return false;
  if (!isWalkable(cellAt(s.map, pos)) || buildingAt(s, pos.x, pos.y) || unitAt(s, pos.x, pos.y)) return false;
  if (Math.min(toPlayer, toEnemy) < span * MIN_CONTROL_SPAWN_SHARE) return false;
  return isMostlyLand(s, pos);
}

/**
 * [CAMBIO] Puntos de control (RULES.controlPoints): zonas de tierra, con el centro igual de lejos (a
 * pie) de las dos zonas de salida, ni pegadas a ellas ni entre si. Asi hay algo por lo que pelear en el
 * medio del mapa. Si no caben todos, pone los que pueda.
 */
export function placeControlPoints(s: GameState, a: Pos, b: Pos, rng: Rng): void {
  const wanted = RULES.controlPoints;
  if (wanted <= 0) return;
  const fromA = groundDistance(s, a, WALK, grid(false));
  const fromB = groundDistance(s, b, WALK, grid(false));
  const span = cellAt(fromA, b) || manhattan(a, b);
  const candidates: { pos: Pos; score: number }[] = [];
  for (const { pos, value: toA } of cells(fromA)) {
    const toB = cellAt(fromB, pos);
    if (!isControlSpot(s, pos, toA, toB, span)) continue;
    // Lo justo: misma distancia a las dos salidas.
    candidates.push({ pos, score: Math.abs(toA - toB) + rng() * CONTROL_SCORE_NOISE });
  }
  candidates.sort((first, second) => first.score - second.score);
  const minGap = Math.max(3, Math.round(MAP_W / 4)) + 2 * RULES.controlRadius;
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
  if (MAPGEN.isSWater[s.theme]) newLand += addShallowWater(s.map);
  if (MAPGEN.isIce[s.theme]) newLand += addIce(s.map);
  addDeepWater(s.map);
  return newLand;
}

/** Tras muchos intentos con poca tierra se acepta el mapa que salga. */
const hasEnoughLand = (draft: MapDraft) => draft.landTiles >= MAPGEN.MINTILENUM * areaScale() || draft.attempt >= MAX_ATTEMPTS_FOR_LAND;

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

/** Genera una partida nueva con mapa aleatorio. Si un paso falla, se empieza otro mapa desde el principio. */
export function generateGame(rng: Rng = Math.random, opts: { size?: number; theme?: number | null } = {}): GameState {
  setMapSize(opts.size ?? ORIGINAL_MAP_SIDE);
  // El punto de partida del terreno se sortea una vez y vale para todos los intentos.
  const origin = { x: Math.floor(rng() * MAP_W), y: Math.floor(rng() * MAP_H) };
  for (let attempt = 0; ; attempt++) {
    const draft: MapDraft = { s: emptyState(), rng, origin, attempt, forcedTheme: opts.theme ?? null, landTiles: 0, spawns: null };
    if (MAP_STEPS.every((step) => step.run(draft))) return draft.s;
  }
}
