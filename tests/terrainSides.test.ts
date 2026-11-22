import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { columnsOf } from '../src/view3d/engine/terrain/columnFaces';
import { cutBelow } from '../src/view3d/engine/terrain/cutBelow';
import { buildRelief } from '../src/view3d/engine/terrain/relief';
import type { ReliefMap, ReliefStyle } from '../src/view3d/engine/terrain/reliefGrid';

/**
 * Los laterales del terreno no se pisan: dos caras en el mismo plano parpadean (z-fighting), y en el
 * borde del mapa y frente a lo mas bajo se veian a rayas.
 */

const verticesOf = (geometry: THREE.BufferGeometry): number[] =>
  Array.from({ length: geometry.getAttribute('position').count }, (_, vertex) => vertex);

describe('un bloque recortado por debajo de una altura (las copias apiladas de las casillas altas)', () => {
  // De -0.5 a 0.5; en sus laterales la textura sube con la altura: v = y + 0.5.
  const block = new THREE.BoxGeometry(1, 1, 1);
  const floor = 0.2;
  const cut = cutBelow(block, floor);
  const position = cut.getAttribute('position');
  const uv = cut.getAttribute('uv');
  const sides = verticesOf(cut).filter((vertex) => cut.getAttribute('normal').getY(vertex) === 0);

  it('no le queda nada por debajo del corte', () => {
    expect(Math.min(...verticesOf(cut).map((vertex) => position.getY(vertex)))).toBeCloseTo(floor);
  });

  it('sus laterales enseñan lo mismo que el bloque entero a esa altura: la textura no se estira', () => {
    for (const vertex of sides) {
      expect(uv.getY(vertex)).toBeCloseTo(position.getY(vertex) + 0.5);
      expect(uv.getX(vertex)).toBeCloseTo(block.getAttribute('uv').getX(vertex));
    }
  });

  it('el bloque del que sale sigue entero', () => {
    expect(Math.min(...verticesOf(block).map((vertex) => block.getAttribute('position').getY(vertex)))).toBe(-0.5);
  });
});

describe('las faldas de una montaña que se salen a la casilla de al lado', () => {
  const peak: ReliefStyle = { shape: 'peak', bands: [{ from: 0, color: 0x888888 }] };
  const ground = 0.55;
  const mountainBetweenTwoTiles = (spillRestsOnGround: boolean): ReliefMap => ({
    width: 3,
    height: 1,
    tiles: [{ pos: { x: 1, y: 0 }, style: peak }],
    groundAt: () => ground,
    canSpill: () => true,
    spillRestsOnGround,
  });
  const spillBottoms = (map: ReliefMap): number[] => {
    const relief = buildRelief(map);
    return columnsOf(relief.mesh)
      .filter((_, index) => relief.tileOfColumn[index]!.x !== 1)
      .map((column) => column.bottom);
  };

  it('en el tablero se apoyan en el suelo de esa casilla: no bajan por el bloque que tiene debajo', () => {
    const bottoms = spillBottoms(mountainBetweenTwoTiles(true));
    expect(bottoms.length).toBeGreaterThan(0);
    for (const bottom of bottoms) expect(bottom).toBeCloseTo(ground);
  });

  it('en un islote (sin bloque debajo, solo mar) bajan hasta el fondo', () => {
    for (const bottom of spillBottoms(mountainBetweenTwoTiles(false))) expect(bottom).toBeCloseTo(-0.5);
  });
});
