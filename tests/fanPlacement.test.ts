import { describe, expect, it } from 'vitest';
import { fanAround, type Fan, type Size } from '../src/hud/common/placement';

/** El abanico de la compra (game/BuyFan.tsx): las fichas alrededor de la fabrica, sin pisarse ni salirse. */

const screen = { width: 1280, height: 800 };
const slot = { width: 84, height: 96 };

const placed = ({ center, slots }: Fan) => slots.map(({ dx, dy }) => ({ x: center.x + dx, y: center.y + dy }));

function overlaps(fan: Fan, box: Size): boolean {
  const points = placed(fan);
  return points.some((a, i) => points.slice(i + 1).some((b) => Math.abs(a.x - b.x) < box.width && Math.abs(a.y - b.y) < box.height));
}

function inside(fan: Fan, box: Size): boolean {
  return placed(fan).every(
    ({ x, y }) =>
      x - box.width / 2 >= 16 &&
      x + box.width / 2 <= screen.width - 16 &&
      y - box.height / 2 >= 16 &&
      y + box.height / 2 <= screen.height - 16,
  );
}

describe('fanAround', () => {
  it('pocas fichas: en arco hacia arriba, centrado en la fabrica', () => {
    const fan = fanAround({ x: 640, y: 500 }, 3, slot, screen);
    expect(fan.center).toEqual({ x: 640, y: 500 });
    expect(fan.slots.every(({ dy }) => dy < 0)).toBe(true);
    expect(Math.abs(fan.slots[1]!.dx)).toBe(0);
    expect(fan.slots[1]!.dy).toBeLessThanOrEqual(-92);
    expect(overlaps(fan, slot)).toBe(false);
  });

  it('pegada arriba, se gira hacia dentro (abajo) y no se sale', () => {
    const fan = fanAround({ x: 640, y: 60 }, 3, slot, screen);
    expect(fan.slots.every(({ dy }) => dy > 0)).toBe(true);
    expect(inside(fan, slot)).toBe(true);
  });

  it('muchas fichas: la vuelta entera, sin pisarse; en una esquina, el centro se mueve hacia dentro', () => {
    const fan = fanAround({ x: 640, y: 400 }, 10, slot, screen);
    expect(fan.slots).toHaveLength(10);
    expect(Math.abs(fan.slots[0]!.dx)).toBe(0);
    expect(fan.slots[0]!.dy).toBeLessThan(0);
    expect(overlaps(fan, slot)).toBe(false);
    const corner = fanAround({ x: 30, y: 30 }, 10, slot, screen);
    expect(inside(corner, slot)).toBe(true);
  });
});
