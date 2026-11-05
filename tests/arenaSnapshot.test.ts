import { describe, expect, it } from 'vitest';
import { snapshotSource } from '../tools/improve/arena';

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
