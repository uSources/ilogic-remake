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
 * Tablas: UNIT, POWER, BUILDING, TERRAIN, RULES, AI. Las filas/columnas se pueden
 * nombrar con los nombres internos (UNIT_NAMES, BUILDING_NAMES, TERRAIN_NAMES) o con su indice.
 */
import { CLASSIC_RULES, MODERN_RULES, useRules, AI, BUILDING, BUILDING_NAMES, POWER, RULES, TERRAIN, TERRAIN_NAMES, UNIT, UNIT_NAMES } from '../../src/core/data';

export interface Variant {
  name: string;
  /** Reglas de partida: 'modern' (por defecto, las del remake) o 'classic' (las de 2013). */
  rules?: 'modern' | 'classic';
  notes?: string;
  set?: Record<string, number | string | boolean | null>;
}

type Table = Record<string, unknown> | unknown[];
const TABLES: Record<string, Table> = { UNIT, POWER: POWER as unknown as unknown[], BUILDING, TERRAIN, RULES: RULES as unknown as Record<string, unknown>, AI };

/** Que nombres valen para los indices de cada tabla/campo. */
function namesFor(table: string, depth: number): readonly string[] | null {
  if (table === 'UNIT' || table === 'POWER') return UNIT_NAMES;
  if (table === 'BUILDING') return BUILDING_NAMES;
  if (table === 'TERRAIN') return depth === 1 ? TERRAIN_NAMES : TERRAIN_NAMES;
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

/** Resuelve "UNIT.cost.Tank" en [contenedor, clave] (puede haber varias con "*"). */
function targets(path: string): [Record<string | number, unknown>, string | number][] {
  const [tableName, ...rest] = path.split('.');
  const table = TABLES[tableName!];
  if (!table) throw new Error(`Tabla desconocida "${tableName}" (validas: ${Object.keys(TABLES).join(', ')})`);
  let level: [Record<string | number, unknown>, string | number][] = [];
  // Primer nivel: en POWER es la fila (unidad); en el resto, el campo.
  let current: unknown[] = [table];
  for (let d = 0; d < rest.length; d++) {
    const key = rest[d]!;
    const next: unknown[] = [];
    level = [];
    for (const c of current) {
      if (Array.isArray(c)) {
        const names = tableName === 'TERRAIN' && d === 2 ? TERRAIN_NAMES : namesFor(tableName!, d);
        for (const i of index(key, names, c.length)) {
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
  for (const [, , v] of level.map(([c, k]) => [c, k, c[k]] as const))
    if (typeof v === 'object' && v !== null) throw new Error(`"${path}" apunta a una tabla entera; indica la casilla`);
  return level;
}

/** Copia profunda de todas las tablas, para restaurarlas despues. */
export function snapshot(): string {
  return JSON.stringify(TABLES);
}

export function restore(snap: string): void {
  const data = JSON.parse(snap) as Record<string, unknown>;
  const copyInto = (dst: Record<string | number, unknown>, src: Record<string | number, unknown>) => {
    for (const k of Object.keys(src)) {
      const v = src[k];
      if (v && typeof v === 'object' && dst[k] && typeof dst[k] === 'object') copyInto(dst[k] as Record<string, unknown>, v as Record<string, unknown>);
      else dst[k] = v;
    }
  };
  for (const name of Object.keys(TABLES)) copyInto(TABLES[name] as Record<string, unknown>, data[name] as Record<string, unknown>);
}

/** Aplica una variante a las tablas (modifica los datos globales del juego). Devuelve los cambios hechos. */
export function applyVariant(v: Variant): { path: string; from: unknown; to: unknown }[] {
  useRules(v.rules === 'classic' ? CLASSIC_RULES : MODERN_RULES);
  const changes: { path: string; from: unknown; to: unknown }[] = [];
  for (const [path, value] of Object.entries(v.set ?? {})) {
    for (const [container, key] of targets(path)) {
      const from = container[key];
      const to = applyValue(from, value);
      if (typeof from !== typeof to && from !== null && to !== null) throw new Error(`"${path}": se esperaba ${typeof from}`);
      container[key] = to;
      changes.push({ path: `${path}${path.includes('*') ? `[${key}]` : ''}`, from, to });
    }
  }
  return changes;
}

export const BASELINE: Variant = { name: 'actual' };
