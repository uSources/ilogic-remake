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

export function validateRules(r: RulesFile, check: Checker): void {
  const s = check.scope('rules.json');
  const d = (r?.defaults ?? {}) as unknown as Record<string, unknown>;
  for (const [k, kind] of Object.entries<Kind>(RULE_KINDS)) {
    const v = d[k];
    const f = `defaults.${k}`;
    if (kind === 'bool') s.bool(f, v);
    else if (kind === 'int') s.num(f, v, { min: 0, int: true });
    else if (kind === 'number') s.num(f, v, { min: 0 });
    else if (kind === 'fraction') s.num(f, v, { min: 0, max: 1 });
    else if (v !== null)
      s.num(`${f} (o null)`, v, kind === 'days' || kind === 'points' ? { min: 1, max: 1e4, int: true } : { min: 0, max: 1 });
  }
  for (const k of Object.keys(d)) s.expect(k in RULE_KINDS, `regla desconocida "${k}"`);
  s.num('maxFunds', r?.maxFunds, { min: 1, int: true });
}
