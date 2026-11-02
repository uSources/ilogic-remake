import { beforeEach, describe, expect, it } from 'vitest';
import { aiGeneral, bestAreaTarget, chooseAbility } from '@core/aiGenerals';
import { AI, DEFAULT_RULES, UNIT_NAMES, useRules } from '@core/data';
import { generalDef, newGeneral } from '@core/generals';
import { newUnit } from '@core/rules';
import type { GameState } from '@core/types';
import { blankState } from './helpers';

const T = (n: string) => UNIT_NAMES.indexOf(n);

/** La IA (bando 1) con Brisa y la carga dada; una unidad suya para ver algo. */
function aiBrisa(charge: number, fog = false): GameState {
  useRules({ ...DEFAULT_RULES, fog, weather: false });
  const s = blankState();
  s.generals = [null, newGeneral('Brisa')];
  s.generals[1]!.charge = charge;
  newUnit(s, T('Soldier'), 1, 10, 10);
  return s;
}

beforeEach(() => useRules({ ...DEFAULT_RULES, weather: false }));

describe('la IA usa a su general', () => {
  it('ataque aereo donde mas valor quita (dos tanques juntos mejor que uno solo)', () => {
    const s = aiBrisa(6);
    newUnit(s, T('Tank'), 0, 3, 3);
    newUnit(s, T('Tank'), 0, 14, 14);
    newUnit(s, T('Tank'), 0, 15, 15);
    const best = bestAreaTarget(s, 1, 1, 30, 10)!;
    expect(best.value).toBeGreaterThan(7000);
    expect(Math.abs(best.target.x - 14.5)).toBeLessThanOrEqual(1);
    const c = chooseAbility(s, 1)!;
    expect(c.ability).toBe('airstrike');
    const evs = [...aiGeneral(s, 1)];
    expect(evs).toHaveLength(1);
    const ev = evs[0]!;
    expect(ev.kind === 'ability' ? ev.hits.length : 0).toBe(2);
  });

  it('no gasta la carga en algo que vale poco', () => {
    // Con Roca: su reparacion no gasta la barra entera, asi que puede esperar a que valga la pena.
    useRules({ ...DEFAULT_RULES, weather: false });
    const s = blankState();
    s.generals = [null, newGeneral('Roca')];
    s.generals[1]!.charge = generalDef('Roca')!.abilities[0]!.cost;
    newUnit(s, T('Tank'), 1, 3, 3).life = 98; // 2 de vida de un tanque: poco valor
    expect(chooseAbility(s, 1)).toBeNull();
  });

  it('con la barra llena usa lo que valga algo (reconocimiento con niebla)', () => {
    const s = aiBrisa(6, true);
    const c = chooseAbility(s, 1)!;
    expect(c.ability).toBe('recon');
    expect(c.value).toBe(AI.REVEALVALUE);
  });

  it('no bombardea a ciegas: solo enemigos que ve', () => {
    const s = aiBrisa(5, true);
    newUnit(s, T('Tank'), 0, 25, 25); // lejos, en la niebla
    newUnit(s, T('Tank'), 0, 26, 25);
    expect(bestAreaTarget(s, 1, 1, 30, 10)).toBeNull();
  });

  it('sin general, o ya usada este turno, no hace nada', () => {
    const s = aiBrisa(6);
    newUnit(s, T('Tank'), 0, 11, 11);
    s.generals![1]!.used = true;
    expect([...aiGeneral(s, 1)]).toEqual([]);
    s.generals = undefined;
    expect([...aiGeneral(s, 1)]).toEqual([]);
  });
});
