import { describe, expect, it } from 'vitest';
import { decisionRng } from '@core/dice';
import { createMatch, loadGame } from '@core/defaultGames';
import { skirmishConfig } from '@core/match';
import { serialize } from '@core/save';
import { duel } from '@core/teams';
import { decisionSeedFor, turnSeed } from '@core/util/random';
import { blankState } from './helpers';

const draws = (rng: () => number) => Array.from({ length: 3 }, () => rng());

/** El azar de las decisiones de la IA sale de la partida: se repite al cargarla, en una repeticion o por la red. */
describe('el azar de las decisiones (GameState.decisionSeed, decisionRng)', () => {
  it('lo pone la partida al crearla, de la semilla de sus dados, y va aparte de ellos', () => {
    const s = blankState();
    expect(s.decisionSeed).toBe(decisionSeedFor(s.dice));
    expect(s.decisionSeed).not.toBe(s.dice);
  });

  it('el mismo turno da las mismas decisiones; otro dia u otro equipo, otras', () => {
    const s = blankState();
    expect(draws(decisionRng(s, 1))).toEqual(draws(decisionRng(s, 1)));
    expect(draws(decisionRng(s, 1))).not.toEqual(draws(decisionRng(s, 0)));
    const today = draws(decisionRng(s, 1));
    s.day++;
    expect(draws(decisionRng(s, 1))).not.toEqual(today);
    expect(turnSeed(7, 3, 1)).toBe(turnSeed(7, 3, 1));
  });

  it('se guarda con la partida: al cargarla, el turno de la IA decide igual', () => {
    const s = createMatch(skirmishConfig({ seed: 5, teams: duel('human', 'ai') }));
    const loaded = loadGame(serialize(s))!;
    expect(loaded.decisionSeed).toBe(s.decisionSeed);
    expect(draws(decisionRng(loaded, 1))).toEqual(draws(decisionRng(s, 1)));
  });
});
