import { hqId, resultFor } from './helpers';
import { duel } from '@core/teams';
import { MoveType } from '@core/content';
import { describe, expect, it } from 'vitest';
import { aiController } from '@core/controllers';
import { GameSession, passiveController, runMatch } from '@core/session';
import { seededRng } from '@core/util/random';
import { createMatch } from '@core/defaultGames';
import { skirmishConfig } from '@core/match';
import { distanceMap } from '@core/rules';
import { checkInvariants } from './sim/partidas';

const HQ = hqId();

describe('generador de mapas', () => {
  it('100 mapas: ambas bases, conectadas por tierra, con unidades y neutrales', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const s = createMatch(skirmishConfig({ seed, teams: duel('human', 'ai') }));
      const hq0 = s.buildings.find((building) => building.owner === 0 && building.type === HQ)!;
      const hq1 = s.buildings.find((building) => building.owner === 1 && building.type === HQ)!;
      expect(hq0, `seed ${seed}`).toBeTruthy();
      expect(hq1, `seed ${seed}`).toBeTruthy();
      expect(distanceMap(s, hq0, MoveType.FOOT).at(hq1)).toBeLessThan(Infinity);
      expect(s.units.filter((unit) => unit.team === 0)).toHaveLength(3);
      expect(s.units.filter((unit) => unit.team === 1)).toHaveLength(3);
      const neutral = s.buildings.filter((building) => building.owner === null).length;
      expect(neutral).toBeGreaterThanOrEqual(20);
      expect(s.map).toHaveLength(32);
      expect(new Set(s.buildings.map((building) => `${building.x},${building.y}`)).size).toBe(s.buildings.length);
      checkInvariants(s);
    }
  });
});

describe('partidas simuladas', () => {
  // Las 20 partidas IA contra IA estan en tests/sim/ia-*.test.ts (repartidas para ir en paralelo).

  it('la IA gana a un jugador que no hace nada', () => {
    let won = 0;
    const days: number[] = [];
    for (let seed = 1; seed <= 20; seed++) {
      const rng = seededRng(seed * 104729);
      const s = createMatch(skirmishConfig({ seed, teams: duel('human', 'ai') }), rng);
      runMatch(new GameSession(s, [passiveController(), aiController(rng)]), { until: (state) => state.day > 60 });
      if (resultFor(s, 0) === 'lost') {
        won++;
        days.push(s.day);
      }
    }
    console.log(`la IA gana ${won}/20, dias: ${days.join(',')}`);
    expect(won).toBeGreaterThanOrEqual(16);
  }, 300_000); // sin combustible quedan mas unidades vivas: mas lento que antes
});
