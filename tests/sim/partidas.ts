import { expect } from 'vitest';
import { aiTurn } from '@core/ai';
import { seededRng } from '@core/util/random';
import { createGame, saveContext } from '@core/defaultGames';
import { endRound, isMatchOver, turnTakers } from '@core/rules';
import { duel } from '@core/teams';
import { deserialize, serialize } from '@core/save';
import type { GameState } from '@core/model';
import { defaultContent } from '@core/content/default';

/**
 * Partidas simuladas, repartidas en varios ficheros (ia-*.test.ts) para que vitest las ejecute en
 * paralelo: en un solo fichero eran casi 40 s seguidos y la mayor parte de npm run check.
 */

export function checkInvariants(s: GameState): void {
  const seen = new Set<string>();
  for (const unit of s.units) {
    expect(unit.life).toBeGreaterThan(0);
    if (unit.carrier === null) {
      const key = `${unit.x},${unit.y}`;
      expect(seen.has(key), `dos unidades en ${key}`).toBe(false);
      seen.add(key);
    } else {
      expect(s.units.find((other) => other.uid === unit.carrier)?.cargo).toContain(unit.uid);
    }
  }
}

/** Partidas IA contra IA (60 dias) de las semillas [desde, hasta]: sin errores y guardar/cargar exacto. */
export function aiVsAi(from: number, to: number): void {
  for (let seed = from; seed <= to; seed++) {
    const rng = seededRng(seed * 7919);
    const s = createGame(rng, { teams: duel('ai', 'ai') });
    while (!isMatchOver(s) && s.day <= 60) {
      for (const team of turnTakers(s)) {
        for (const _ of aiTurn(s, rng, team)) if (isMatchOver(s)) break;
        if (isMatchOver(s)) break;
      }
      endRound(s);
      checkInvariants(s);
      if (s.day % 10 === 0) {
        const copy = deserialize(serialize(s), saveContext(defaultContent()));
        expect(copy).not.toBeNull();
        expect(serialize(copy!)).toBe(serialize(s));
      }
    }
  }
}
