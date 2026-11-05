import { defaultContent } from '@core/content/default';
import { afterEach, describe, expect, it } from 'vitest';

import { capture, moveUnit, newUnit, captureProgress, endRound } from '@core/rules';
import { fuzzGame } from '../tools/improve/fuzz';
import { blankState } from './helpers';

afterEach(() => {});

describe('cazador de fallos', () => {
  // Pocas partidas para que el test sea rapido; npm run fuzz juega cientos.
  it.each([11, 22, 33, 44, 55, 66])('partida %i: ningun invariante roto', (seed) => {
    const failure = fuzzGame(seed, { size: 20, days: 12 });
    expect(failure ? `dia ${failure.day} tras "${failure.action}": ${failure.errors.join('; ')}` : null).toBeNull();
  });

  it('una captura a medias se pierde al irse la unidad, aunque vuelva (fallo encontrado por el fuzz)', () => {
    const s = blankState();
    const unit = newUnit(s, defaultContent().units.list[0]!, 0, { x: 5, y: 5 });
    const building = { type: 'City', owner: 1 as const, x: 5, y: 5, capture: null };
    s.buildings.push(building);
    expect(capture(s, unit)).toBeTruthy();
    expect(building.capture).toBeTruthy();
    endRound(s);
    moveUnit(s, unit, { x: 6, y: 5 });
    expect(building.capture).toBeNull();
    endRound(s);
    moveUnit(s, unit, { x: 5, y: 5 });
    expect(captureProgress(s, building)).toBeNull();
  });
});
