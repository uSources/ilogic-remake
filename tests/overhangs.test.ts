import { describe, expect, it } from 'vitest';
import type { Pos } from '@core/model';
import { isPeekedAt, overhangsOver } from '../src/ui/map/overhangs';
import { footTile, tileFoot } from '../src/ui/map/tileImage';

const tallAt =
  (...tiles: Pos[]) =>
  (tile: Pos) =>
    tiles.some((tall) => tall.x === tile.x && tall.y === tile.y);

describe('lo que sobresale de los dibujos altos', () => {
  it('tapa a la unidad que esta justo detras (una fila mas arriba)', () => {
    const unitBehindTree = { x: 3, y: 4 };
    expect(overhangsOver([unitBehindTree], tallAt({ x: 3, y: 5 }))).toEqual([{ owner: { x: 3, y: 5 }, hidden: unitBehindTree }]);
  });

  it('no tapa a la que esta delante, encima o al lado del dibujo alto', () => {
    const tree = { x: 3, y: 5 };
    const notBehind = [
      { x: 3, y: 6 },
      { x: 3, y: 5 },
      { x: 4, y: 4 },
    ];
    expect(overhangsOver(notBehind, tallAt(tree))).toEqual([]);
  });

  it('se aclara solo con el cursor sobre la unidad tapada', () => {
    const overhang = { owner: { x: 3, y: 5 }, hidden: { x: 3, y: 4 } };
    expect(isPeekedAt(overhang, { x: 3, y: 4 })).toBe(true);
    expect(isPeekedAt(overhang, { x: 3, y: 5 })).toBe(false);
    expect(isPeekedAt(overhang, null)).toBe(false);
  });

  it('la casilla de un dibujo se recupera de su pie', () => {
    const tile = { x: 7, y: 2 };
    expect(footTile(tileFoot(tile))).toEqual(tile);
  });
});
