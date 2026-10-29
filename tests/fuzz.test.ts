import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_RULES, setMapSize, useRules } from '../src/core/data';
import { capture, moveUnit, newUnit, captureProgress, endRound } from '../src/core/rules';
import { fuzzGame } from '../tools/improve/fuzz';
import { blankState } from './helpers';

afterEach(() => {
  setMapSize(32);
  useRules(DEFAULT_RULES);
});

describe('cazador de fallos', () => {
  // Pocas partidas para que el test sea rapido; npm run fuzz juega cientos.
  it.each([11, 22, 33, 44, 55, 66])('partida %i: ningun invariante roto', (seed) => {
    const f = fuzzGame(seed, { size: 20, days: 12 });
    expect(f ? `dia ${f.day} tras "${f.action}": ${f.errors.join('; ')}` : null).toBeNull();
  });

  it('una captura a medias se pierde al irse la unidad, aunque vuelva (fallo encontrado por el fuzz)', () => {
    useRules(DEFAULT_RULES);
    const s = blankState();
    const u = newUnit(s, 0, 0, 5, 5);
    const b = { type: 0, owner: 1 as const, x: 5, y: 5, capture: null };
    s.buildings.push(b);
    expect(capture(s, u)).toBeTruthy();
    expect(b.capture).toBeTruthy();
    endRound(s);
    moveUnit(s, u, { x: 6, y: 5 });
    expect(b.capture).toBeNull();
    endRound(s);
    moveUnit(s, u, { x: 5, y: 5 });
    expect(captureProgress(s, b)).toBeNull();
  });
});
