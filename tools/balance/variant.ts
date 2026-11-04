/**
 * Variantes de equilibrio: cambios a las tablas de datos y reglas, descritos en JSON.
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
 *     "RULES.counterattack": true
 *   }
 * }
 *
 * Tablas: UNIT, POWER, BUILDING, TERRAIN, MOVE_COST ("MOVE_COST.vehicle.Woods"), RULES, AI. Las filas/columnas se pueden
 * nombrar con los nombres internos (UNIT_NAMES, BUILDING_NAMES, TERRAIN_NAMES) o con su indice.
 *
 * Una variante no cambia el contenido del juego (esta congelado): `buildVariant` construye otro, con
 * sus reglas, y runner.ts se lo pasa a las partidas que juega en hilos.
 */
import { rulesWith } from '@core/data';
import { MOVEMENTS, TERRAIN_NAMES, type GameContent } from '@core/content';
import { defaultContent } from '@core/content/default';
import { deepFreeze } from '@core/util/freeze';
import type { RulesConfig } from '@core/model';

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

/** Una variante lista para jugar: su contenido (otro, no el de siempre), sus reglas y lo que cambia. */
export interface VariantSetup {
  name: string;
  content: GameContent;
  rules: RulesConfig;
  changes: VariantChange[];
}

type Table = Record<string, unknown> | unknown[];
type Slot = [Record<string | number, unknown>, string | number];

/** Las tablas que se pueden cambiar, sobre una copia del contenido y de las reglas. */
function editableTables(content: GameContent, rules: RulesConfig): Record<string, Table> {
  const tables = content.tables;
  return {
    UNIT: tables.UNIT,
    POWER: tables.POWER as unknown as unknown[],
    BUILDING: tables.BUILDING,
    TERRAIN: tables.TERRAIN,
    AI: tables.AI,
    MOVE_COST: tables.MOVE_COST as unknown as unknown[],
    RULES: rules as unknown as Record<string, unknown>,
  };
}

/** Que nombres valen para los indices de cada tabla/campo. */
function namesFor(content: GameContent, table: string, depth: number): readonly string[] | null {
  if (table === 'UNIT' || table === 'POWER') return content.tables.UNIT_NAMES;
  if (table === 'BUILDING') return content.tables.BUILDING_NAMES;
  if (table === 'MOVE_COST') return depth === 0 ? MOVEMENTS : TERRAIN_NAMES;
  if (table === 'TERRAIN') return TERRAIN_NAMES;
  return null;
}

/** Los indices que nombra `key` en una lista de `length` filas: "*" (todas), un numero o un nombre. */
function indicesFor(key: string, names: readonly string[] | null, length: number): number[] {
  if (key === '*') return Array.from({ length }, (_, index) => index);
  if (/^\d+$/.test(key)) return [Number(key)];
  const index = names?.indexOf(key) ?? -1;
  if (index < 0) throw new Error(`Nombre desconocido "${key}" (validos: ${names?.join(', ')})`);
  return [index];
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
function newValue(old: unknown, value: number | string | boolean | null): unknown {
  if (typeof value !== 'string' || typeof old !== 'number') return value;
  return roundLike(old, applyChange(old, value));
}

/** Las casillas de un nivel de la ruta: `key` dentro de cada contenedor del nivel anterior. */
function slotsOneLevelDown(containers: unknown[], key: string, names: readonly string[] | null, tableName: string): Slot[] {
  return containers.flatMap((container): Slot[] => {
    if (Array.isArray(container)) {
      return indicesFor(key, names, container.length).map((index): Slot => [container as unknown as Record<number, unknown>, index]);
    }
    if (container && typeof container === 'object') {
      if (!(key in container)) throw new Error(`"${key}" no existe en ${tableName}`);
      return [[container as Record<string, unknown>, key]];
    }
    throw new Error(`Ruta demasiado larga: ${tableName}.${key}`);
  });
}

/** Resuelve "UNIT.cost.Tank" en las casillas [contenedor, clave] de `tables` (puede haber varias con "*"). */
function targets(content: GameContent, tables: Record<string, Table>, path: string): Slot[] {
  const [tableName = '', ...keys] = path.split('.');
  const table = tables[tableName];
  if (!table) throw new Error(`Tabla desconocida "${tableName}" (validas: ${Object.keys(tables).join(', ')})`);
  // Primer nivel: en POWER es la fila (unidad); en el resto, el campo.
  let slots: Slot[] = [];
  let containers: unknown[] = [table];
  keys.forEach((key, depth) => {
    slots = slotsOneLevelDown(containers, key, namesFor(content, tableName, depth), tableName);
    containers = slots.map(([container, slotKey]) => container[slotKey]);
  });
  if (!slots.length) throw new Error(`Ruta incompleta: ${path}`);
  if (containers.some((value) => typeof value === 'object' && value !== null))
    throw new Error(`"${path}" apunta a una tabla entera; indica la casilla`);
  return slots;
}

/** Cambia las casillas de `path` y apunta cada cambio en `changes`. */
function applySetting(
  content: GameContent,
  tables: Record<string, Table>,
  path: string,
  value: number | string | boolean | null,
  changes: VariantChange[],
): void {
  for (const [container, key] of targets(content, tables, path)) {
    const from = container[key];
    const to = newValue(from, value);
    if (typeof from !== typeof to && from !== null && to !== null) throw new Error(`"${path}": se esperaba ${typeof from}`);
    container[key] = to;
    changes.push({ path: `${path}${path.includes('*') ? `[${key}]` : ''}`, from, to });
  }
}

/**
 * Construye el contenido y las reglas de una variante a partir de `base` (el contenido del juego si
 * no se dice otro) y de las reglas de siempre, sin tocar ninguno de los dos. El contenido sale
 * congelado, como el del juego: se juega tal cual.
 */
export function buildVariant(variant: Variant, base: GameContent = defaultContent()): VariantSetup {
  const content = structuredClone(base);
  const rules: RulesConfig = rulesWith();
  const tables = editableTables(content, rules);
  const changes: VariantChange[] = [];
  for (const [path, value] of Object.entries(variant.set ?? {})) applySetting(content, tables, path, value, changes);
  return { name: variant.name, content: deepFreeze(content), rules: Object.freeze(rules), changes };
}

export const BASELINE: Variant = { name: 'actual' };
