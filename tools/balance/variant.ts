/**
 * Variantes de equilibrio: cambios al contenido (los ficheros de src/core/content) descritos en JSON.
 *
 * {
 *   "name": "tanques-baratos",
 *   "notes": "por que se prueba",
 *   "set": {
 *     "UNIT.cost.Tank": 10000,          // valor fijo (por nombre o indice)
 *     "UNIT.cost.*": "x1.1",            // multiplicar todas
 *     "POWER.Tank.Soldier": "+0.05",    // sumar
 *     "BUILDING.earning.City": 800,
 *     "TERRAIN.protection.Woods": 0.8,
 *     "MOVE_COST.vehicle.Woods": 3,
 *     "RULES.counterattack": true,
 *     "AI.KILLBONUS": 60
 *   }
 * }
 *
 * Las rutas usan los nombres de las tablas de siempre, pero cada una nombra un campo de los ficheros
 * (FILE_PATHS): `UNIT.cost.Tank` es el `cost` del Tank en units.json, `POWER.Tank.Soldier` su
 * `attack.hitChance.Soldier`, `MOVE_COST.vehicle.Woods` el `movement.vehicle` de Woods en
 * terrain.json, `RULES.fog` `defaults.fog` en rules.json... Las filas se nombran por id, por indice o
 * con `*` (todas).
 *
 * Una variante no cambia el contenido del juego: `buildVariant` aplica los cambios a una copia de los
 * ficheros y la carga con `loadContent`, que la valida (un valor imposible para antes de jugar),
 * reconstruye todas las tablas y la congela. Sus reglas son las de ese contenido:
 * `rulesWith(variante.content)`.
 */
import { loadContent, MOVEMENTS, type Content, type GameContent } from '@core/content';

export interface Variant {
  name: string;
  notes?: string;
  set?: Record<string, number | string | boolean | null>;
}

/** Un valor cambiado por la variante (para el informe). */
export interface VariantChange {
  path: string;
  from: unknown;
  to: unknown;
}

/** Una variante lista para jugar: su contenido (otro, no el de siempre) y lo que cambia. */
export interface VariantSetup {
  name: string;
  content: GameContent;
  changes: VariantChange[];
}

type Value = number | string | boolean | null;
type Holder = Record<string, unknown>;
/** Una casilla de los ficheros: el objeto que la tiene y su clave. */
type Slot = { holder: Holder; key: string; label: string };

/** Los elementos de una lista de los ficheros que nombra `key`: "*" (todos), un indice o un id. */
function pick<T extends { id: string }>(list: readonly T[], key: string, what: string): T[] {
  if (key === '*') return [...list];
  if (/^\d+$/.test(key)) {
    const item = list[Number(key)];
    if (!item) throw new Error(`No hay ${what} numero ${key}`);
    return [item];
  }
  const item = list.find((candidate) => candidate.id === key);
  if (!item) throw new Error(`Nombre desconocido "${key}" (validos: ${list.map((candidate) => candidate.id).join(', ')})`);
  return [item];
}

/** Campos de cada unidad que se pueden cambiar como `UNIT.<campo>.<unidad>`, y su nombre en units.json. */
const UNIT_FIELDS: Record<string, string> = { cost: 'cost', command: 'command', mover: 'move', vision: 'vision' };
const BUILDING_FIELDS = ['earning', 'heals', 'protection', 'vision'];
const TERRAIN_FIELDS: Record<string, string> = { protection: 'protection', canbuild: 'buildable', iswater: 'water' };

function fieldOf(fields: Record<string, string> | string[], name: string | undefined, table: string): string {
  const map = Array.isArray(fields) ? Object.fromEntries(fields.map((field) => [field, field])) : fields;
  const field = name === undefined ? undefined : map[name];
  if (!field) throw new Error(`"${name}" no existe en ${table} (validos: ${Object.keys(map).join(', ')})`);
  return field;
}

const slotsOf = (items: readonly { id: string }[], key: (item: { id: string }) => Slot): Slot[] => items.map(key);
const asHolder = (value: unknown): Holder => value as Holder;

/** Cada tabla de las rutas y que casillas de los ficheros nombra. */
const FILE_PATHS: Record<string, (files: Content, keys: string[]) => Slot[]> = {
  UNIT: (files, [field, unit = '']) => {
    const name = fieldOf(UNIT_FIELDS, field, 'UNIT');
    return slotsOf(pick(files.units, unit, 'unidad'), (u) => ({ holder: asHolder(u), key: name, label: u.id }));
  },
  POWER: (files, [attacker = '', defender = '']) =>
    pick(files.units, attacker, 'unidad').flatMap((unit) => {
      if (!unit.attack) throw new Error(`${unit.id} no ataca: no tiene POWER`);
      const hitChance = unit.attack.hitChance;
      return pick(files.units, defender, 'unidad').map((target) => ({
        holder: asHolder(hitChance),
        key: target.id,
        label: `${unit.id}.${target.id}`,
      }));
    }),
  BUILDING: (files, [field, building = '']) => {
    const name = fieldOf(BUILDING_FIELDS, field, 'BUILDING');
    return slotsOf(pick(files.buildings, building, 'edificio'), (b) => ({ holder: asHolder(b), key: name, label: b.id }));
  },
  TERRAIN: (files, [field, terrain = '']) => {
    const name = fieldOf(TERRAIN_FIELDS, field, 'TERRAIN');
    return slotsOf(pick(files.terrain, terrain, 'terreno'), (t) => ({ holder: asHolder(t), key: name, label: t.id }));
  },
  MOVE_COST: (files, [movement = '', terrain = '']) => {
    const movements = movement === '*' ? [...MOVEMENTS] : [fieldOf([...MOVEMENTS], movement, 'MOVE_COST')];
    return pick(files.terrain, terrain, 'terreno').flatMap((t) =>
      movements.map((m) => ({ holder: asHolder(t.movement), key: m, label: `${m}.${t.id}` })),
    );
  },
  RULES: (files, [rule = '']) => {
    if (!(rule in files.rules.defaults)) throw new Error(`"${rule}" no existe en RULES`);
    return [{ holder: asHolder(files.rules.defaults), key: rule, label: rule }];
  },
  AI: (files, [weight = '']) => {
    if (!(weight in files.ai)) throw new Error(`"${weight}" no existe en AI`);
    return [{ holder: files.ai, key: weight, label: weight }];
  },
};

/** Cuantas claves lleva una ruta de cada tabla despues de su nombre ("UNIT.cost.Tank": 2). */
const KEY_COUNT: Record<string, number> = { UNIT: 2, POWER: 2, BUILDING: 2, TERRAIN: 2, MOVE_COST: 2, RULES: 1, AI: 1 };

/** Las casillas de los ficheros que nombra una ruta ("UNIT.cost.Tank"). */
function slotsFor(files: Content, path: string): Slot[] {
  const [table = '', ...keys] = path.split('.');
  const slots = FILE_PATHS[table];
  if (!slots) throw new Error(`Tabla desconocida "${table}" (validas: ${Object.keys(FILE_PATHS).join(', ')})`);
  if (keys.length < KEY_COUNT[table]!) throw new Error(`"${path}" apunta a una tabla entera; indica la casilla`);
  if (keys.length > KEY_COUNT[table]!) throw new Error(`Ruta demasiado larga: ${path}`);
  return slots(files, keys);
}

/** "x1.1", "+500" o "-0.05" aplicado a `old`. */
function applyChange(old: number, change: string): number {
  const match = change.match(/^([x*+-])\s*(-?\d*\.?\d+)$/);
  if (!match) throw new Error(`Valor "${change}" no valido: usa un numero, "x1.1", "+500" o "-0.05"`);
  const amount = Number(match[2]);
  const operator = match[1];
  if (operator === 'x' || operator === '*') return old * amount;
  return operator === '+' ? old + amount : old - amount;
}

/** Precios e ingresos (enteros de 100 o mas): redondeados a 100; el resto, a 6 decimales. */
function roundLike(old: number, value: number): number {
  const isMoney = Number.isInteger(old) && Math.abs(old) >= 100;
  return isMoney ? Math.round(value / 100) * 100 : Math.round(value * 1e6) / 1e6;
}

/** El valor nuevo de una casilla: el dado, o el cambio relativo ("x1.1"...) si la casilla es un numero. */
function newValue(old: unknown, value: Value): unknown {
  if (typeof value !== 'string' || typeof old !== 'number') return value;
  return roundLike(old, applyChange(old, value));
}

/** Cambia en `files` las casillas de `path` y apunta cada cambio en `changes`. */
function applySetting(files: Content, path: string, value: Value, changes: VariantChange[]): void {
  for (const { holder, key, label } of slotsFor(files, path)) {
    // Un acierto que no esta en el fichero vale 0.
    const from = holder[key] ?? (path.startsWith('POWER.') ? 0 : undefined);
    if (typeof from === 'object' && from !== null) throw new Error(`"${path}" apunta a una tabla entera; indica la casilla`);
    const to = newValue(from, value);
    if (typeof from !== typeof to && from !== null && to !== null) throw new Error(`"${path}": se esperaba ${typeof from}`);
    holder[key] = to;
    changes.push({ path: `${path}${path.includes('*') ? `[${label}]` : ''}`, from, to });
  }
}

/**
 * El contenido de una variante: los cambios sobre una copia de los ficheros de `base` (normalmente
 * `defaultContent()`), cargada con loadContent (valida, reconstruye las tablas y congela). `base` no
 * cambia.
 */
export function buildVariant(variant: Variant, base: GameContent): VariantSetup {
  const files = structuredClone(base.files);
  const changes: VariantChange[] = [];
  for (const [path, value] of Object.entries(variant.set ?? {})) applySetting(files, path, value, changes);
  return { name: variant.name, content: loadContent(files), changes };
}

export const BASELINE: Variant = { name: 'actual' };
