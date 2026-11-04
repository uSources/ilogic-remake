/** Reglas por defecto de una partida (rules.json). */
import type { RulesConfig } from '../model';
import { type Checker } from './check';

export interface RulesFile {
  defaults: RulesConfig;
  maxFunds: number;
}

type Kind = 'int' | 'number' | 'bool' | 'days' | 'spread' | 'fraction' | 'points';
/** Tipo de cada regla (las claves tienen que ser exactamente las de RulesConfig). */
const RULE_KINDS: Record<keyof RulesConfig, Kind> = {
  initialFunds: 'int',
  maxUnits: 'int',
  commandPoints: 'points',
  upkeep: 'fraction',
  counterattack: 'bool',
  damageSpread: 'spread',
  capturePoints: 'int',
  hqCapturePoints: 'int',
  incomeScale: 'number',
  fog: 'bool',
  dayLimit: 'days',
  veterancy: 'bool',
  vetBonus: 'fraction',
  bounty: 'fraction',
  flankBonus: 'fraction',
  noHealUnderFire: 'bool',
  passAllies: 'bool',
  ambush: 'bool',
  forestHides: 'bool',
  terrainCost: 'bool',
  weather: 'bool',
  abilities: 'bool',
  controlPoints: 'int',
  controlIncome: 'int',
  controlRadius: 'int',
};

export function validateRules(file: RulesFile, check: Checker): void {
  const scope = check.scope('rules.json');
  const defaults = (file?.defaults ?? {}) as unknown as Record<string, unknown>;
  for (const [rule, kind] of Object.entries<Kind>(RULE_KINDS)) {
    const value = defaults[rule];
    const field = `defaults.${rule}`;
    if (kind === 'bool') scope.bool(field, value);
    else if (kind === 'int') scope.num(field, value, { min: 0, int: true });
    else if (kind === 'number') scope.num(field, value, { min: 0 });
    else if (kind === 'fraction') scope.num(field, value, { min: 0, max: 1 });
    else if (value !== null)
      scope.num(`${field} (o null)`, value, kind === 'days' || kind === 'points' ? { min: 1, max: 1e4, int: true } : { min: 0, max: 1 });
  }
  for (const rule of Object.keys(defaults)) scope.expect(rule in RULE_KINDS, `regla desconocida "${rule}"`);
  scope.num('maxFunds', file?.maxFunds, { min: 1, int: true });
}
