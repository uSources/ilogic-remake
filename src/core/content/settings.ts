/** Reglas por defecto de una partida (settings.json). */
import type { MatchSettings } from '../model';
import { type Checker } from './check';
import { isValidSetting, settingRequirement, SETTING_NAMES, SETTINGS_SCHEMA } from '../settingsSchema';

export interface SettingsFile {
  defaults: MatchSettings;
  maxFunds: number;
}

export function validateSettings(file: SettingsFile, check: Checker): void {
  const scope = check.scope('settings.json');
  const defaults = (file?.defaults ?? {}) as unknown as Record<string, unknown>;
  for (const rule of SETTING_NAMES) {
    const spec = SETTINGS_SCHEMA[rule];
    scope.expect(isValidSetting(spec, defaults[rule]), `defaults.${rule} tiene que ser ${settingRequirement(spec)}`);
  }
  for (const rule of Object.keys(defaults)) scope.expect(rule in SETTINGS_SCHEMA, `regla desconocida "${rule}"`);
  scope.num('maxFunds', file?.maxFunds, { min: 1, int: true });
}
