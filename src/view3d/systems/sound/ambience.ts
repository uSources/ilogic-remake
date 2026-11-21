/**
 * Que ambiente suena en cada sitio del mapa: el mar en la costa (y alrededor de la isla), pajaros en el
 * bosque, viento en las cumbres, ranas en el pantano, maquinas en las fabricas... Puro: del estado de la
 * partida salen los emisores (`ambientEmitters`), y de donde esta el oyente, cuales suenan
 * (`emittersInEarshot`). Lo hace sonar ambiencePlayer.ts.
 */
import type { BedAmbient, WeatherAmbient, ZoneAmbient } from '../../../audio/ambientNames';
import { terrainAt, themeOf } from '../../../core/gameContent';
import { neighbors4 } from '../../../core/geom';
import { mapGrid } from '../../../core/mapGrid';
import type { GameState, Pos } from '../../../core/model';
import type { Point3 } from '../../ports/camera';

/** Un sitio del mapa del que sale un ambiente, a `level` de su volumen (mas casillas, mas fuerte). */
export interface AmbientEmitter {
  readonly sound: ZoneAmbient;
  readonly at: Pos;
  readonly level: number;
}

/** El sonido de cada suelo (id de terrain.json); el agua va aparte (costa o pantano). */
const TERRAIN_AMBIENTS: Readonly<Record<string, ZoneAmbient>> = {
  Grass: 'amb_meadow',
  Flowers: 'amb_meadow',
  Woods: 'amb_woods',
  Sand: 'amb_dunes',
  Cactus: 'amb_dunes',
  GrassMountain: 'amb_peaks',
  SandMountain: 'amb_peaks',
  SnowMountain: 'amb_peaks',
  Snow: 'amb_snowfield',
  Frosty: 'amb_snowfield',
  SnowWood: 'amb_snowfield',
  Ice: 'amb_snowfield',
};
/** Los edificios con maquinas que se mueven (id de buildings.json). */
const BUILDING_AMBIENTS: Readonly<Record<string, ZoneAmbient>> = { Factory: 'amb_factory', Oil: 'amb_oil_pump' };
/** El fondo flojo de cada tema (id de themes.json), sin sitio. */
const BED_AMBIENTS: Readonly<Record<string, BedAmbient>> = {
  Plains: 'amb_plains',
  Desert: 'amb_desert',
  Forest: 'amb_forest',
  Swamp: 'amb_swamp',
  Snowy: 'amb_snowy',
};
/** El clima (id de weather.json), sin sitio; despejado no suena. */
const WEATHER_AMBIENTS: Readonly<Record<string, WeatherAmbient>> = {
  Rain: 'amb_rain',
  Storm: 'amb_storm',
  Snow: 'amb_snowfall',
  Sandstorm: 'amb_sandstorm',
};
/** En este tema el agua de dentro de la isla es cienaga, no mar. */
const MARSH_THEME = 'Swamp';

/** Los emisores se juntan por trozos del mapa de este lado (casillas): uno por sonido y trozo. */
const REGION_SIZE = 6;
/** Un trozo con menos casillas de un sonido no lo tiene (dos arboles sueltos no son un bosque). */
const MIN_TILES = 4;
/** Con estas casillas un emisor suena entero; con menos, en proporcion, sin bajar de `MIN_LEVEL`. */
const FULL_TILES = 14;
const MIN_LEVEL = 0.35;
/** Una fabrica o un pozo suenan como estas casillas de lo suyo. */
const BUILDING_TILES = 6;

export const bedAmbientOf = (s: GameState): BedAmbient | null => BED_AMBIENTS[themeOf(s).id] ?? null;

export const weatherAmbientOf = (kind: string | null): WeatherAmbient | null => (kind && WEATHER_AMBIENTS[kind]) || null;

/** En el borde del tablero empieza el mar que rodea la isla, aunque la casilla sea tierra. */
const isBoardEdge = (s: GameState, pos: Pos): boolean => neighbors4(mapGrid(s), pos).length < 4;

/** El sonido de una casilla: el agua junto a tierra o en el borde es costa (en el pantano, dentro, cienaga). */
function tileAmbient(s: GameState, pos: Pos): ZoneAmbient | null {
  const terrain = terrainAt(s, pos);
  if (!terrain.isWater) return TERRAIN_AMBIENTS[terrain.id] ?? null;
  const isEdge = isBoardEdge(s, pos);
  const touchesLand = neighbors4(mapGrid(s), pos).some((next) => !terrainAt(s, next).isWater);
  if (themeOf(s).id === MARSH_THEME && !isEdge) return 'amb_marsh';
  return isEdge || touchesLand ? 'amb_sea' : null;
}

/** Las casillas de cada sonido, juntas por trozo del mapa. */
function tilesByRegion(s: GameState): Map<string, { sound: ZoneAmbient; tiles: Pos[] }> {
  const groups = new Map<string, { sound: ZoneAmbient; tiles: Pos[] }>();
  const add = (sound: ZoneAmbient, pos: Pos, weight = 1) => {
    const key = `${sound}:${Math.floor(pos.x / REGION_SIZE)}:${Math.floor(pos.y / REGION_SIZE)}`;
    const group = groups.get(key) ?? { sound, tiles: [] };
    group.tiles.push(...Array<Pos>(weight).fill(pos));
    groups.set(key, group);
  };
  mapGrid(s).forEach((_terrain, pos) => {
    const sound = tileAmbient(s, pos);
    if (sound) add(sound, pos);
    if (sound !== 'amb_sea' && isBoardEdge(s, pos)) add('amb_sea', pos);
  });
  for (const building of s.buildings) {
    const sound = BUILDING_AMBIENTS[building.type];
    if (sound) add(sound, building, BUILDING_TILES);
  }
  return groups;
}

const centerOf = (tiles: readonly Pos[]): Pos => ({
  x: tiles.reduce((sum, tile) => sum + tile.x, 0) / tiles.length,
  y: tiles.reduce((sum, tile) => sum + tile.y, 0) / tiles.length,
});

/** Los emisores de ambiente del mapa: uno por sonido en cada trozo donde haya bastante de lo suyo. */
export function ambientEmitters(s: GameState): AmbientEmitter[] {
  return [...tilesByRegion(s).values()]
    .filter((group) => group.tiles.length >= MIN_TILES)
    .map((group) => ({
      sound: group.sound,
      at: centerOf(group.tiles),
      level: Math.max(MIN_LEVEL, Math.min(1, group.tiles.length / FULL_TILES)),
    }));
}

/** Se oye lo que esta a menos de esto del oyente (casillas); lo que ya suena, hasta `KEEP_RADIUS` (sin parpadeos). */
const HEAR_RADIUS = 14;
const KEEP_RADIUS = 18;
/** Como mucho suenan a la vez estos ambientes distintos (los mas cercanos), cada uno desde un solo sitio. */
const MAX_SOUNDS = 3;
/** Un ambiente que ya suena no se cambia a otro sitio suyo salvo que este quede esto mas cerca (casillas). */
const SWITCH_MARGIN = 3;

const groundDistance = (at: Pos, listener: Point3): number => Math.hypot(at.x - listener.x, at.y - listener.z);

interface Heard {
  readonly index: number;
  readonly sound: ZoneAmbient;
  readonly distance: number;
}

/** De los sitios de un mismo ambiente, el que suena: el mas cercano, o el que ya sonaba si no queda mucho mas lejos. */
function placeOf(places: readonly Heard[], playing: ReadonlySet<number>): Heard {
  const nearest = places[0]!;
  const current = places.find((place) => playing.has(place.index));
  return current && current.distance <= nearest.distance + SWITCH_MARGIN ? current : nearest;
}

/**
 * Los emisores (por su indice) que deben sonar con el oyente en `listener`, si ahora suenan `playing`:
 * un solo sitio por ambiente (varios del mismo a la vez solo emborronan) y pocos ambientes.
 */
export function emittersInEarshot(emitters: readonly AmbientEmitter[], listener: Point3, playing: ReadonlySet<number>): Set<number> {
  const audible = emitters
    .map((emitter, index) => ({ index, sound: emitter.sound, distance: groundDistance(emitter.at, listener) }))
    .filter(({ index, distance }) => distance <= (playing.has(index) ? KEEP_RADIUS : HEAR_RADIUS))
    .sort((a, b) => a.distance - b.distance);
  const sounds = new Set(audible.map((heard) => heard.sound));
  const chosen = [...sounds].map((sound) =>
    placeOf(
      audible.filter((heard) => heard.sound === sound),
      playing,
    ),
  );
  const nearest = chosen.sort((a, b) => a.distance - b.distance).slice(0, MAX_SOUNDS);
  return new Set(nearest.map(({ index }) => index));
}

/** Un trueno: cuanto mas lejos del oyente, mas tarda en llegar despues del relampago (a ojo, no a la velocidad del sonido). */
const THUNDER_MIN_DISTANCE = 8;
const THUNDER_EXTRA_DISTANCE = 12;
const THUNDER_SECONDS_PER_TILE = 0.12;
const THUNDER_HEIGHT = 6;

/** Donde y cuando suena el trueno de un relampago, con `random` (0-1) dos veces. */
export function thunderOf(listener: Point3, random: () => number): { at: Point3; delaySeconds: number } {
  const angle = random() * 2 * Math.PI;
  const distance = THUNDER_MIN_DISTANCE + random() * THUNDER_EXTRA_DISTANCE;
  return {
    at: { x: listener.x + Math.cos(angle) * distance, y: THUNDER_HEIGHT, z: listener.z + Math.sin(angle) * distance },
    delaySeconds: distance * THUNDER_SECONDS_PER_TILE,
  };
}
