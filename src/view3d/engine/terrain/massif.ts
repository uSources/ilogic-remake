/**
 * Las montañas y las mesetas del relieve: macizos que salen de las sierras del mapa, no de cada
 * casilla. Cada subcasilla sube segun lo dentro que este de su sierra (su distancia al borde de las
 * casillas de montaña): una montaña sola es un pico, una sierra larga es una cresta y una ancha, mas
 * alta por el medio. Las faldas se salen un poco a las vecinas (tapan el borde). Encima, ruido: cimas
 * separadas a lo largo de las crestas y una ladera rugosa. Las mesetas suben igual, en terrazas planas.
 */
import type { Pos } from '../../../core/model';
import { Grid } from '../../../core/util/grid';
import { seededRng } from '../../../core/util/random';
import { valueNoise } from '../../../core/util/valueNoise';
import { type ReliefMap, type ReliefShape, type ReliefStyle, type Rise, subcellCenter, subcellsOf, tileKey } from './reliefGrid';

/** Lo que se mira dentro de una sierra: mas adentro ya no sube mas (casillas). */
const DEPTH_LIMIT = 2;
/** Una montaña sola: lo alto de su pico (casillas), y lo que sube de mas cada casilla hacia dentro de una sierra ancha. */
const PEAK_HEIGHT = 1.1;
const RANGE_GROWTH = 0.45;
/** Lo mas alto que llega una cima (casillas): que no tape media pantalla. */
const MAX_PEAK = 2.1;
/** Lo que cambia el ruido de cimas la altura de cada tramo de cresta (de 1 - esto a 1 + esto). */
const SUMMIT_SWING = 0.3;
/** Lo rugosa que es la ladera (casillas de mas o de menos). */
const ROUGHNESS = 0.14;
/** La forma de la ladera: con mas de 1, las faldas son suaves y la cumbre aguda. */
const SLOPE_CURVE = 1.7;
/** Las mesetas: lo alto de cada terraza (casillas), cuantas tiene una sola y cuantas de mas por cada casilla hacia dentro. */
const TERRACE_HEIGHT = 0.25;
const MESA_TERRACES = 3;
const TERRACES_PER_DEPTH = 1;
/** Cada cuantas subcasillas cambian las cimas y la rugosidad. */
const SUMMIT_SPACING = 11;
const ROUGH_SPACING = 2;
/** La semilla del ruido del relieve: siempre la misma (el mapa ya cambia de una partida a otra). */
const RELIEF_SEED = 2013;

/** Lo que sube un macizo segun lo dentro que este (`depth`, casillas; negativo fuera) y su ruido (0 a 1). */
interface MassifShape {
  /** Hasta donde se salen sus faldas fuera de la sierra (casillas). */
  skirt: number;
  rise(depth: number, summit: number, rough: number): number;
}

/** De 0 en el pie de la falda a 1 en el centro de una montaña sola. */
const footToTop = (depth: number, skirt: number): number => Math.min(1, Math.max(0, (depth + skirt) / (0.5 + skirt)));
const beyondSingle = (depth: number): number => Math.max(0, depth - 0.5);

const MASSIF_SHAPES: Readonly<Record<Exclude<ReliefShape, 'dunes'>, MassifShape>> = {
  peak: {
    skirt: 0.7,
    rise(depth, summit, rough) {
      const slope = footToTop(depth, this.skirt);
      const height = (PEAK_HEIGHT * slope ** SLOPE_CURVE + RANGE_GROWTH * beyondSingle(depth)) * (1 + SUMMIT_SWING * (2 * summit - 1));
      return Math.min(MAX_PEAK, height + (rough - 0.5) * ROUGHNESS * slope);
    },
  },
  mesa: {
    skirt: 0.35,
    rise(depth, summit) {
      const terraces = Math.ceil(footToTop(depth, this.skirt) * MESA_TERRACES) + Math.floor(beyondSingle(depth) * TERRACES_PER_DEPTH);
      const extra = terraces > 0 && summit > 0.5 + SUMMIT_SWING / 2 ? 1 : 0;
      return (terraces + extra) * TERRACE_HEIGHT;
    },
  },
};

/** La distancia de un punto (en casillas) al cuadrado de una casilla. */
const distanceToTile = (point: Pos, tile: Pos): number =>
  Math.hypot(Math.max(0, Math.abs(point.x - tile.x) - 0.5), Math.max(0, Math.abs(point.y - tile.y) - 0.5));

/**
 * Lo dentro de su sierra que esta un punto (casillas): dentro, la distancia a la casilla mas cercana
 * que no es de la sierra (hasta DEPTH_LIMIT); fuera, menos la distancia a la sierra. Lo de fuera del
 * mapa no cuenta (una sierra en el borde no baja hacia el).
 */
function depthIn(map: ReliefMap, isMassif: (tile: Pos) => boolean, point: Pos, inside: boolean): number {
  const center = { x: Math.round(point.x), y: Math.round(point.y) };
  const reach = Math.ceil(DEPTH_LIMIT) + 1;
  let nearest = Infinity;
  for (let dx = -reach; dx <= reach; dx++)
    for (let dy = -reach; dy <= reach; dy++) {
      const tile = { x: center.x + dx, y: center.y + dy };
      if (!Grid.fits(map, tile) || isMassif(tile) === inside) continue;
      nearest = Math.min(nearest, distanceToTile(point, tile));
    }
  return inside ? Math.min(DEPTH_LIMIT, nearest) : -nearest;
}

/** Las casillas de los macizos y sus vecinas (por donde pueden caer sus faldas), sin repetir. */
function tilesNear(tiles: readonly Pos[]): Pos[] {
  const near = new Map<string, Pos>();
  for (const tile of tiles)
    for (const dx of [-1, 0, 1])
      for (const dy of [-1, 0, 1]) {
        const next = { x: tile.x + dx, y: tile.y + dy };
        near.set(tileKey(next), next);
      }
  return [...near.values()];
}

/** El ruido de las cimas y el de la rugosidad, uno por subcasilla. */
function massifNoise(rises: Grid<unknown>): { summits: Grid<number>; rough: Grid<number> } {
  const rng = seededRng(RELIEF_SEED);
  return { summits: valueNoise(rises, SUMMIT_SPACING, rng), rough: valueNoise(rises, ROUGH_SPACING, rng) };
}

/** Cada macizo (montañas y mesetas, cada forma aparte): lo que sube en cada subcasilla; donde se juntan, manda el mas alto. */
export function massifRises(map: ReliefMap, rises: Grid<Rise | null>): void {
  const { summits, rough } = massifNoise(rises);
  for (const shape of ['peak', 'mesa'] as const) {
    const styleOf = new Map(map.tiles.filter((tile) => tile.style.shape === shape).map((tile) => [tileKey(tile.pos), tile.style]));
    const isMassif = (tile: Pos) => styleOf.has(tileKey(tile));
    const nearbyStyle = (tile: Pos): ReliefStyle | undefined =>
      styleOf.get(tileKey(tile)) ??
      tilesNear([tile])
        .map((next) => styleOf.get(tileKey(next)))
        .find(Boolean);
    for (const tile of tilesNear(map.tiles.filter((candidate) => isMassif(candidate.pos)).map((candidate) => candidate.pos))) {
      const style = Grid.fits(map, tile) ? nearbyStyle(tile) : undefined;
      if (style) raiseTile(map, rises, tile, { shape: MASSIF_SHAPES[shape], style, isMassif, summits, rough });
    }
  }
}

interface MassifContext {
  shape: MassifShape;
  style: ReliefStyle;
  isMassif: (tile: Pos) => boolean;
  summits: Grid<number>;
  rough: Grid<number>;
}

/** Las subcasillas de una casilla, subidas por el macizo (si llega y sube mas que lo que ya hay). */
function raiseTile(map: ReliefMap, rises: Grid<Rise | null>, tile: Pos, massif: MassifContext): void {
  const inside = massif.isMassif(tile);
  for (const sub of subcellsOf(tile)) {
    const depth = depthIn(map, massif.isMassif, subcellCenter(sub), inside);
    if (depth <= -massif.shape.skirt) continue;
    const height = massif.shape.rise(depth, massif.summits.at(sub), massif.rough.at(sub));
    if (height > (rises.at(sub)?.height ?? 0)) rises.set(sub, { height, style: massif.style });
  }
}
