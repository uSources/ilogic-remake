import { describe, expect, it } from 'vitest';
import { createMatch, loadGame } from '@core/defaultGames';
import { skirmishConfig } from '@core/match';
import { serialize } from '@core/save';
import { duel } from '@core/teams';
import { decisionRngOf, playerView } from '@core/playerView';
import { turnSeedOf } from '@core/turnSeeds';
import type { GameState, TeamId } from '@core/model';
import { matchSeedsFrom, seededRng, turnSeed } from '@core/util/random';
import { blankState } from './helpers';

const draws = (rng: () => number) => Array.from({ length: 3 }, () => rng());
/** Las primeras tiradas del azar de las decisiones del equipo en su turno de hoy. */
const turnDraws = (s: GameState, team: TeamId) => draws(seededRng(turnSeedOf(s, team)));

/** El azar de las decisiones de la IA sale de la partida: se repite al cargarla, en una repeticion o por la red. */
describe('el azar de las decisiones (GameState.decisionSeed, turnSeedOf, decisionRngOf)', () => {
  it('la pone quien crea la partida, aparte de la de sus dados', () => {
    const s = blankState();
    expect([s.dice, s.decisionSeed]).toEqual([1, 2]);
    const seeds = matchSeedsFrom(7);
    expect(seeds.decisions).not.toBe(seeds.dice);
    expect(matchSeedsFrom(7)).toEqual(seeds);
    const map = createMatch(skirmishConfig({ seed: 5, teams: duel('human', 'ai') }));
    expect(map.decisionSeed).not.toBe(map.dice);
  });

  it('el mismo turno da las mismas decisiones; otro dia u otro equipo, otras', () => {
    const s = blankState();
    expect(turnDraws(s, 1)).toEqual(turnDraws(s, 1));
    expect(turnDraws(s, 1)).not.toEqual(turnDraws(s, 0));
    const today = turnDraws(s, 1);
    s.day++;
    expect(turnDraws(s, 1)).not.toEqual(today);
    expect(turnSeed(7, 3, 1)).toBe(turnSeed(7, 3, 1));
  });

  it('se guarda con la partida: al cargarla, el turno de la IA decide igual', () => {
    const s = createMatch(skirmishConfig({ seed: 5, teams: duel('human', 'ai') }));
    const loaded = loadGame(serialize(s))!;
    expect(loaded.decisionSeed).toBe(s.decisionSeed);
    expect(turnDraws(loaded, 1)).toEqual(turnDraws(s, 1));
  });

  it('quien decide lo saca de su vista: el de su turno, aunque la semilla de la partida no se vea', () => {
    const s = createMatch(skirmishConfig({ seed: 5, teams: duel('human', 'ai') }));
    const view = playerView(s, 1);
    expect(view.state.decisionSeed).toBe(0);
    expect(draws(decisionRngOf(view))).toEqual(turnDraws(s, 1));
    expect(draws(decisionRngOf(view))).not.toEqual(draws(seededRng(turnSeedOf(view.state, 1))));
  });
});
