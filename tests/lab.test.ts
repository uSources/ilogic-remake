import { describe, expect, it } from 'vitest';
import { defaultContent } from '@core/content/default';
import { outcome } from '@core/rules';
import { defaultLab, LAB_FROM, LAB_TARGET, labRange, labState } from '../src/lab';

const { UNIT_NAMES } = defaultContent().tables;

const T = (name: string) => UNIT_NAMES.indexOf(name);

describe('laboratorio de animaciones', () => {
  it('para mover, la propia empieza lejos; para atacar, ya a su distancia de tiro', () => {
    const o = defaultLab();
    const moving = labState(o, 'move');
    expect(moving.units.map((unit) => [unit.team, unit.x, unit.y])).toEqual([
      [0, LAB_FROM.x, LAB_FROM.y],
      [1, LAB_TARGET.x, LAB_TARGET.y],
    ]);
    const art = labState({ ...o, attacker: T('Artillery') }, 'attack');
    expect(LAB_TARGET.x - art.units[0]!.x).toBe(labRange(art, T('Artillery')));
    expect(labRange(art, T('Artillery'))).toBeGreaterThan(1);
  });

  it('destruir: la enemiga empieza con poca vida; la partida no se acaba sola', () => {
    const s = labState(defaultLab(), 'kill');
    expect(s.units[1]!.life).toBeLessThan(30);
    expect(outcome(s)).toBe('playing');
  });
});
