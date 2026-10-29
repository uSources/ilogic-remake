import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, useRules } from '../src/core/data';
import { playGame } from '../tools/balance/play';

/**
 * Partidas IA contra IA con semilla fija: si cambia el resultado, ha cambiado el comportamiento
 * del juego (reglas o IA). Al refactorizar no debe cambiar; si el cambio es a proposito, se
 * actualiza la instantanea con `npx vitest run -u tests/aiGolden.test.ts`.
 */
describe('IA: partidas de referencia', () => {
  it.each([1, 2, 3])('semilla %i', (seed) => {
    useRules(DEFAULT_RULES);
    const g = playGame({ seed, maxDays: 25, policies: ['ai', 'ai'], size: 20 });
    const last = g.samples[g.samples.length - 1];
    expect({ winner: g.winner, reason: g.reason, days: g.days, events: g.events, last }).toMatchSnapshot();
  });
});
