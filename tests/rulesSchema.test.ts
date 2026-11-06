import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultContent } from '@core/content/default';
import { RULE_NAMES, RULE_SCHEMA, isValidRule, isValidRules } from '@core/rulesSchema';

/** Lo que dice rules.schema.json (para los editores) de cada regla. */
interface JsonRule {
  type: string | string[];
  minimum?: number;
  maximum?: number;
}

const jsonRules = (): Record<string, JsonRule> =>
  (
    JSON.parse(readFileSync('src/core/content/rules.schema.json', 'utf8')) as {
      properties: { defaults: { properties: Record<string, JsonRule> } };
    }
  ).properties.defaults.properties;

describe('RULE_SCHEMA: una sola descripcion de las reglas validas', () => {
  it('las reglas por defecto del juego la cumplen', () => {
    expect(isValidRules(defaultContent().defaultRules)).toBe(true);
  });

  it('rules.schema.json dice lo mismo, regla a regla', () => {
    const json = jsonRules();
    expect(Object.keys(json).sort()).toEqual([...RULE_NAMES].sort());
    for (const rule of RULE_NAMES) {
      const spec = RULE_SCHEMA[rule];
      const written = json[rule]!;
      if (spec.kind === 'switch') {
        expect(written.type, rule).toBe('boolean');
        continue;
      }
      const type = spec.integer ? 'integer' : 'number';
      expect(written.type, rule).toEqual(spec.nullable ? [type, 'null'] : type);
      expect([written.minimum, written.maximum], rule).toEqual([spec.min, spec.max]);
    }
  });

  it('enteros, intervalos y null solo donde se puede', () => {
    expect(isValidRule(RULE_SCHEMA.maxUnits, 30)).toBe(true);
    expect(isValidRule(RULE_SCHEMA.maxUnits, 0)).toBe(false);
    expect(isValidRule(RULE_SCHEMA.maxUnits, 2.5)).toBe(false);
    expect(isValidRule(RULE_SCHEMA.dayLimit, null)).toBe(true);
    expect(isValidRule(RULE_SCHEMA.maxUnits, null)).toBe(false);
    expect(isValidRule(RULE_SCHEMA.fog, 1)).toBe(false);
    expect(isValidRules({ ...defaultContent().defaultRules, upkeep: 2 })).toBe(false);
  });
});
