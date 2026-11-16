import { describe, expect, it } from 'vitest';
import { newUnit } from '@core/measure';
import { threatTiles } from '../src/view3d/systems/threat/threatZone';
import { blankState, ENEMY, PLAYER, unitTypeNamed } from './helpers';

/** «Ver amenaza»: a donde puede disparar algun enemigo que quien mira ve. */

const SOLDIER = unitTypeNamed('Soldier');

describe('amenaza enemiga', () => {
  it('un enemigo que se ve amenaza su casilla y las de alrededor', () => {
    const s = blankState({ fog: false });
    newUnit(s, SOLDIER, ENEMY, { x: 10, y: 10 });
    const tiles = threatTiles(s, PLAYER);
    expect(tiles).toContainEqual({ x: 10, y: 11 });
    expect(tiles).not.toContainEqual({ x: 25, y: 25 });
  });

  it('los enemigos en la niebla no se delatan', () => {
    const s = blankState({ fog: true });
    newUnit(s, SOLDIER, PLAYER, { x: 1, y: 1 });
    newUnit(s, SOLDIER, ENEMY, { x: 20, y: 20 });
    expect(threatTiles(s, PLAYER)).toEqual([]);
  });
});
