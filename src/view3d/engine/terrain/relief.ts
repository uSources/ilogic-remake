/**
 * El relieve de las montañas y las dunas: en vez de una casilla con un modelo encima, un terreno de
 * verdad que se calcula en el mapa (no casilla a casilla) con mas detalle que las casillas
 * (SUBCELLS x SUBCELLS por casilla) y se dibuja con columnas de voxels (una malla instanciada):
 * - montaña: un cono escalonado y rugoso alrededor de cada casilla de montaña que se sale un poco a
 *   las vecinas (sus faldas tapan el borde) y se funde con los de al lado: varias montañas juntas son
 *   una sierra con sus cimas. Sus colores van por alturas (faldas, roca, nieve);
 * - meseta (la montaña del desierto): igual, pero en terrazas planas;
 * - dunas: ondas de traves al viento sobre la arena, que se apagan en su borde (casan con lo llano).
 * Las alturas van en pasos de un pixel de Ashfox (1/16 de casilla), como el resto del pixel art.
 * Es solo dibujo: la altura del juego es la de la elevacion (core/elevation.ts); lo que hay encima de
 * una casilla con relieve se pone en lo alto (`topAt`).
 */
import * as THREE from 'three';
import type { Pos } from '../../../core/model';
import { Grid } from '../../../core/util/grid';
import { WIND_DIRECTION } from '../core/space';
import { toonMaterial } from '../core/toon';

export type ReliefShape = 'peak' | 'mesa' | 'dunes';

/** Como es un relieve: su forma y sus colores por alturas (cada banda desde esa altura sobre el suelo, en casillas). */
export interface ReliefStyle {
  shape: ReliefShape;
  bands: readonly { from: number; color: number }[];
}

/** Subcasillas por lado de cada casilla: columnas de 2 pixeles de Ashfox. */
const SUBCELLS = 8;
const PIXEL = 1 / 16;
/** Lo alto de una montaña sola, y hasta donde llegan sus faldas desde el centro de su casilla (casillas). */
const PEAK_HEIGHT = 1.45;
const PEAK_REACH = 1.05;
/** Lo rugosa que es la ladera (casillas de mas o de menos). */
const ROUGHNESS = 0.12;
/** Las mesetas: lo alto, hasta donde llegan y en cuantas terrazas suben. */
const MESA_HEIGHT = 0.75;
const MESA_REACH = 0.85;
const MESA_TERRACES = 3;
/** Las dunas: lo alto de sus crestas, su largo de onda (casillas) y en cuantas subcasillas se apagan hacia el borde. */
const DUNE_HEIGHT = 0.16;
const DUNE_WAVELENGTH = 1.6;
const DUNE_FADE = 6;
/** Por debajo de esto (casillas) el relieve no se dibuja fuera de sus casillas: es suelo. */
const VISIBLE_RISE = PIXEL;
/** Hasta donde bajan las columnas (como los bloques de las casillas). */
const COLUMN_BOTTOM = -0.5;
/** Lo que varia el tono de una columna a otra, para que no se vea plano. */
const TONE_JITTER = 0.06;

/** Una casilla con relieve: su estilo y la altura de su suelo (encima de la cual sube). */
export interface ReliefTile {
  pos: Pos;
  style: ReliefStyle;
}

/** Lo que el relieve necesita saber del mapa. */
export interface ReliefMap {
  width: number;
  height: number;
  tiles: readonly ReliefTile[];
  /** La altura del suelo de una casilla (de donde sube el relieve y donde se apoya una falda). */
  groundAt(pos: Pos): number;
  /** Las faldas pueden salirse a esa casilla (no al agua: ahi no se dibujan). */
  canSpill(pos: Pos): boolean;
}

/** El relieve ya construido: su malla, a que casilla toca cada columna y lo alto de cada casilla. */
export interface ReliefView {
  readonly mesh: THREE.InstancedMesh;
  readonly tileOfColumn: readonly Pos[];
  /** Lo alto del centro de la casilla (donde se pone lo que hay en ella). */
  topAt(pos: Pos): number;
  /** El color de cada columna sin niebla (para volver a el al verla). */
  readonly baseColors: readonly THREE.Color[];
}

/** Lo que sube el relieve en una subcasilla: cuanto y con que estilo (el del relieve mas alto ahi). */
interface Rise {
  height: number;
  style: ReliefStyle;
}

/** Un numero entre 0 y 1 que sale siempre igual para el mismo sitio. */
function noise(x: number, y: number, salt: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

const tileOfSubcell = (sub: Pos): Pos => ({ x: Math.floor(sub.x / SUBCELLS), y: Math.floor(sub.y / SUBCELLS) });
/** El centro de una subcasilla, en casillas (el de la casilla (x, y) es (x, y)). */
const subcellCenter = (sub: Pos): Pos => ({ x: (sub.x + 0.5) / SUBCELLS - 0.5, y: (sub.y + 0.5) / SUBCELLS - 0.5 });

/** Lo que sube una montaña o una meseta a esta distancia de su centro (casillas). */
const MASSIF_RISES: Readonly<Record<'peak' | 'mesa', (distance: number, sub: Pos) => number>> = {
  peak: (distance, sub) => {
    const slope = Math.max(0, 1 - distance / PEAK_REACH);
    return PEAK_HEIGHT * slope ** 1.35 + (noise(sub.x, sub.y, 1) - 0.5) * ROUGHNESS * slope;
  },
  mesa: (distance) => (MESA_HEIGHT * Math.ceil(Math.max(0, 1 - distance / MESA_REACH) * MESA_TERRACES)) / MESA_TERRACES,
};

/** Las montañas y mesetas: cada una sube alrededor de su casilla y, donde se juntan, manda la mas alta. */
function massifRises(map: ReliefMap, rises: Grid<Rise | null>): void {
  for (const tile of map.tiles) {
    const shape = tile.style.shape;
    if (shape === 'dunes') continue;
    const reach = Math.ceil(PEAK_REACH * SUBCELLS);
    const center = { x: tile.pos.x * SUBCELLS + SUBCELLS / 2, y: tile.pos.y * SUBCELLS + SUBCELLS / 2 };
    for (let dx = -reach; dx < reach; dx++)
      for (let dy = -reach; dy < reach; dy++) {
        const sub = { x: center.x + dx, y: center.y + dy };
        if (!rises.contains(sub)) continue;
        const middle = subcellCenter(sub);
        const height = MASSIF_RISES[shape](Math.hypot(middle.x - tile.pos.x, middle.y - tile.pos.y), sub);
        if (height > (rises.at(sub)?.height ?? 0)) rises.set(sub, { height, style: tile.style });
      }
  }
}

/** Las dunas: solo en sus casillas, apagandose hacia el borde de la arena. */
function duneRises(map: ReliefMap, rises: Grid<Rise | null>): void {
  const dunes = map.tiles.filter((tile) => tile.style.shape === 'dunes');
  const isDune = new Set(dunes.map((tile) => `${tile.pos.x},${tile.pos.y}`));
  const edge = distanceToEdge(rises, (sub) => isDune.has(`${tileOfSubcell(sub).x},${tileOfSubcell(sub).y}`));
  for (const tile of dunes)
    for (let dx = 0; dx < SUBCELLS; dx++)
      for (let dy = 0; dy < SUBCELLS; dy++) {
        const sub = { x: tile.pos.x * SUBCELLS + dx, y: tile.pos.y * SUBCELLS + dy };
        if (rises.at(sub)) continue;
        const along = ((sub.x * WIND_DIRECTION.x + sub.y * WIND_DIRECTION.z) / SUBCELLS / DUNE_WAVELENGTH) * Math.PI * 2;
        const wave = 0.5 + 0.5 * Math.sin(along + noise(Math.floor(sub.x / 12), Math.floor(sub.y / 12), 2) * 2.5);
        rises.set(sub, { height: DUNE_HEIGHT * wave * Math.min(1, edge.at(sub) / DUNE_FADE), style: tile.style });
      }
}

/** Cuantas subcasillas hay de cada una (de las que cumplen `isInside`) a la primera que no, en las ocho direcciones. */
function distanceToEdge(size: Grid<unknown>, isInside: (sub: Pos) => boolean): Grid<number> {
  const distance = Grid.filled({ width: size.width, height: size.height }, 0);
  let frontier: Pos[] = [];
  distance.forEach((_, sub) => {
    if (!isInside(sub)) return;
    const touchesEdge = [-1, 0, 1].some((dx) => [-1, 0, 1].some((dy) => !isInside({ x: sub.x + dx, y: sub.y + dy })));
    if (touchesEdge) frontier.push(sub);
    distance.set(sub, touchesEdge ? 1 : Infinity);
  });
  for (let step = 2; frontier.length; step++) frontier = growInward(distance, frontier, step);
  return distance;
}

function growInward(distance: Grid<number>, frontier: readonly Pos[], step: number): Pos[] {
  const next: Pos[] = [];
  for (const sub of frontier)
    for (const dx of [-1, 0, 1])
      for (const dy of [-1, 0, 1]) {
        const near = { x: sub.x + dx, y: sub.y + dy };
        if (!distance.contains(near) || distance.at(near) !== Infinity) continue;
        distance.set(near, step);
        next.push(near);
      }
  return next;
}

const toPixels = (height: number): number => Math.round(height / PIXEL) * PIXEL;

function bandColor(style: ReliefStyle, rise: number, sub: Pos): THREE.Color {
  const band = [...style.bands].reverse().find((candidate) => rise >= candidate.from) ?? style.bands[0]!;
  return new THREE.Color(band.color).multiplyScalar(1 - TONE_JITTER / 2 + noise(sub.x, sub.y, 3) * TONE_JITTER);
}

/** Las subcasillas que se dibujan: las de las casillas con relieve y las faldas que asoman fuera. */
function columnsOf(map: ReliefMap, rises: Grid<Rise | null>): { sub: Pos; rise: Rise }[] {
  const isReliefTile = new Set(map.tiles.map((tile) => `${tile.pos.x},${tile.pos.y}`));
  return [...rises.cells()].flatMap(({ pos: sub, value: rise }) => {
    if (!rise) return [];
    const tile = tileOfSubcell(sub);
    const isOwn = isReliefTile.has(`${tile.x},${tile.y}`);
    return isOwn || (rise.height >= VISIBLE_RISE && map.canSpill(tile)) ? [{ sub, rise }] : [];
  });
}

/** Las columnas: una por subcasilla con relieve, de COLUMN_BOTTOM a su altura. */
export function buildRelief(map: ReliefMap): ReliefView {
  const rises = Grid.filled<Rise | null>({ width: map.width * SUBCELLS, height: map.height * SUBCELLS }, null);
  massifRises(map, rises);
  duneRises(map, rises);
  const columns = columnsOf(map, rises);
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), toonMaterial(0xffffff), columns.length);
  const tops = Grid.filled({ width: rises.width, height: rises.height }, 0);
  const baseColors = columns.map(({ sub, rise }, index) => {
    const top = toPixels(map.groundAt(tileOfSubcell(sub)) + rise.height);
    tops.set(sub, top);
    const middle = subcellCenter(sub);
    const center = new THREE.Vector3(middle.x, (top + COLUMN_BOTTOM) / 2, middle.y);
    const size = new THREE.Vector3(1 / SUBCELLS, top - COLUMN_BOTTOM, 1 / SUBCELLS);
    mesh.setMatrixAt(index, new THREE.Matrix4().compose(center, new THREE.Quaternion(), size));
    const color = bandColor(rise.style, rise.height, sub);
    mesh.setColorAt(index, color);
    return color;
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const tileOfColumn = columns.map(({ sub }) => tileOfSubcell(sub));
  return { mesh, tileOfColumn, topAt: (pos) => centerTop(tops, pos), baseColors };
}

/** Lo alto del centro de una casilla: lo mas alto de sus cuatro subcasillas del medio. */
function centerTop(tops: Grid<number>, pos: Pos): number {
  const middle = [SUBCELLS / 2 - 1, SUBCELLS / 2];
  return Math.max(...middle.flatMap((dx) => middle.map((dy) => tops.at({ x: pos.x * SUBCELLS + dx, y: pos.y * SUBCELLS + dy }))));
}
