/**
 * Variantes de equilibrio: cambios al contenido (los ficheros de src/core/content) descritos en JSON.
 *
 * {
 *   "name": "tanques-baratos",
 *   "notes": "por que se prueba",
 *   "set": {
 *     "UNIT.cost.Tank": 10000,          // valor fijo (por nombre o indice)
 *     "UNIT.cost.*": "x1.1",            // multiplicar todas
 *     "HIT_CHANCE.Tank.Soldier": "+0.05", // sumar
 *     "BUILDING.earning.City": 800,
 *     "TERRAIN.protection.Woods": 0.8,
 *     "MOVE_COST.vehicle.Woods": 3,
 *     "SETTINGS.counterattack": true,
 *     "AI.KILLBONUS": 60
 *   }
 * }
 *
 * Cada ruta nombra un campo de los ficheros (TABLE_PATHS), con el mismo nombre que en el JSON:
 * `UNIT.cost.Tank` es el `cost` del Tank en units.json, `HIT_CHANCE.Tank.Soldier` su
 * `attack.hitChance.Soldier`, `MOVE_COST.vehicle.Woods` el `movement.vehicle` de Woods en
 * terrain.json, `SETTINGS.fog` `defaults.fog` en settings.json... Las filas se nombran por id, por indice o
 * con `*` (todas).
 *
 * Una variante no cambia el contenido del juego: `buildVariant` aplica los cambios a una copia de los
 * ficheros y la carga con `loadContent`, que la valida (un valor imposible para antes de jugar),
 * resuelve todos los tipos y la congela. Sus reglas son las de ese contenido:
 * `settingsWith(variante.content)`.
 */
import { loadContent, MOVEMENTS, type Content, type GameContent } from '@core/content';
import { mutableCopy } from '@core/util/freeze';

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

/** Campos de cada unidad que se pueden cambiar como `UNIT.<campo>.<unidad>` (los de units.json). */
const UNIT_FIELDS = ['cost', 'command', 'move', 'vision'];
const BUILDING_FIELDS = ['earning', 'heals', 'protection', 'vision'];
const TERRAIN_FIELDS = ['protection', 'buildable', 'water'];

function fieldOf(fields: readonly string[], name: string | undefined, table: string): string {
  if (name === undefined || !fields.includes(name)) throw new Error(`"${name}" no existe en ${table} (validos: ${fields.join(', ')})`);
  return name;
}

const slotsOf = (items: readonly { id: string }[], key: (item: { id: string }) => Slot): Slot[] => items.map(key);
const asHolder = (value: unknown): Holder => value as Holder;

/** Una tabla de las rutas: cuantas claves lleva, que casillas de los ficheros nombra y cuanto vale una que no esta. */
interface TablePath {
  /** Claves despues del nombre de la tabla ("UNIT.cost.Tank": 2). */
  readonly keys: number;
  slots(files: Content, keys: string[]): Slot[];
  /** Lo que vale una casilla que no esta en el fichero (un acierto que no esta es 0). */
  readonly missingValue?: number;
}

const TABLE_PATHS: Record<string, TablePath> = {
  UNIT: {
    keys: 2,
    slots: (files, [field, unitKey = '']) => {
      const name = fieldOf(UNIT_FIELDS, field, 'UNIT');
      return slotsOf(pick(files.units, unitKey, 'unidad'), (unit) => ({ holder: asHolder(unit), key: name, label: unit.id }));
    },
  },
  HIT_CHANCE: {
    keys: 2,
    missingValue: 0,
    slots: (files, [attackerKey = '', defenderKey = '']) =>
      pick(files.units, attackerKey, 'unidad').flatMap((attacker) => {
        if (!attacker.attack) throw new Error(`${attacker.id} no ataca: no tiene HIT_CHANCE`);
        const hitChance = asHolder(attacker.attack.hitChance);
        return pick(files.units, defenderKey, 'unidad').map((defender) => ({
          holder: hitChance,
          key: defender.id,
          label: `${attacker.id}.${defender.id}`,
        }));
      }),
  },
  BUILDING: {
    keys: 2,
    slots: (files, [field, buildingKey = '']) => {
      const name = fieldOf(BUILDING_FIELDS, field, 'BUILDING');
      return slotsOf(pick(files.buildings, buildingKey, 'edificio'), (building) => ({
        holder: asHolder(building),
        key: name,
        label: building.id,
      }));
    },
  },
  TERRAIN: {
    keys: 2,
    slots: (files, [field, terrainKey = '']) => {
      const name = fieldOf(TERRAIN_FIELDS, field, 'TERRAIN');
      return slotsOf(pick(files.terrain, terrainKey, 'terreno'), (terrain) => ({
        holder: asHolder(terrain),
        key: name,
        label: terrain.id,
      }));
    },
  },
  MOVE_COST: {
    keys: 2,
    slots: (files, [movementKey = '', terrainKey = '']) => {
      const movements = movementKey === '*' ? [...MOVEMENTS] : [fieldOf(MOVEMENTS, movementKey, 'MOVE_COST')];
      return pick(files.terrain, terrainKey, 'terreno').flatMap((terrain) =>
        movements.map((movement) => ({ holder: asHolder(terrain.movement), key: movement, label: `${movement}.${terrain.id}` })),
      );
    },
  },
  SETTINGS: {
    keys: 1,
    slots: (files, [setting = '']) => {
      if (!(setting in files.settings.defaults)) throw new Error(`"${setting}" no existe en SETTINGS`);
      return [{ holder: asHolder(files.settings.defaults), key: setting, label: setting }];
    },
  },
  AI: {
    keys: 1,
    slots: (files, [weight = '']) => {
      if (!(weight in files.ai)) throw new Error(`"${weight}" no existe en AI`);
      return [{ holder: files.ai, key: weight, label: weight }];
    },
  },
};

/** La tabla de una ruta ("UNIT.cost.Tank") y las casillas de los ficheros que nombra. */
function resolvePath(files: Content, path: string): { table: TablePath; slots: Slot[] } {
  const [tableName = '', ...keys] = path.split('.');
  const table = TABLE_PATHS[tableName];
  if (!table) throw new Error(`Tabla desconocida "${tableName}" (validas: ${Object.keys(TABLE_PATHS).join(', ')})`);
  if (keys.length < table.keys) throw new Error(`"${path}" apunta a una tabla entera; indica la casilla`);
  if (keys.length > table.keys) throw new Error(`Ruta demasiado larga: ${path}`);
  return { table, slots: table.slots(files, keys) };
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
  const { table, slots } = resolvePath(files, path);
  for (const { holder, key, label } of slots) {
    const from = holder[key] ?? table.missingValue;
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
  const files = mutableCopy<Content>(base.files);
  const changes: VariantChange[] = [];
  for (const [path, value] of Object.entries(variant.set ?? {})) applySetting(files, path, value, changes);
  return { name: variant.name, content: loadContent(files), changes };
}

export const BASELINE: Variant = { name: 'actual' };
