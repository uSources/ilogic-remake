/** Reglas por defecto de una partida (rules.json). */
import type { RulesConfig } from '../model';
import { type Checker } from './check';
import { isValidRule, ruleRequirement, RULE_NAMES, RULE_SCHEMA } from '../rulesSchema';

export interface RulesFile {
  defaults: RulesConfig;
  maxFunds: number;
}

export function validateRules(file: RulesFile, check: Checker): void {
  const scope = check.scope('rules.json');
  const defaults = (file?.defaults ?? {}) as unknown as Record<string, unknown>;
  for (const rule of RULE_NAMES) {
    const spec = RULE_SCHEMA[rule];
    scope.expect(isValidRule(spec, defaults[rule]), `defaults.${rule} tiene que ser ${ruleRequirement(spec)}`);
  }
  for (const rule of Object.keys(defaults)) scope.expect(rule in RULE_SCHEMA, `regla desconocida "${rule}"`);
  scope.num('maxFunds', file?.maxFunds, { min: 1, int: true });
}
