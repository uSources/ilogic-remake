/**
 * El terreno del mapa al azar: crece en anillos desde un punto, cada casilla con la probabilidad de
 * su tema mas un extra por cada vecina igual ya generada; despues el agua (estrecha, orillas y
 * profunda) segun el tema (themes.json, "generator").
 */
import { terrainAt, themeOf } from '../gameContent';
import { type TerrainType, type Theme } from '../content';
import { diamond, squareArea } from '../geom';
import { mapGrid } from '../mapGrid';
import type { Grid, GridBounds } from '../util/grid';
import type { GameState, Pos, Rng } from '../model';
import { isWalkable, terrainNamed } from './common';

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
export function growTerrain(s: GameState, origin: Pos, theme: Theme, rng: Rng): number {
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
      if (isWalkable(s, rolled)) walkable++;
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
export function narrowWater(s: GameState, open: TerrainType, narrow: TerrainType): number {
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
export function freezeShores(s: GameState, shore: TerrainType): number {
  const map = mapGrid(s);
  const isSolidLand = (pos: Pos) => !terrainAt(s, pos).isWater && terrainAt(s, pos) !== shore;
  const toFreeze = [...map.cells()]
    .filter(({ pos }) => terrainAt(s, pos).isWater && squareArea(map, pos, 1).some(isSolidLand))
    .map(({ pos }) => pos);
  for (const pos of toFreeze) map.set(pos, shore.id);
  return toFreeze.length;
}

/** Agua rodeada de agua (3x3) -> `deep` (agua profunda). */
export function deepenWater(s: GameState, deep: TerrainType): void {
  const map = mapGrid(s);
  const isAllWater = (pos: Pos) => squareArea(map, pos, 1).every((around) => terrainAt(s, around).isWater);
  const toDeepen = [...map.cells()].filter(({ pos }) => isAllWater(pos)).map(({ pos }) => pos);
  for (const pos of toDeepen) map.set(pos, deep.id);
}

/**
 * El agua segun el tema (themes.json, "generator"): la estrecha y la de la orilla cambian (agua poco
 * profunda, hielo) y la rodeada de agua se hace profunda. Devuelve las casillas de agua que pasan a
 * ser transitables a pie.
 */
export function shapeWater(s: GameState): number {
  const generator = themeOf(s).generator;
  let newLand = 0;
  if (generator.narrowWater) newLand += narrowWater(s, terrainNamed(s, generator.openWater), terrainNamed(s, generator.narrowWater));
  if (generator.shoreWater) newLand += freezeShores(s, terrainNamed(s, generator.shoreWater));
  deepenWater(s, terrainNamed(s, generator.deepWater));
  return newLand;
}
