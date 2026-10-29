/**
 * Generador de mapas aleatorios (RandomMap.java).
 * El terreno crece en anillos desde un punto al azar; cada casilla elige terreno segun
 * una probabilidad base del tema mas un extra por cada vecina igual ya generada.
 * Despues: agua poco profunda o hielo, agua profunda, zonas de inicio, edificios y unidades.
 * [CAMBIO] las zonas de inicio se buscan al final, deben existir, estar conectadas por
 * tierra y separadas; si no, se genera otro mapa (en el original podian faltar o solaparse).
 */
import {
  RULES,
  MAP_H,
  MAP_W,
  setMapSize,
  MAPGEN,
  PROBS_PER_ADJ,
  T_DWATER,
  T_ICE,
  T_SWATER,
  T_WATER,
  TERRAIN,
  TERRAIN_TYPES,
  TILE_BASE_PROBS,
  UNIT,
} from './data';
import { grid, inBounds, manhattan, rangePos, rangeSize } from './geom';
import { buildingAt, groundDistance, newUnit, unitAt } from './rules';
import type { GameState, Pos, Rng, Team } from './types';

const WALK = 0; // tipo de movimiento "a pie"
/** Distancia minima entre las dos bases en un mapa de 32; se escala con el lado del mapa. */
const MIN_SPAWN_DISTANCE = 14;
/** Superficie del mapa respecto al original de 32x32 (para escalar cuantos edificios hay). */
const areaScale = () => (MAP_W * MAP_H) / (32 * 32);

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

const isWater = (t: number) => TERRAIN.iswater[t]!;

function tileProb(map: number[][], generated: boolean[][], x: number, y: number, tile: number, theme: number): number {
  let p = TILE_BASE_PROBS[theme]![tile]!;
  for (const [nx, ny] of [
    [x - 1, y],
    [x, y - 1],
    [x + 1, y],
    [x, y + 1],
  ] as const) {
    if (inBounds(nx, ny) && generated[nx]![ny] && map[nx]![ny] === tile) p += PROBS_PER_ADJ[theme]![tile]!;
  }
  return p;
}

/** Crecimiento en anillos (RandomMap.generateTerrain). Devuelve las casillas transitables a pie. */
function generateTerrain(s: GameState, origin: Pos, theme: number, rng: Rng): number {
  const generated = grid(false);
  // Casilla de origen: solo probabilidad base, probando los terrenos en orden ciclico.
  for (let t = 0; ; t = (t + 1) % TERRAIN_TYPES) {
    if (rng() < TILE_BASE_PROBS[theme]![t]!) {
      s.map[origin.x]![origin.y] = t;
      break;
    }
  }
  let walkable = 0;
  for (let ring = 1; ; ring++) {
    let placed = 0;
    for (let i = rangeSize(ring - 1); i < rangeSize(ring); i++) {
      const p = rangePos(origin, i);
      if (!p) continue;
      for (let t = 0; ; t = (t + 1) % TERRAIN_TYPES) {
        if (rng() < tileProb(s.map, generated, p.x, p.y, t, theme)) {
          s.map[p.x]![p.y] = t;
          break;
        }
      }
      generated[p.x]![p.y] = true;
      placed++;
      if (TERRAIN.canwalk[WALK][s.map[p.x]![p.y]!]) walkable++;
    }
    if (placed === 0) break;
  }
  return walkable;
}

/** Agua estrecha (sin agua a ambos lados en horizontal o en vertical) -> agua poco profunda. */
function addShallowWater(map: number[][]): number {
  let n = 0;
  for (let x = 0; x < MAP_W; x++) {
    for (let y = 0; y < MAP_H; y++) {
      if (map[x]![y] !== T_WATER) continue;
      const h = x > 0 && x < MAP_W - 1 && !isWater(map[x - 1]![y]!) && !isWater(map[x + 1]![y]!);
      const v = y > 0 && y < MAP_H - 1 && !isWater(map[x]![y - 1]!) && !isWater(map[x]![y + 1]!);
      if (h || v) {
        map[x]![y] = T_SWATER;
        n++;
      }
    }
  }
  return n;
}

/** Agua junto a tierra (incluidas diagonales) -> hielo. [CAMBIO] cuenta una vez por casilla. */
function addIce(map: number[][]): number {
  const toIce: Pos[] = [];
  for (let x = 0; x < MAP_W; x++) {
    for (let y = 0; y < MAP_H; y++) {
      if (!isWater(map[x]![y]!)) continue;
      let land = false;
      for (let dx = -1; dx <= 1 && !land; dx++)
        for (let dy = -1; dy <= 1 && !land; dy++) {
          const nx = x + dx,
            ny = y + dy;
          if (inBounds(nx, ny) && !isWater(map[nx]![ny]!) && map[nx]![ny] !== T_ICE) land = true;
        }
      if (land) toIce.push({ x, y });
    }
  }
  for (const p of toIce) map[p.x]![p.y] = T_ICE;
  return toIce.length;
}

/** Agua rodeada de agua (3x3) -> agua profunda. */
function addDeepWater(map: number[][]): void {
  const deep: Pos[] = [];
  for (let x = 0; x < MAP_W; x++) {
    for (let y = 0; y < MAP_H; y++) {
      let all = true;
      for (let dx = -1; dx <= 1 && all; dx++)
        for (let dy = -1; dy <= 1 && all; dy++) {
          const nx = x + dx,
            ny = y + dy;
          if (inBounds(nx, ny) && !isWater(map[nx]![ny]!)) all = false;
        }
      if (all) deep.push({ x, y });
    }
  }
  for (const p of deep) map[p.x]![p.y] = T_DWATER;
}

/** Zona de inicio (RandomMap.getSpawn): casilla a pie con bastante sitio alrededor. */
function findSpawn(s: GameState, reverse: boolean, accept: (p: Pos) => boolean): Pos | null {
  const R = MAPGEN.MAXSPAWNDIST;
  for (let i = 0; i < MAP_W; i++) {
    const x = reverse ? MAP_W - 1 - i : i;
    for (let j = 0; j < MAP_H; j++) {
      const y = reverse ? MAP_H - 1 - j : j;
      if (!TERRAIN.canwalk[WALK][s.map[x]![y]!]) continue;
      let buildable = 0,
        walkable = 0;
      for (let k = 0; k < rangeSize(R); k++) {
        const p = rangePos({ x, y }, k);
        if (!p) continue;
        const t = s.map[p.x]![p.y]!;
        if (TERRAIN.canbuild[t]) buildable++;
        if (TERRAIN.canwalk[WALK][t]) walkable++;
      }
      if (buildable >= MAPGEN.MINBCAP && walkable >= MAPGEN.MINUCAP && accept({ x, y })) return { x, y };
    }
  }
  return null;
}

/** Unidades iniciales: Soldier, Soldier, Artillery cerca del centro de la zona. */
function generateUnits(s: GameState, spawn: Pos, team: Team, rng: Rng): void {
  const n = rangeSize(MAPGEN.MAXSPAWNDIST);
  MAPGEN.INITUS.forEach((type, u) => {
    const mt = UNIT.movtype[type];
    const free: Pos[] = [];
    for (let k = 0; k < n; k++) {
      const p = rangePos(spawn, k);
      if (p && TERRAIN.canwalk[mt][s.map[p.x]![p.y]!] && !unitAt(s, p.x, p.y)) free.push(p);
    }
    // Muestreo secuencial como el original, con la probabilidad corregida (INITUS.length).
    let remaining = free.length;
    for (const p of free) {
      if (rng() < (MAPGEN.INITUS.length - u) / remaining) {
        newUnit(s, type, team, p.x, p.y, true);
        return;
      }
      remaining--;
    }
    if (free.length) {
      const p = free[free.length - 1]!;
      newUnit(s, type, team, p.x, p.y, true);
    }
  });
}

/** Edificios iniciales: Base, City, Factory, Oil, Airport en la zona de inicio. */
function generateBuilds(s: GameState, spawn: Pos, team: Team, rng: Rng): boolean {
  const n = rangeSize(MAPGEN.MAXSPAWNDIST);
  const total = MAPGEN.INITBS.length;
  for (let b = 0; b < total; b++) {
    const free: Pos[] = [];
    for (let k = 0; k < n; k++) {
      const p = rangePos(spawn, k);
      if (p && TERRAIN.canbuild[s.map[p.x]![p.y]!] && !buildingAt(s, p.x, p.y)) free.push(p);
    }
    if (!free.length) return false;
    let chosen: Pos | null = null;
    // El original recorre el rombo dando vueltas; equivale a elegir con prob. creciente.
    for (let tries = 0; !chosen && tries < 100; tries++) {
      let left = free.length;
      for (const p of free) {
        if (rng() < (total - b) / left) {
          chosen = p;
          break;
        }
        left = Math.max(1, left - 1);
      }
    }
    chosen ??= free[0]!;
    s.buildings.push({ type: MAPGEN.INITBS[b]!, owner: team, x: chosen.x, y: chosen.y });
  }
  return true;
}

/** Edificios neutrales (24..30) repartidos uniformemente por el mapa (algoritmo S de Knuth). */
function generateNeutral(s: GameState, rng: Rng): void {
  let toPlace: number[];
  let total: number;
  do {
    // [CAMBIO] en mapas de otro tamaño, el numero de edificios neutrales se escala con la superficie.
    const k = areaScale();
    toPlace = MAPGEN.MINNBS.map((min, t) => Math.round((min + Math.floor(rng() * (MAPGEN.MAXNBS[t]! - min + 1))) * k));
    total = toPlace.reduce((a, b) => a + b, 0);
  } while (total < Math.floor(MAPGEN.MINNB * areaScale()) || total > Math.ceil(MAPGEN.MAXNB * areaScale()));

  const available = grid(false);
  let availableCount = 0;
  for (let x = 0; x < MAP_W; x++)
    for (let y = 0; y < MAP_H; y++)
      if (TERRAIN.canbuild[s.map[x]![y]!] && !buildingAt(s, x, y)) {
        available[x]![y] = true;
        availableCount++;
      }

  for (let t = 0; t < toPlace.length; t++) {
    let remaining = availableCount;
    outer: for (let x = 0; x < MAP_W; x++) {
      for (let y = 0; y < MAP_H; y++) {
        if (toPlace[t]! <= 0) break outer;
        if (!available[x]![y]) continue;
        if (rng() < toPlace[t]! / remaining) {
          s.buildings.push({ type: t, owner: null, x, y });
          available[x]![y] = false;
          toPlace[t]!--;
          availableCount--;
        }
        remaining--;
      }
    }
  }
}

/** Genera una partida nueva con mapa aleatorio. */
export function generateGame(rng: Rng = Math.random, opts: { size?: number; theme?: number | null } = {}): GameState {
  setMapSize(opts.size ?? 32);
  const origin = { x: Math.floor(rng() * MAP_W), y: Math.floor(rng() * MAP_H) };
  for (let attempt = 0; ; attempt++) {
    const s = emptyState();
    const randomTheme = Math.floor(rng() * MAPGEN.isSWater.length);
    s.theme = opts.theme ?? randomTheme;
    let tileCount = generateTerrain(s, origin, s.theme, rng);
    if (MAPGEN.isSWater[s.theme]) tileCount += addShallowWater(s.map);
    if (MAPGEN.isIce[s.theme]) tileCount += addIce(s.map);
    addDeepWater(s.map);
    if (tileCount < MAPGEN.MINTILENUM * areaScale() && attempt < 500) continue;

    const first = findSpawn(s, false, () => true);
    if (!first) continue;
    const reach = groundDistance(s, first, WALK, grid(false));
    const second = findSpawn(s, true, (p) => reach[p.x]![p.y]! > 0 && manhattan(p, first) >= Math.round((MIN_SPAWN_DISTANCE * MAP_W) / 32));
    if (!second) continue;
    // [CAMBIO] el original daba siempre la primera zona al jugador y la segunda a la IA. La segunda
    // sale mejor situada mas a menudo (la herramienta de equilibrio: 59-61 % de ventaja para ese
    // lado, en los dos sentidos). Ahora se sortea quien empieza en cada una.
    const [player, enemy] = rng() < 0.5 ? [first, second] : [second, first];

    if (!generateBuilds(s, player, 0, rng) || !generateBuilds(s, enemy, 1, rng)) continue;
    generateUnits(s, player, 0, rng);
    generateUnits(s, enemy, 1, rng);
    generateNeutral(s, rng);
    return s;
  }
}
