import { describe, expect, it } from 'vitest';
import { aiTurn } from '@core/ai';
import { HQ, MAP_W } from '@core/data';
import { seededRng } from '@core/geom';
import { generateGame } from '@core/mapgen';
import { endRound, groundDistance, outcome } from '@core/rules';
import { deserialize, serialize } from '@core/save';
import { grid } from '@core/geom';
import type { GameState } from '@core/types';

function checkInvariants(s: GameState): void {
  const seen = new Set<string>();
  for (const u of s.units) {
    expect(u.life).toBeGreaterThan(0);
    expect(u.fuel).toBeGreaterThanOrEqual(0);
    expect(u.ammo).toBeGreaterThanOrEqual(0);
    if (u.carrier === null) {
      const k = `${u.x},${u.y}`;
      expect(seen.has(k), `dos unidades en ${k}`).toBe(false);
      seen.add(k);
    } else {
      expect(s.units.find((t) => t.uid === u.carrier)?.cargo).toContain(u.uid);
    }
  }
}

describe('generador de mapas', () => {
  it('100 mapas: ambas bases, conectadas por tierra, con unidades y neutrales', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const s = generateGame(seededRng(seed));
      const hq0 = s.buildings.find((b) => b.owner === 0 && b.type === HQ)!;
      const hq1 = s.buildings.find((b) => b.owner === 1 && b.type === HQ)!;
      expect(hq0, `seed ${seed}`).toBeTruthy();
      expect(hq1, `seed ${seed}`).toBeTruthy();
      expect(groundDistance(s, hq0, 0, grid(false))[hq1.x]![hq1.y]).toBeGreaterThan(0);
      expect(s.units.filter((u) => u.team === 0)).toHaveLength(3);
      expect(s.units.filter((u) => u.team === 1)).toHaveLength(3);
      const neutral = s.buildings.filter((b) => b.owner === null).length;
      expect(neutral).toBeGreaterThanOrEqual(20);
      expect(s.map).toHaveLength(MAP_W);
      expect(new Set(s.buildings.map((b) => `${b.x},${b.y}`)).size).toBe(s.buildings.length);
      checkInvariants(s);
    }
  });
});

describe('partidas simuladas', () => {
  it('20 partidas IA contra IA (60 dias): sin errores y guardar/cargar exacto', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rng = seededRng(seed * 7919);
      const s = generateGame(rng);
      while (outcome(s) === 'playing' && s.day <= 60) {
        for (const team of [0, 1] as const) {
          for (const _ of aiTurn(s, rng, team)) if (outcome(s) !== 'playing') break;
          if (outcome(s) !== 'playing') break;
        }
        endRound(s);
        checkInvariants(s);
        if (s.day % 10 === 0) {
          const copy = deserialize(serialize(s));
          expect(copy).not.toBeNull();
          expect(serialize(copy!)).toBe(serialize(s));
        }
      }
    }
  }, 120_000);

  it('la IA gana a un jugador que no hace nada', () => {
    let won = 0;
    const days: number[] = [];
    for (let seed = 1; seed <= 20; seed++) {
      const rng = seededRng(seed * 104729);
      const s = generateGame(rng);
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
  }, 120_000);
});
