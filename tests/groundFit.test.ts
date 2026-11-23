import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Pos } from '@core/model';
import { highestIn, PIECES_PER_SIDE, slabsOn, stripsOn, tileTop, type MarkGround } from '../src/view3d/engine/fx/groundFit';
import { flatMaterial, instanced, makeRoomFor, unitBox } from '../src/view3d/engine/fx/markParts';

/** Las marcas planas (alcance, amenaza, zonas de control) apoyadas en el relieve, sin quedar enterradas. */

const LIFT = 0.01;
const ONE_TILE = { inset: 0.5, length: 1, lift: LIFT };

/** Un suelo hecho de una funcion de la altura en cada punto (las casillas, a ras de 0). */
const groundOf = (surfaceAt: (x: number, z: number) => number): MarkGround => ({
  groundOf: (pos: Pos) => new THREE.Vector3(pos.x, surfaceAt(pos.x, pos.y), pos.y),
  surfaceAt,
});

const FLAT = groundOf(() => 0);
/** Una duna: sube poco (0,15) hacia el este de la casilla. */
const DUNE = groundOf((x) => (x > 0.25 ? 0.15 : 0));
/** Una ladera: el este de la casilla es una columna alta. */
const SLOPE = groundOf((x) => (x > 0.25 ? 0.8 : 0));

const heightOf = (matrix: THREE.Matrix4): number => new THREE.Vector3().setFromMatrixPosition(matrix).y;

describe('las marcas planas sobre el relieve', () => {
  it('lo mas alto de un trozo de suelo mira cada subcasilla, tambien las de los bordes', () => {
    expect(highestIn(SLOPE, { x: 0, z: 0, halfX: 0.5, halfZ: 0.5 })).toBe(0.8);
    expect(highestIn(SLOPE, { x: -0.25, z: 0, halfX: 0.2, halfZ: 0.5 })).toBe(0);
    expect(tileTop(DUNE, { x: 0, y: 0 })).toBe(0.15);
  });

  it('en llano, una losa y una tira enteras, a ras de su suelo', () => {
    const slabs = slabsOn(FLAT, { x: 0, y: 0 }, 0.9, LIFT);
    expect(slabs).toHaveLength(1);
    expect(heightOf(slabs[0]!)).toBeCloseTo(LIFT);
    expect(stripsOn(FLAT, { x: 0, y: 0 }, 'north', ONE_TILE)).toHaveLength(1);
  });

  it('en una duna, enteras pero apoyadas en lo mas alto (no se entierran)', () => {
    const [slab] = slabsOn(DUNE, { x: 0, y: 0 }, 0.9, LIFT);
    expect(slabsOn(DUNE, { x: 0, y: 0 }, 0.9, LIFT)).toHaveLength(1);
    expect(heightOf(slab!)).toBeCloseTo(0.15 + LIFT);
    expect(stripsOn(DUNE, { x: 0, y: 0 }, 'north', ONE_TILE)).toHaveLength(1);
  });

  it('en una ladera, en trozos, cada uno sobre lo suyo (entera flotaria por encima de la unidad)', () => {
    const slabs = slabsOn(SLOPE, { x: 0, y: 0 }, 1, LIFT);
    expect(slabs).toHaveLength(PIECES_PER_SIDE * PIECES_PER_SIDE);
    expect(new Set(slabs.map((slab) => heightOf(slab).toFixed(3)))).toEqual(new Set([LIFT.toFixed(3), (0.8 + LIFT).toFixed(3)]));
    // La tira del norte va a lo largo de x: cruza la ladera, en trozos. La del oeste queda abajo, entera.
    expect(stripsOn(SLOPE, { x: 0, y: 0 }, 'north', ONE_TILE)).toHaveLength(PIECES_PER_SIDE);
    const west = stripsOn(SLOPE, { x: 0, y: 0 }, 'west', ONE_TILE);
    expect(west).toHaveLength(1);
    expect(heightOf(west[0]!)).toBeCloseTo(LIFT);
  });
});

describe('las mallas de las marcas', () => {
  it('si no caben todos los trozos, crece su bufer (no se cortan) y la malla sigue siendo la misma', () => {
    const mesh = instanced(unitBox(), flatMaterial(0xffffff, 1), 4);
    let released = 0;
    mesh.addEventListener('dispose', () => released++);
    makeRoomFor(mesh, 4);
    expect(mesh.instanceMatrix.count).toBe(4);
    makeRoomFor(mesh, 5);
    expect(mesh.instanceMatrix.count).toBe(8);
    makeRoomFor(mesh, 30);
    expect(mesh.instanceMatrix.count).toBe(30);
    // Cada vez suelta el bufer de antes en la tarjeta grafica.
    expect(released).toBe(2);
  });
});
