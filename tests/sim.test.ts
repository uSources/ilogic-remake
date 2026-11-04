import { describe, expect, it } from 'vitest';
import { aiTurn } from '@core/ai';
import { rulesWith } from '@core/data';
import { defaultContent } from '@core/content/default';
import { seededRng } from '@core/geom';
import { createGame } from '@core/defaultGames';
import { endRound, groundDistance, outcome } from '@core/rules';
import { createLayer } from '@core/mapGrid';
import { checkInvariants } from './sim/partidas';

const { HQ } = defaultContent().tables;

describe('generador de mapas', () => {
  it('100 mapas: ambas bases, conectadas por tierra, con unidades y neutrales', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const s = createGame(seededRng(seed), { rules: rulesWith(defaultContent()) });
      const hq0 = s.buildings.find((b) => b.owner === 0 && b.type === HQ)!;
      const hq1 = s.buildings.find((b) => b.owner === 1 && b.type === HQ)!;
      expect(hq0, `seed ${seed}`).toBeTruthy();
      expect(hq1, `seed ${seed}`).toBeTruthy();
      expect(groundDistance(s, hq0, 0, createLayer(s, false)).at(hq1)).toBeGreaterThan(0);
      expect(s.units.filter((u) => u.team === 0)).toHaveLength(3);
      expect(s.units.filter((u) => u.team === 1)).toHaveLength(3);
      const neutral = s.buildings.filter((b) => b.owner === null).length;
      expect(neutral).toBeGreaterThanOrEqual(20);
      expect(s.map).toHaveLength(32);
      expect(new Set(s.buildings.map((b) => `${b.x},${b.y}`)).size).toBe(s.buildings.length);
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
      const s = createGame(rng, { rules: rulesWith(defaultContent()) });
      while (outcome(s) === 'playing' && s.day <= 60) {
        for (const _ of aiTurn(s, rng, 1)) if (outcome(s) !== 'playing') break;
        endRound(s);
      }
      if (outcome(s) === 'lost') {
        won++;
        days.push(s.day);
      }
    }
    console.log(`la IA gana ${won}/20, dias: ${days.join(',')}`);
    expect(won).toBeGreaterThanOrEqual(16);
  }, 300_000); // sin combustible quedan mas unidades vivas: mas lento que antes
});
