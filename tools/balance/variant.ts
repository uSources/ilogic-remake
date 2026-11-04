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
 * Una variante no cambia el contenido en uso (esta congelado): `buildVariant` construye otro, con sus
 * reglas, y runner.ts lo juega en hilos que cargan el nucleo con ese contenido.
 */
import { DEFAULT_RULES } from '@core/data';
import { MOVEMENTS, TERRAIN_NAMES, type GameContent } from '@core/content';
import { ACTIVE_CONTENT } from '@core/content/active';
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

function index(key: string, names: readonly string[] | null, length: number): number[] {
  if (key === '*') return Array.from({ length }, (_, i) => i);
  if (/^\d+$/.test(key)) return [Number(key)];
  const i = names?.indexOf(key) ?? -1;
  if (i < 0) throw new Error(`Nombre desconocido "${key}" (validos: ${names?.join(', ')})`);
  return [i];
}

function applyValue(old: unknown, v: number | string | boolean | null): unknown {
  if (typeof v === 'string' && typeof old === 'number') {
    const m = v.match(/^([x*+-])\s*(-?\d*\.?\d+)$/);
    if (!m) throw new Error(`Valor "${v}" no valido: usa un numero, "x1.1", "+500" o "-0.05"`);
    const n = Number(m[2]);
    const out = m[1] === 'x' || m[1] === '*' ? old * n : m[1] === '+' ? old + n : old - n;
    // Precios e ingresos: enteros redondeados a 100.
    return Number.isInteger(old) && Math.abs(old) >= 100 ? Math.round(out / 100) * 100 : Math.round(out * 1e6) / 1e6;
  }
  return v;
}

/** Resuelve "UNIT.cost.Tank" en [contenedor, clave] dentro de `tables` (puede haber varias con "*"). */
function targets(content: GameContent, tables: Record<string, Table>, path: string): Slot[] {
  const [tableName, ...rest] = path.split('.');
  const table = tables[tableName!];
  if (!table) throw new Error(`Tabla desconocida "${tableName}" (validas: ${Object.keys(tables).join(', ')})`);
  let level: Slot[] = [];
  // Primer nivel: en POWER es la fila (unidad); en el resto, el campo.
  let current: unknown[] = [table];
  for (let d = 0; d < rest.length; d++) {
    const key = rest[d]!;
    const next: unknown[] = [];
    level = [];
    for (const c of current) {
      if (Array.isArray(c)) {
        for (const i of index(key, namesFor(content, tableName!, d), c.length)) {
          level.push([c as unknown as Record<number, unknown>, i]);
          next.push(c[i]);
        }
      } else if (c && typeof c === 'object') {
        if (!(key in c)) throw new Error(`"${key}" no existe en ${tableName}`);
        level.push([c as Record<string, unknown>, key]);
        next.push((c as Record<string, unknown>)[key]);
      } else throw new Error(`Ruta demasiado larga: ${path}`);
    }
    current = next;
  }
  if (!level.length) throw new Error(`Ruta incompleta: ${path}`);
  for (const [container, key] of level)
    if (typeof container[key] === 'object' && container[key] !== null)
      throw new Error(`"${path}" apunta a una tabla entera; indica la casilla`);
  return level;
}

/**
 * Construye el contenido y las reglas de una variante a partir de `base` (el contenido en uso) y de
 * las reglas de siempre, sin tocar ninguno de los dos.
 */
export function buildVariant(v: Variant, base: GameContent = ACTIVE_CONTENT): VariantSetup {
  const content = structuredClone(base);
  const rules: RulesConfig = { ...DEFAULT_RULES };
  const tables = editableTables(content, rules);
  const changes: VariantChange[] = [];
  for (const [path, value] of Object.entries(v.set ?? {})) {
    for (const [container, key] of targets(content, tables, path)) {
      const from = container[key];
      const to = applyValue(from, value);
      if (typeof from !== typeof to && from !== null && to !== null) throw new Error(`"${path}": se esperaba ${typeof from}`);
      container[key] = to;
      changes.push({ path: `${path}${path.includes('*') ? `[${key}]` : ''}`, from, to });
    }
  }
  return { name: v.name, content, rules, changes };
}

export const BASELINE: Variant = { name: 'actual' };
