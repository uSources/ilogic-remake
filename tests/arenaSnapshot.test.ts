import { describe, expect, it } from 'vitest';
import { snapshotSource } from '../tools/improve/arena';

/** La copia de referencia de la IA (npm run arena -- --snapshot) reescribe bien los imports. */
describe('arena: copia de la IA', () => {
  const copied = new Set(['ai.ts', 'ai/context.ts', 'ai/tactics.ts']);

  it('lo de fuera de la IA pasa al alias; lo de dentro se queda relativo', () => {
    const src =
      "import { HQ, UNIT } from '../data';\nimport { buildingAt } from '../rules/queries';\nimport { doMove } from './context';\n";
    expect(snapshotSource('ai/tactics.ts', src, copied)).toBe(
      "import { HQ, UNIT } from '@core/data';\nimport { buildingAt } from '@core/rules/queries';\nimport { doMove } from './context';\n",
    );
    expect(snapshotSource('ai.ts', "import { aiCtx } from './ai/context';\nimport { wait } from './rules/unitActions';\n", copied)).toBe(
      "import { aiCtx } from './ai/context';\nimport { wait } from '@core/rules/unitActions';\n",
    );
  });

  it('los pesos AI salen de weights.ts (congelados)', () => {
    expect(snapshotSource('ai/context.ts', "import { AI, RULES, UNIT } from '../data';\n", copied)).toBe(
      "import { RULES, UNIT } from '@core/data';\nimport { AI } from '../weights';\n",
    );
    expect(snapshotSource('ai.ts', "import { AI } from './data';\n", copied)).toBe("import { AI } from './weights';\n");
  });
});
