import { describe, expect, it } from 'vitest';
import { UNIT } from '@core/data';
import { newUnit } from '@core/rules';
import { deserialize, serialize } from '@core/save';
import { recordEvent, stats } from '@core/stats';
import { blankState } from './helpers';

describe('estadisticas', () => {
  it('cuenta compras, bajas y capturas por bando', () => {
    const s = blankState();
    const u = newUnit(s, 1, 0, 3, 3);
    s.units.push(u);
    recordEvent(s, { kind: 'spawn', uid: u.uid, at: { x: 3, y: 3 } }, 0);
    recordEvent(s, { kind: 'attack', attacker: u.uid, target: { x: 4, y: 3 }, damage: 50, killed: true }, 0);
    recordEvent(s, { kind: 'attack', attacker: u.uid, target: { x: 4, y: 3 }, damage: 10, killed: false }, 0);
    recordEvent(s, { kind: 'capture', uid: u.uid, at: { x: 3, y: 3 }, owner: null }, 1);
    expect(stats(s)).toEqual({ built: [1, 0], spent: [UNIT.cost[1], 0], lost: [0, 1], captured: [0, 1] });
  });

  it('se guardan con la partida y las antiguas cargan sin ellas', () => {
    const s = blankState();
    stats(s).built[0] = 4;
    expect(deserialize(serialize(s))!.stats!.built).toEqual([4, 0]);
    const old = blankState();
    expect(deserialize(serialize(old))!.stats).toBeUndefined();
    const bad = { ...blankState(), stats: { built: 'x' } };
    expect(deserialize(JSON.stringify(bad))!.stats!.lost).toEqual([0, 0]);
  });
});
