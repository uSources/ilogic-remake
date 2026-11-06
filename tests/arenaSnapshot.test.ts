import { describe, expect, it } from 'vitest';
import { aiTurn } from '@core/ai';
import { playDuel, snapshotSource } from '../tools/improve/arena';

/** Una partida pequeña y corta: basta con que la IA de referencia haga de todo unos dias. */
const ARENA_TEST_SIZE = 16;
const ARENA_TEST_DAYS = 6;

/** La copia de referencia de la IA (npm run arena -- --snapshot) reescribe bien los imports. */
describe('arena: copia de la IA', () => {
  const copied = new Set(['ai.ts', 'ai/context.ts', 'ai/tactics.ts']);

  it('lo de fuera de la IA pasa al alias; lo de dentro se queda relativo', () => {
    const source =
      "import { HQ, UNIT } from '../data';\nimport { buildingAt } from '../rules/queries';\nimport { doMove } from './context';\n";
    expect(snapshotSource('ai/tactics.ts', source, copied)).toBe(
      "import { HQ, UNIT } from '@core/data';\nimport { buildingAt } from '@core/rules/queries';\nimport { doMove } from './context';\n",
    );
    expect(snapshotSource('ai.ts', "import { aiCtx } from './ai/context';\nimport { wait } from './rules/unitActions';\n", copied)).toBe(
      "import { aiCtx } from './ai/context';\nimport { wait } from '@core/rules/unitActions';\n",
    );
  });

  it('los pesos (weightsOf) salen de weights.ts (congelados)', () => {
    expect(snapshotSource('ai/context.ts', "import { movementOf, tablesOf, weightsOf } from '../gameContent';\n", copied)).toBe(
      "import { movementOf, tablesOf } from '@core/gameContent';\nimport { weightsOf } from '../weights';\n",
    );
    expect(snapshotSource('ai.ts', "import { weightsOf } from './gameContent';\n", copied)).toBe(
      "import { weightsOf } from './weights';\n",
    );
  });
});

/**
 * La IA de referencia sigue funcionando con el nucleo de ahora: si el nucleo cambia por debajo (un
 * export que se quita, una regla que cambia de forma), esto falla en vez de enterarse al lanzar la
 * arena. tsc tambien la comprueba (tsconfig.json, "include").
 */
describe('arena: la IA de referencia juega', () => {
  it('una partida corta de la IA actual contra la de referencia termina sin errores', async () => {
    const { aiTurn: baseline } = (await import('../improve/ai-baseline/ai')) as { aiTurn: typeof aiTurn };
    const winner = playDuel(1, [aiTurn, baseline], ARENA_TEST_SIZE, ARENA_TEST_DAYS);
    expect([null, 'first', 'second']).toContain(winner);
  });
});
