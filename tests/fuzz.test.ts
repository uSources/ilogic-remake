import { defaultContent } from '@core/content/default';
import { afterEach, describe, expect, it } from 'vitest';

import { captureProgress } from '@core/rules';
import { newUnit } from '@core/measure';
import { endRound } from '@core/rules/round';
import { act, blankState } from './helpers';
import { fuzzGame } from '../tools/improve/fuzz';

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
    act(s, 0, { kind: 'capture', uid: unit.uid });
    expect(building.capture).toBeTruthy();
    endRound(s);
    act(s, 0, { kind: 'move', uid: unit.uid, to: { x: 6, y: 5 } });
    expect(building.capture).toBeNull();
    endRound(s);
    act(s, 0, { kind: 'move', uid: unit.uid, to: { x: 5, y: 5 } });
    expect(captureProgress(s, building)).toBeNull();
  });
});
