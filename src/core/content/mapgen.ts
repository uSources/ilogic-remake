/**
 * Generador de mapas al azar (mapgen.json): unidades y edificios de cada salida y cuantos edificios
 * neutrales hay. Son los numeros del original (RandomMap de 2013), medidos en un mapa de 32x32: el
 * generador los escala con la superficie. El terreno de cada tema esta en themes.json.
 */
import type { DeepReadonly } from '../util/freeze';
import { type Checker } from './check';
import type { ContentContext } from './types';

/** Un rango [minimo, maximo]. */
type Range = [min: number, max: number];

/** mapgen.json. */
export interface MapgenDef {
  /** Unidades con las que empieza cada equipo, en orden (por id). */
  startingUnits: string[];
  /** Edificios de cada salida, en orden (por id); el primero suele ser la Base. */
  startingBuildings: string[];
  /**
   * Edificios neutrales de cada tipo (por id): [minimo, maximo]. Los tipos que no estan, ninguno.
   * Se sortean en el orden de buildings.json (todos, tambien los que no estan): asi la misma semilla
   * da el mismo mapa.
   */
  neutralBuildings: Record<string, Range>;
  /** Total de edificios neutrales admitido [minimo, maximo]: si no, se sortean otra vez. */
  neutralTotal: Range;
  /** Radio (rombo) de la zona de cada salida. */
  spawnRadius: number;
  /** Casillas a pie y casillas para edificios que tiene que tener la zona de una salida. */
  minSpawnWalkable: number;
  minSpawnBuildable: number;
  /** Casillas a pie que tiene que tener el mapa (si no, se intenta otro). */
  minLandTiles: number;
}

const isRange = (value: unknown): value is Range =>
  Array.isArray(value) && value.length === 2 && value.every((n) => Number.isInteger(n) && n >= 0) && value[0] <= value[1];

/** Los numeros del generador de una partida (mapgen.json), de solo lectura. */
export type MapgenSettings = DeepReadonly<MapgenDef>;

export function validateMapgen(settings: MapgenDef, context: ContentContext, check: Checker): void {
  const scope = check.scope('mapgen.json');
  scope.refs('startingUnits', settings?.startingUnits, context.unitIds);
  scope.refs('startingBuildings', settings?.startingBuildings, context.buildingIds);
  for (const [building, range] of Object.entries(settings?.neutralBuildings ?? {})) {
    scope.known('neutralBuildings', building, context.buildingIds, 'el edificio ');
    scope.expect(isRange(range), `neutralBuildings.${building} tiene que ser [minimo, maximo]`);
  }
  scope.expect(isRange(settings?.neutralTotal), 'neutralTotal tiene que ser [minimo, maximo]');
  scope.num('spawnRadius', settings?.spawnRadius, { min: 1, max: 6, int: true });
  for (const field of ['minSpawnWalkable', 'minSpawnBuildable', 'minLandTiles'] as const)
    scope.num(field, settings?.[field], { min: 0, int: true });
}
