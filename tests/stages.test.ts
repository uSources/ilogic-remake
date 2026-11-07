import { describe, expect, it } from 'vitest';
import { inStageOrder } from '@core/util/stages';

describe('inStageOrder: lo de siempre y lo de los modulos, por momento', () => {
  const stages = ['first', 'second'] as const;
  type Stage = (typeof stages)[number];
  const step = (id: string, stage: Stage) => ({ id, stage });

  it('por momento; en cada uno, los de siempre y luego los de los modulos, en su orden', () => {
    const always = [step('a2', 'second'), step('a1', 'first')];
    const fromModules = [step('m2', 'second'), step('m1', 'first')];
    expect(inStageOrder(stages, always, fromModules).map((entry) => entry.id)).toEqual(['a1', 'm1', 'a2', 'm2']);
  });

  it('un momento que no existe es un error, no el primer sitio', () => {
    const broken = { id: 'lost', stage: 'third' as Stage };
    expect(() => inStageOrder(stages, [], [broken])).toThrow(/lost/);
  });
});
