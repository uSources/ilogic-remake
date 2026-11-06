import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultContent } from '@core/content/default';
import { SETTING_NAMES, SETTINGS_SCHEMA, isValidSetting, isValidSettings } from '@core/settingsSchema';

/** Lo que dice settings.schema.json (para los editores) de cada regla. */
interface JsonSetting {
  type: string | string[];
  minimum?: number;
  maximum?: number;
  enum?: string[];
}

const jsonSettings = (): Record<string, JsonSetting> =>
  (
    JSON.parse(readFileSync('src/core/content/settings.schema.json', 'utf8')) as {
      properties: { defaults: { properties: Record<string, JsonSetting> } };
    }
  ).properties.defaults.properties;

describe('SETTINGS_SCHEMA: una sola descripcion de las reglas validas', () => {
  it('las reglas por defecto del juego la cumplen', () => {
    expect(isValidSettings(defaultContent().defaultSettings)).toBe(true);
  });

  it('settings.schema.json dice lo mismo, regla a regla', () => {
    const json = jsonSettings();
    expect(Object.keys(json).sort()).toEqual([...SETTING_NAMES].sort());
    for (const rule of SETTING_NAMES) {
      const spec = SETTINGS_SCHEMA[rule];
      const written = json[rule]!;
      if (spec.kind === 'switch') {
        expect(written.type, rule).toBe('boolean');
        continue;
      }
      if (spec.kind === 'choice') {
        expect([written.type, written.enum], rule).toEqual(['string', spec.options]);
        continue;
      }
      const type = spec.integer ? 'integer' : 'number';
      expect(written.type, rule).toEqual(spec.nullable ? [type, 'null'] : type);
      expect([written.minimum, written.maximum], rule).toEqual([spec.min, spec.max]);
    }
  });

  it('enteros, intervalos y null solo donde se puede', () => {
    expect(isValidSetting(SETTINGS_SCHEMA.maxUnits, 30)).toBe(true);
    expect(isValidSetting(SETTINGS_SCHEMA.maxUnits, 0)).toBe(false);
    expect(isValidSetting(SETTINGS_SCHEMA.maxUnits, 2.5)).toBe(false);
    expect(isValidSetting(SETTINGS_SCHEMA.dayLimit, null)).toBe(true);
    expect(isValidSetting(SETTINGS_SCHEMA.maxUnits, null)).toBe(false);
    expect(isValidSetting(SETTINGS_SCHEMA.fog, 1)).toBe(false);
    expect(isValidSettings({ ...defaultContent().defaultSettings, upkeep: 2 })).toBe(false);
    expect(isValidSetting(SETTINGS_SCHEMA.damageModel, 'shotByShot')).toBe(true);
    expect(isValidSetting(SETTINGS_SCHEMA.damageModel, 'dados')).toBe(false);
  });
});
