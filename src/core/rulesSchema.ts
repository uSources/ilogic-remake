/**
 * Que valores puede tener cada regla de una partida (`MatchSettings`): la unica descripcion de las
 * reglas validas. La usan el contenido (rules.json, al cargarlo) y las partidas guardadas (al
 * leerlas), y rules.schema.json la copia para los editores (lo comprueba un test).
 */
import type { MatchSettings } from './model';
import { isObject } from './util/validation';

/** Una regla: interruptor, o numero en un intervalo (entero o no, y quiza null = "sin"). */
export type RuleSpec =
  | { readonly kind: 'switch' }
  | { readonly kind: 'number'; readonly min: number; readonly max: number; readonly integer: boolean; readonly nullable: boolean };

const SWITCH: RuleSpec = { kind: 'switch' };
/** Un entero entre `min` y `max`. */
const count = (min: number, max: number): RuleSpec => ({ kind: 'number', min, max, integer: true, nullable: false });
/** Un numero (con decimales) entre `min` y `max`. */
const amount = (min: number, max: number): RuleSpec => ({ kind: 'number', min, max, integer: false, nullable: false });
/** Un tanto por uno (0..1). */
const FRACTION = amount(0, 1);
/** La misma regla, o null ("sin": sin limite, sin tirada propia...). */
const orNull = (spec: RuleSpec): RuleSpec => (spec.kind === 'number' ? { ...spec, nullable: true } : spec);

/**
 * Cada regla con sus valores validos. Los topes son de cordura (mas alla, el fichero esta roto o la
 * partida no se puede jugar), no de equilibrio.
 */
export const RULE_SCHEMA: { readonly [Rule in keyof MatchSettings]: RuleSpec } = {
  initialFunds: count(0, 1e9),
  maxUnits: count(1, 200),
  commandPoints: orNull(count(1, 10000)),
  upkeep: FRACTION,
  counterattack: SWITCH,
  damageSpread: orNull(FRACTION),
  capturePoints: count(1, 1000),
  hqCapturePoints: count(1, 1000),
  incomeScale: amount(0, 10),
  fog: SWITCH,
  dayLimit: orNull(count(1, 10000)),
  veterancy: SWITCH,
  vetBonus: FRACTION,
  bounty: FRACTION,
  flankBonus: FRACTION,
  noHealUnderFire: SWITCH,
  passAllies: SWITCH,
  ambush: SWITCH,
  forestHides: SWITCH,
  terrainCost: SWITCH,
  weather: SWITCH,
  abilities: SWITCH,
  controlPoints: count(0, 6),
  controlIncome: count(0, 1e6),
  controlRadius: count(0, 3),
};

/** Los nombres de todas las reglas. */
export const RULE_NAMES = Object.keys(RULE_SCHEMA) as readonly (keyof MatchSettings)[];

/** El valor vale para una regla asi. */
export function isValidRule(spec: RuleSpec, value: unknown): boolean {
  if (spec.kind === 'switch') return typeof value === 'boolean';
  if (value === null) return spec.nullable;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < spec.min || value > spec.max) return false;
  return !spec.integer || Number.isInteger(value);
}

/** Como tiene que ser una regla asi, en palabras (para los errores del contenido). */
export function ruleRequirement(spec: RuleSpec): string {
  if (spec.kind === 'switch') return 'true o false';
  const kind = spec.integer ? 'un entero' : 'un numero';
  return `${kind} entre ${spec.min} y ${spec.max}${spec.nullable ? ' (o null)' : ''}`;
}

/** Son unas reglas completas y validas (todas las de RULE_SCHEMA, con su valor bien). */
export function isValidRules(value: unknown): value is MatchSettings {
  return isObject(value) && RULE_NAMES.every((rule) => isValidRule(RULE_SCHEMA[rule], value[rule]));
}
