import { describe, expect, it } from 'vitest';
import { outcome } from '@core/rules';
import { defaultLab, LAB_FROM, LAB_TARGET, labRange, labState } from '../src/lab';

describe('laboratorio de animaciones', () => {
  it('para mover, la propia empieza lejos; para atacar, ya a su distancia de tiro', () => {
    const options = defaultLab();
    const moving = labState(options, 'move');
    expect(moving.units.map((unit) => [unit.team, unit.x, unit.y])).toEqual([
      [0, LAB_FROM.x, LAB_FROM.y],
      [1, LAB_TARGET.x, LAB_TARGET.y],
    ]);
    const art = labState({ ...options, attacker: 'Artillery' }, 'attack');
    expect(LAB_TARGET.x - art.units[0]!.x).toBe(labRange(art, art.units[0]!));
    expect(labRange(art, art.units[0]!)).toBeGreaterThan(1);
  });

  it('destruir: la enemiga empieza con poca vida; la partida no se acaba sola', () => {
    const s = labState(defaultLab(), 'kill');
    expect(s.units[1]!.life).toBeLessThan(30);
    expect(outcome(s)).toBe('playing');
  });
});
