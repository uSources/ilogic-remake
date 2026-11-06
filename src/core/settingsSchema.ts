/**
 * Que valores puede tener cada regla de una partida (`MatchSettings`): la unica descripcion de las
 * reglas validas. La usan el contenido (settings.json, al cargarlo) y las partidas guardadas (al
 * leerlas), y settings.schema.json la copia para los editores (lo comprueba un test).
 */
import type { MatchSettings } from './model';
import { isObject } from './util/validation';
import { DAMAGE_MODEL_IDS } from './rules/damage';

/** Un ajuste: interruptor, numero en un intervalo (entero o no, y quiza null = "sin") o uno de unos nombres. */
export type SettingSpec =
  | { readonly kind: 'switch' }
  | { readonly kind: 'number'; readonly min: number; readonly max: number; readonly integer: boolean; readonly nullable: boolean }
  | { readonly kind: 'choice'; readonly options: readonly string[] };

const SWITCH: SettingSpec = { kind: 'switch' };
/** Un entero entre `min` y `max`. */
const count = (min: number, max: number): SettingSpec => ({ kind: 'number', min, max, integer: true, nullable: false });
/** Un numero (con decimales) entre `min` y `max`. */
const amount = (min: number, max: number): SettingSpec => ({ kind: 'number', min, max, integer: false, nullable: false });
/** Un tanto por uno (0..1). */
const FRACTION = amount(0, 1);
/** Uno de estos nombres (el modelo de daño...). */
const oneOf = (options: readonly string[]): SettingSpec => ({ kind: 'choice', options });
/** La misma regla, o null ("sin": sin limite, sin tirada propia...). */
const orNull = (spec: SettingSpec): SettingSpec => (spec.kind === 'number' ? { ...spec, nullable: true } : spec);

/**
 * Cada regla con sus valores validos. Los topes son de cordura (mas alla, el fichero esta roto o la
 * partida no se puede jugar), no de equilibrio.
 */
export const SETTINGS_SCHEMA: { readonly [Rule in keyof MatchSettings]: SettingSpec } = {
  initialFunds: count(0, 1e9),
  maxUnits: count(1, 200),
  commandPoints: orNull(count(1, 10000)),
  upkeep: FRACTION,
  counterattack: SWITCH,
  damageModel: oneOf(DAMAGE_MODEL_IDS),
  damageSpread: FRACTION,
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
export const SETTING_NAMES = Object.keys(SETTINGS_SCHEMA) as readonly (keyof MatchSettings)[];

/** El valor vale para una regla asi. */
export function isValidSetting(spec: SettingSpec, value: unknown): boolean {
  if (spec.kind === 'switch') return typeof value === 'boolean';
  if (spec.kind === 'choice') return typeof value === 'string' && spec.options.includes(value);
  if (value === null) return spec.nullable;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < spec.min || value > spec.max) return false;
  return !spec.integer || Number.isInteger(value);
}

/** Como tiene que ser una regla asi, en palabras (para los errores del contenido). */
export function settingRequirement(spec: SettingSpec): string {
  if (spec.kind === 'switch') return 'true o false';
  if (spec.kind === 'choice') return `uno de ${spec.options.join(', ')}`;
  const kind = spec.integer ? 'un entero' : 'un numero';
  return `${kind} entre ${spec.min} y ${spec.max}${spec.nullable ? ' (o null)' : ''}`;
}

/** Son unas reglas completas y validas (todas las de SETTINGS_SCHEMA, con su valor bien). */
export function isValidSettings(value: unknown): value is MatchSettings {
  return isObject(value) && SETTING_NAMES.every((rule) => isValidSetting(SETTINGS_SCHEMA[rule], value[rule]));
}
