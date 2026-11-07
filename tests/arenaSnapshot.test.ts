import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultAiProfile } from '@core/ai';
import { defaultContent } from '@core/content/default';
import { baselineProfile, playDuel, readWeights } from '../tools/improve/arena';

/** Una partida pequeña y corta: basta con que las dos IAs hagan de todo unos dias. */
const ARENA_TEST_SIZE = 16;
const ARENA_TEST_DAYS = 6;

const savedWeights = () => readWeights(JSON.parse(readFileSync(new URL('../improve/ai-baseline.json', import.meta.url), 'utf8')));

/** La IA de referencia son unos pesos guardados (improve/ai-baseline.json) con la IA de ahora: un perfil. */
describe('arena: la IA de referencia', () => {
  it('los pesos guardados son justo los que lee la IA (si cambia ai.json, --snapshot)', () => {
    expect(Object.keys(savedWeights()).sort()).toEqual(Object.keys(defaultContent().ai).sort());
  });

  it('unos pesos con una clave de mas o de menos no valen', () => {
    expect(() => readWeights({ ...savedWeights(), EXTRA: 1 })).toThrow(/peso desconocido/);
    const { KILLBONUS: _killBonus, ...missing } = savedWeights();
    expect(() => readWeights(missing)).toThrow(/KILLBONUS/);
  });

  it('el perfil de referencia es el de la IA con esos pesos', () => {
    const content = defaultContent();
    const weights = { ...savedWeights(), KILLBONUS: 1 };
    const profile = baselineProfile(content, weights);
    expect(profile.weights).toBe(weights);
    expect(profile.behaviours).toBe(defaultAiProfile(content).behaviours);
  });

  it('una partida corta de la IA del juego contra la de referencia termina sin errores', () => {
    const content = defaultContent();
    const winner = playDuel(1, [defaultAiProfile(content), baselineProfile(content, savedWeights())], ARENA_TEST_SIZE, ARENA_TEST_DAYS);
    expect([null, 'first', 'second']).toContain(winner);
  });
});

/** Un cambio de codigo de la IA se prueba como perfil (`--candidate`): el ejemplo compila y juega. */
describe('arena: candidatos', () => {
  it('el candidato de ejemplo juega contra la IA del juego', async () => {
    const { profile } = await import('../tools/improve/candidates/example');
    const content = defaultContent();
    const candidate = profile(content);
    expect(candidate.behaviours.some((behaviour) => behaviour.id === 'randomMove')).toBe(false);
    expect([null, 'first', 'second']).toContain(playDuel(2, [candidate, defaultAiProfile(content)], ARENA_TEST_SIZE, ARENA_TEST_DAYS));
  });
});
