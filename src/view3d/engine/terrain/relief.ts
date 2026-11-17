/**
 * El relieve de las montañas y las dunas: en vez de una casilla con un modelo encima, un terreno de
 * verdad que se calcula en el mapa (no casilla a casilla) con mas detalle que las casillas
 * (SUBCELLS x SUBCELLS por casilla) y se dibuja con columnas de voxels (una malla instanciada):
 * - montañas y mesetas: macizos que siguen las sierras del mapa (massif.ts), con su color por alturas,
 *   pendiente y manchas (reliefColors.ts);
 * - dunas: ondas de traves al viento sobre la arena, que se apagan en su borde (casan con lo llano).
 * Las alturas van en pasos de un pixel de Ashfox (1/16 de casilla), como el resto del pixel art.
 * Es solo dibujo: la altura del juego es la de la elevacion (core/elevation.ts); lo que hay encima de
 * una casilla con relieve se pone en lo alto (`topAt`).
 */
import * as THREE from 'three';
import type { Pos } from '../../../core/model';
import { Grid } from '../../../core/util/grid';
import { neighbors4 } from '../../../core/geom';
import { WIND_DIRECTION } from '../core/space';
import { toonMaterial } from '../core/toon';
import { massifRises } from './massif';
import { reliefPalette } from './reliefColors';
import { noise, PIXEL, type ReliefMap, type Rise, SUBCELLS, subcellCenter, tileKey, tileOfSubcell } from './reliefGrid';

export type { ReliefShape, ReliefStyle } from './reliefGrid';

/** Las dunas: lo alto de sus crestas, su largo de onda (casillas) y en cuantas subcasillas se apagan hacia el borde. */
const DUNE_HEIGHT = 0.16;
const DUNE_WAVELENGTH = 1.6;
const DUNE_FADE = 6;
/** Por debajo de esto (casillas) el relieve no se dibuja fuera de sus casillas: es suelo. */
const VISIBLE_RISE = PIXEL;
/** Hasta donde bajan las columnas (como los bloques de las casillas). */
const COLUMN_BOTTOM = -0.5;

/** El relieve ya construido: su malla, a que casilla toca cada columna y lo alto de cada casilla. */
export interface ReliefView {
  readonly mesh: THREE.InstancedMesh;
  readonly tileOfColumn: readonly Pos[];
  /** Lo alto del centro de la casilla (donde se pone lo que hay en ella). */
  topAt(pos: Pos): number;
  /** El color de cada columna sin niebla (para volver a el al verla). */
  readonly baseColors: readonly THREE.Color[];
}

/** Las dunas: solo en sus casillas, apagandose hacia el borde de la arena. */
function duneRises(map: ReliefMap, rises: Grid<Rise | null>): void {
  const dunes = map.tiles.filter((tile) => tile.style.shape === 'dunes');
  const isDune = new Set(dunes.map((tile) => tileKey(tile.pos)));
  const edge = distanceToEdge(rises, (sub) => isDune.has(tileKey(tileOfSubcell(sub))));
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

/** Las subcasillas que se dibujan: las de las casillas con relieve y las faldas que asoman fuera. */
function columnsOf(map: ReliefMap, rises: Grid<Rise | null>): { sub: Pos; rise: Rise }[] {
  const isReliefTile = new Set(map.tiles.map((tile) => tileKey(tile.pos)));
  return [...rises.cells()].flatMap(({ pos: sub, value: rise }) => {
    if (!rise) return [];
    const tile = tileOfSubcell(sub);
    const isOwn = isReliefTile.has(tileKey(tile));
    return isOwn || (rise.height >= VISIBLE_RISE && map.canSpill(tile)) ? [{ sub, rise }] : [];
  });
}

/** Lo que baja la ladera desde una columna hasta su vecina mas baja (de las que se dibujan): su pendiente. */
function dropAt(tops: Grid<number | null>, sub: Pos): number {
  const top = tops.at(sub) ?? 0;
  const lower = neighbors4(tops, sub).map((next) => tops.at(next) ?? top);
  return Math.max(0, ...lower.map((next) => top - next));
}

/** Las columnas: una por subcasilla con relieve, de COLUMN_BOTTOM a su altura. */
export function buildRelief(map: ReliefMap): ReliefView {
  const rises = Grid.filled<Rise | null>({ width: map.width * SUBCELLS, height: map.height * SUBCELLS }, null);
  massifRises(map, rises);
  duneRises(map, rises);
  const columns = columnsOf(map, rises);
  const tops = rises.createLayer<number | null>(null);
  for (const { sub, rise } of columns) tops.set(sub, toPixels(map.groundAt(tileOfSubcell(sub)) + rise.height));
  const palette = reliefPalette(rises);
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), toonMaterial(0xffffff), columns.length);
  const baseColors = columns.map(({ sub, rise }, index) => {
    const top = tops.at(sub) ?? 0;
    const middle = subcellCenter(sub);
    const center = new THREE.Vector3(middle.x, (top + COLUMN_BOTTOM) / 2, middle.y);
    const size = new THREE.Vector3(1 / SUBCELLS, top - COLUMN_BOTTOM, 1 / SUBCELLS);
    mesh.setMatrixAt(index, new THREE.Matrix4().compose(center, new THREE.Quaternion(), size));
    const color = palette.colorOf(rise.style, rise.height, dropAt(tops, sub), sub);
    mesh.setColorAt(index, color);
    return color;
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const tileOfColumn = columns.map(({ sub }) => tileOfSubcell(sub));
  return { mesh, tileOfColumn, topAt: (pos) => centerTop(tops, pos), baseColors };
}

/** Lo alto del centro de una casilla: lo mas alto de sus cuatro subcasillas del medio. */
function centerTop(tops: Grid<number | null>, pos: Pos): number {
  const middle = [SUBCELLS / 2 - 1, SUBCELLS / 2];
  return Math.max(...middle.flatMap((dx) => middle.map((dy) => tops.at({ x: pos.x * SUBCELLS + dx, y: pos.y * SUBCELLS + dy }) ?? 0)));
}
