import { describe, expect, it } from 'vitest';
import { saveContext } from '@core/defaultGames';
import { defaultContent } from '@core/content/default';
import { newUnit } from '@core/rules';
import { deserialize, serialize } from '@core/save';
import { recordEvent, statsOf } from '@core/stats';
import { blankState } from './helpers';

const { UNIT } = defaultContent().tables;

describe('estadisticas', () => {
  it('cuenta compras, bajas y capturas por bando', () => {
    const s = blankState();
    const u = newUnit(s, 1, 0, { x: 3, y: 3 });
    s.units.push(u);
    recordEvent(s, { kind: 'spawn', uid: u.uid, at: { x: 3, y: 3 } }, 0);
    recordEvent(s, { kind: 'attack', attacker: u.uid, target: { x: 4, y: 3 }, damage: 50, killed: true }, 0);
    recordEvent(s, { kind: 'attack', attacker: u.uid, target: { x: 4, y: 3 }, damage: 10, killed: false }, 0);
    recordEvent(s, { kind: 'capture', uid: u.uid, at: { x: 3, y: 3 }, owner: null }, 1);
    expect(statsOf(s)).toEqual({ built: [1, 0], spent: [UNIT.cost[1], 0], lost: [0, 1], captured: [0, 1] });
  });

  it('leerlas no cambia la partida', () => {
    const s = blankState();
    expect(statsOf(s)).toEqual({ built: [0, 0], spent: [0, 0], lost: [0, 0], captured: [0, 0] });
    expect(s.stats).toBeUndefined();
  });

  it('se guardan con la partida y las antiguas cargan sin ellas', () => {
    const s = blankState();
    s.stats = { built: [4, 0], spent: [0, 0], lost: [0, 0], captured: [0, 0] };
    expect(deserialize(serialize(s), saveContext(defaultContent()))!.stats!.built).toEqual([4, 0]);
    const old = blankState();
    expect(deserialize(serialize(old), saveContext(defaultContent()))!.stats).toBeUndefined();
    const bad = { ...blankState(), stats: { built: 'x' } };
    expect(deserialize(JSON.stringify(bad), saveContext(defaultContent()))!.stats!.lost).toEqual([0, 0]);
  });
});
