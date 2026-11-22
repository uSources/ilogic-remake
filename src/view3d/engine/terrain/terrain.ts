/**
 * El terreno en 3D, con los modelos de Ashfox (tools/art/ashfox/models/terrain.mjs, a semejanza del
 * terreno 2D): cada casilla es el bloque de su clase (hierba, agua...) y, si lleva, su decorado encima
 * (arboles, cactus, flores, muñeco de nieve, nenufares), y lo que vive en ella (engine/life/: las motas
 * que vuelan y los animalitos del decorado, que se oscurecen con la niebla igual que el decorado). Las
 * montañas y la arena no son casillas sino relieve (relief.ts): sierras, mesetas y dunas que siguen de
 * una casilla a otra.
 * Que lleva cada terreno lo dice pieces.ts. Cada clase de casilla y de decorado es una malla
 * instanciada (placed.ts), y todo el relieve otra: el coste no crece con el tamaño del mapa.
 */
import * as THREE from 'three';
import { elevationAt } from '../../../core/elevation';
import { terrainAt } from '../../../core/gameContent';
import { mapGrid } from '../../../core/mapGrid';
import type { GameState, Pos } from '../../../core/model';
import type { Grid } from '../../../core/util/grid';
import { BiomeLife } from '../life/biomeLife';
import { groupBy } from '../core/groupBy';
import { tileToWorld } from '../core/space';
import type { GlbLibrary, StaticPart } from '../pieces/glbModels';
import { cutPartBelow } from './cutBelow';
import { bankOf, pieceAt, type TileModel, tileTop, variantFiles, WATER_LOOKS } from './pieces';
import { fogged, instanced, instancedParts, shade, terrainParts, tileNoise, type PlacedMesh } from './placed';
import { buildRelief, type ReliefView } from './relief';
import { edgeSides, shoreSides, waterClock, waterMaterial, type WaterLook } from './water';

export { TERRAIN_MODEL_FILES } from './pieces';

/** Lo que se desplaza el decorado en su casilla, para que no parezca copiado. */
const DECOR_JITTER = 0.12;
/**
 * El tamaño del decorado (arboles, flores, cactus...) respecto a su modelo: algo mas pequeño, para que
 * tape menos las unidades y las casillas de alrededor (docs/ESTETICA.md, "Tamaños en el tablero").
 */
const DECOR_SIZE = new THREE.Vector3(0.82, 0.82, 0.82);

/** El terreno ya construido: su objeto 3D y lo que preguntan los demas (alturas, que casilla se toca). */
export interface TerrainView {
  readonly object: THREE.Group;
  /** Lo que se puede tocar (las casillas). */
  readonly pickables: readonly THREE.Object3D[];
  /** La casilla de un toque sobre `pickables` (null si no es una casilla). */
  tileOfHit(hit: THREE.Intersection): Pos | null;
  heightAt(pos: Pos): number;
  /** Oscurece lo que no se ve (la niebla) y aclara lo que si. */
  showSeen(seen: Grid<boolean>): void;
  /** El agua, que se mueve sola. */
  update(seconds: number): void;
  /** Lo que vive en el (las motas y los animalitos): se mueve con lo que mira la camara. */
  readonly life: BiomeLife;
}

/** Un giro de un cuarto de vuelta (0 a 3) que sale siempre igual para la misma casilla. */
const quarterTurn = (pos: Pos, salt: number): THREE.Quaternion =>
  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.floor(tileNoise(pos, salt) * 4) * (Math.PI / 2));

/** Donde va una casilla, girada (los suelos son cuadrados: girarlos los varia sin que se note el corte). */
const tilePlace = (pos: Pos, lift: number): THREE.Matrix4 =>
  new THREE.Matrix4().compose(new THREE.Vector3(pos.x, lift, pos.y), quarterTurn(pos, 5), new THREE.Vector3(1, 1, 1));

/** Lo que sube cada nivel de altura (regla de elevacion, core/elevation.ts), en casillas. */
const LEVEL_HEIGHT = 0.3;
const liftOf = (s: GameState, pos: Pos): number => elevationAt(s, pos) * LEVEL_HEIGHT;

/** Copias de un modelo: donde va cada una y de que casilla es (para la niebla). */
interface Copies {
  positions: Pos[];
  places: THREE.Matrix4[];
}

/** Una copia de una casilla, `below` niveles por debajo de su cara de arriba. */
interface LevelCopy {
  pos: Pos;
  below: number;
}

const copiesOf = (s: GameState, levels: readonly LevelCopy[]): Copies => ({
  positions: levels.map(({ pos }) => pos),
  places: levels.map(({ pos, below }) => tilePlace(pos, liftOf(s, pos) - below * LEVEL_HEIGHT)),
});

/**
 * Donde va cada casilla y, debajo de las altas, una copia por nivel: rellenan el desnivel y en el
 * borde del mapa y frente a lo mas bajo se ven como terrazas (la capa de arriba de cada copia, con
 * su borde de hierba o arena). El bloque es mas alto que un nivel: enteras, las copias se pisarian y
 * sus laterales, en el mismo plano, parpadearian. Por eso solo va entera la de abajo del todo
 * (`whole`, hasta el fondo del tablero) y las de encima van recortadas a un nivel (`slices`).
 */
function stackedPlaces(s: GameState, positions: readonly Pos[]): { whole: Copies; slices: Copies } {
  const bottoms = positions.map((pos) => ({ pos, below: elevationAt(s, pos) }));
  const levels = positions.flatMap((pos) => Array.from({ length: elevationAt(s, pos) }, (_, below) => ({ pos, below })));
  return { whole: copiesOf(s, bottoms), slices: copiesOf(s, levels) };
}

/** Las copias recortadas a un nivel, con solo la parte de arriba del bloque (nada si no hay casillas altas de ese modelo). */
function levelSlices(parts: readonly StaticPart[], tile: TileModel, slices: Copies): PlacedMesh[] {
  if (!slices.places.length) return [];
  const floor = tileTop(tile) - LEVEL_HEIGHT;
  return instancedParts(
    parts.map((part) => cutPartBelow(part, floor)),
    slices.positions,
    slices.places,
  );
}

/** El modelo de la casilla: su clase y, si tiene variantes, una (siempre la misma). */
function tileFile(s: GameState, pos: Pos): string {
  const files = variantFiles(pieceAt(s, pos).tile);
  return files[Math.floor(tileNoise(pos, 6) * files.length)]!;
}

/** Donde va el decorado de una casilla: encima, algo movido y girado (siempre igual para la misma casilla). */
function decorPlace(pos: Pos, top: number): THREE.Matrix4 {
  const shift = (salt: number) => (tileNoise(pos, salt) - 0.5) * DECOR_JITTER;
  const at = new THREE.Vector3(pos.x + shift(1), top, pos.y + shift(2));
  return new THREE.Matrix4().compose(at, quarterTurn(pos, 3), DECOR_SIZE);
}

/** Las casillas de cada clase de modelo; las de agua, con el agua que se mueve (water.ts). */
function tileMeshes(library: GlbLibrary, s: GameState, byFile: ReadonlyMap<string, Pos[]>): PlacedMesh[] {
  return [...byFile].flatMap(([file, tilePositions]) => {
    const tile = pieceAt(s, tilePositions[0]!).tile;
    const { whole, slices } = stackedPlaces(s, tilePositions);
    const parts = terrainParts(library, file);
    const placed = [...instancedParts(parts, whole.positions, whole.places), ...levelSlices(parts, tile, slices)];
    const water = WATER_LOOKS[tile];
    if (water) for (const copies of placed) makeWater(copies.mesh, s, copies.positions, water);
    return placed;
  });
}

/**
 * Le pone a las casillas de agua su material que se mueve (con sus brillos, su espuma y la tierra del
 * tema en el borde del mapa) y, a cada copia, sus orillas y sus lados que dan fuera del mapa.
 */
function makeWater(mesh: THREE.InstancedMesh, s: GameState, positions: readonly Pos[], look: WaterLook): void {
  mesh.material = waterMaterial(mesh.material as THREE.Material, look, bankOf(s));
  mesh.geometry = mesh.geometry.clone();
  mesh.geometry.setAttribute('aShore', shoreSides(s, positions));
  mesh.geometry.setAttribute('aEdge', edgeSides(s, positions));
}

/** Si la casilla lleva decorado: su terreno tiene y le toca (`decorShare`, siempre igual para la misma casilla). */
function hasDecor(s: GameState, pos: Pos): boolean {
  const piece = pieceAt(s, pos);
  return !!piece.decor?.length && tileNoise(pos, 7) < (piece.decorShare ?? 1);
}

/** El decorado de cada clase (cada casilla con varios posibles elige uno, siempre el mismo), encima de `heightOf`. */
function decorMeshes(library: GlbLibrary, s: GameState, decorated: readonly Pos[], heightOf: (pos: Pos) => number): PlacedMesh[] {
  const byDecor = groupBy(decorated, (pos) => {
    const variants = pieceAt(s, pos).decor!;
    return variants[Math.floor(tileNoise(pos, 4) * variants.length)]!;
  });
  return [...byDecor].flatMap(([decor, at]) =>
    instanced(
      library,
      decor,
      at,
      at.map((pos) => decorPlace(pos, heightOf(pos))),
    ),
  );
}

/** El relieve con niebla: cada columna con su color, oscurecida si su casilla no se ve. */
function shadeRelief(relief: ReliefView, seen: Grid<boolean>): void {
  relief.tileOfColumn.forEach((pos, index) => {
    const color = relief.baseColors[index]!.clone();
    relief.mesh.setColorAt(index, seen.at(pos) ? color : fogged(color));
  });
  if (relief.mesh.instanceColor) relief.mesh.instanceColor.needsUpdate = true;
}

/** El relieve del mapa: sus casillas, el suelo de cada una (el de su clase, subido por la elevacion) y por donde pueden salirse las faldas. */
function reliefOf(s: GameState, positions: readonly Pos[]): ReliefView {
  const tiles = positions.flatMap((pos) => {
    const relief = pieceAt(s, pos).relief;
    return relief ? [{ pos, style: relief }] : [];
  });
  const grid = mapGrid(s);
  return buildRelief({
    width: grid.width,
    height: grid.height,
    tiles,
    groundAt: (pos) => tileTop(pieceAt(s, pos).tile) + liftOf(s, pos),
    canSpill: (pos) => !terrainAt(s, pos).isWater,
    spillRestsOnGround: true,
  });
}

/** La altura de arriba de cada casilla: lo alto del relieve o la cara de arriba de su bloque, subida por la elevacion. */
function heightsOf(s: GameState, relief: ReliefView): Grid<number> {
  const heights = mapGrid(s).createLayer(0);
  heights.forEach((_, pos) =>
    heights.set(pos, pieceAt(s, pos).relief ? relief.topAt(pos) : tileTop(pieceAt(s, pos).tile) + liftOf(s, pos)),
  );
  return heights;
}

export function buildTerrain(s: GameState, library: GlbLibrary): TerrainView {
  const positions = [...mapGrid(s).cells()].map((cell) => cell.pos);
  const relief = reliefOf(s, positions);
  const flat = positions.filter((pos) => !pieceAt(s, pos).relief);
  const tiles = tileMeshes(
    library,
    s,
    groupBy(flat, (pos) => tileFile(s, pos)),
  );
  const heights = heightsOf(s, relief);
  const heightOf = (pos: Pos) => heights.at(pos);
  const decorated = positions.filter((pos) => hasDecor(s, pos));
  const decor = decorMeshes(library, s, decorated, heightOf);
  const life = new BiomeLife(s, library, {
    positions,
    groundOf: (pos) => tileToWorld(pos, heightOf(pos)),
    heightAt: (x, z) => relief.surfaceAt(x, z) ?? heights.atClamped({ x: Math.round(x), y: Math.round(z) }),
    decorPlaceOf: (pos) => (hasDecor(s, pos) ? decorPlace(pos, heightOf(pos)) : null),
  });
  const copies = [...tiles, ...decor];
  const object = new THREE.Group();
  object.add(relief.mesh, ...copies.map((placed) => placed.mesh), life.object);
  const placedOf = new Map(tiles.map((placed) => [placed.mesh as THREE.Object3D, placed]));
  const tileOfHit = (hit: THREE.Intersection): Pos | null => {
    if (hit.instanceId === undefined) return null;
    if (hit.object === relief.mesh) return relief.tileOfColumn[hit.instanceId] ?? null;
    return placedOf.get(hit.object)?.positions[hit.instanceId] ?? null;
  };
  return {
    object,
    pickables: [relief.mesh, ...tiles.map((placed) => placed.mesh)],
    tileOfHit,
    heightAt: (pos) => heights.at(pos),
    showSeen: (seen) => {
      shade(copies, seen);
      shadeRelief(relief, seen);
      life.showSeen(seen);
    },
    update: (seconds) => {
      waterClock.value += seconds;
    },
    life,
  };
}
