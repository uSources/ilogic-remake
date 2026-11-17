import { describe, expect, it } from 'vitest';
import { newUnit } from '@core/measure';
import type { Pos } from '@core/model';
import { moveRange, reachableTiles } from '@core/rules';
import { attackReachTiles } from '../src/view3d/systems/turn/attackReach';
import { blankState, PLAYER, unitTypeNamed } from './helpers';

/** Hasta donde ataca la unidad elegida (el borde rojo), sin navegador. */

const has = (tiles: readonly Pos[], pos: Pos): boolean => tiles.some((tile) => tile.x === pos.x && tile.y === pos.y);
const manhattan = (a: Pos, b: Pos): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

describe('hasta donde ataca', () => {
  it('la que se mueve y dispara: el anillo justo fuera de su alcance azul, sin repetir las azules', () => {
    const s = blankState({ fog: false });
    const soldier = newUnit(s, unitTypeNamed('Soldier'), PLAYER, { x: 10, y: 10 });
    const range = moveRange(s, soldier);
    const reach = reachableTiles(range);
    const tiles = attackReachTiles(s, soldier, range);
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.filter((pos) => has(reach, pos))).toEqual([]);
    // Cada casilla roja esta al lado de alguna a la que llega (un soldado dispara a la de al lado).
    expect(tiles.every((pos) => reach.some((tile) => manhattan(tile, pos) === 1))).toBe(true);
  });

  it('la artilleria: solo desde donde esta, a su distancia de tiro (de 3 a 5), aunque caigan en su alcance azul', () => {
    const s = blankState({ fog: false });
    const gun = newUnit(s, unitTypeNamed('Artillery'), PLAYER, { x: 10, y: 10 });
    const tiles = attackReachTiles(s, gun, moveRange(s, gun));
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.every((pos) => manhattan(pos, gun) >= 3 && manhattan(pos, gun) <= 5)).toBe(true);
    expect(has(tiles, { x: 10, y: 13 })).toBe(true);
    expect(has(tiles, { x: 10, y: 12 })).toBe(false);
  });

  it('ya movida: desde donde esta si aun puede disparar; si no, nada', () => {
    const s = blankState({ fog: false });
    const soldier = newUnit(s, unitTypeNamed('Soldier'), PLAYER, { x: 10, y: 10 });
    soldier.turnState = 'moved';
    expect(attackReachTiles(s, soldier, null)).toEqual(
      expect.arrayContaining([
        { x: 11, y: 10 },
        { x: 9, y: 10 },
      ]),
    );
    soldier.turnState = 'done';
    expect(attackReachTiles(s, soldier, null)).toEqual([]);
  });

  it('nunca marca la casilla de la propia unidad', () => {
    const s = blankState({ fog: false });
    const gun = newUnit(s, unitTypeNamed('Artillery'), PLAYER, { x: 10, y: 10 });
    expect(has(attackReachTiles(s, gun, moveRange(s, gun)), gun)).toBe(false);
  });
});
