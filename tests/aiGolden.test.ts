import { defaultContent } from '@core/content/default';
import { settingsWith } from '@core/matchSettings';
import { describe, expect, it } from 'vitest';
import { playGame } from '../tools/balance/play';

/**
 * Partidas IA contra IA con semilla fija: si cambia el resultado, ha cambiado el comportamiento
 * del juego (reglas o IA). Al refactorizar no debe cambiar; si el cambio es a proposito, se
 * actualiza la instantanea con `npx vitest run -u tests/aiGolden.test.ts`.
 */
/** Una partida entera tarda unos segundos (mas en las maquinas de CI): mas que el limite de un test normal. */
const GAME_TIMEOUT_MS = 30_000;

describe('IA: partidas de referencia', () => {
  it.each([1, 2, 3])('semilla %i', { timeout: GAME_TIMEOUT_MS }, (seed) => {
    const record = playGame({
      seed,
      maxDays: 25,
      policies: ['ai', 'ai'],
      size: 20,
      settings: settingsWith(defaultContent()),
      content: defaultContent(),
    });
    const last = record.samples[record.samples.length - 1];
    expect({ winners: record.winners, reason: record.reason, days: record.days, events: record.events, last }).toMatchSnapshot();
  });
});
