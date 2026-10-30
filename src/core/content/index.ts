/**
 * Contenido del juego en ficheros de configuracion: `units.json` (unidades, con su ataque contra cada
 * otra) y `buildings.json` (edificios). Para añadir o cambiar una unidad se toca el JSON, no el codigo:
 * aqui se valida y se convierte en las tablas por indice que usan las reglas (`UNIT`, `POWER`...,
 * en data.ts).
 *
 * El ORDEN de las listas es el numero de tipo que guardan las partidas: las nuevas van siempre al
 * final, nunca en medio, y no se borran (las partidas guardadas apuntan por numero).
 */
import buildingsFile from './buildings.json';
import unitsFile from './units.json';

/** Tipos de movimiento, en el orden de TERRAIN.canwalk. */
export const MOVEMENTS = ['foot', 'vehicle', 'air', 'amphibious'] as const;
export type Movement = (typeof MOVEMENTS)[number];

export interface Texts {
  es: string;
  en: string;
}

export interface UnitDef {
  /** Nombre interno (en ingles, sin espacios). Las imagenes son u/b_<id>.png, u/r_<id>.png... */
  id: string;
  name: Texts;
  cost: number;
  /** Casillas que puede mover por turno. */
  move: number;
  /** Radio de vision (rombo). */
  vision: number;
  movement: Movement;
  /** Combustible (0 = no usa) y lo que gasta cada ronda sin moverse (aviones). */
  fuel: { max: number; perTurn: number };
  /** Municion (0 = infinita). */
  ammo: number;
  captures: boolean;
  /**
   * null = no ataca. `range`: distancias desde/hasta (1 = casilla de al lado; [2, 5] = artilleria).
   * `hitChance`: probabilidad de acierto de cada punto de vida contra cada unidad (0..1; si no esta, 0).
   */
  attack: { range: [number, number]; hitChance: Record<string, number> } | null;
  transport?: { slots: number; carries: string[] };
  /** Edificios que la fabrican, la reparan, le dan combustible o municion. */
  builtAt: string[];
  repairedAt: string[];
  refueledAt: string[];
  rearmedAt: string[];
  /** Unidades a las que da combustible o municion (Suministros). */
  supplies?: { fuel: string[]; ammo: string[] };
  /** Vida que da a otras unidades al lado (ninguna en el juego original). */
  heals?: Record<string, number>;
  /** Graficos de 2013: prefijo de la imagen segun el terreno ("1_" en agua, "2_" en nieve). */
  classicSprite?: Record<string, string>;
  /** Pistas para la IA. support: no combate (compra como mucho una a la vez). */
  ai?: { support?: boolean };
  /** Comentario libre (diseño, por que tiene estos numeros). */
  notes?: string;
}

export interface BuildingDef {
  id: string;
  name: Texts;
  /** Cuartel general: si lo capturan, se pierde. Exactamente uno. */
  hq?: boolean;
  earning: number;
  /** Vida que cura a las unidades propias que repara. */
  heals: number;
  /** Multiplicador de la probabilidad de acierto contra quien esta encima (menos = mas defensa). */
  protection: number;
  vision: number;
  classicSprite?: Record<string, string>;
  notes?: string;
}

export interface Content {
  units: UnitDef[];
  buildings: BuildingDef[];
}

/** Comprueba el contenido y devuelve todos los errores (vacio si esta bien). */
export function validateContent(c: { units: unknown; buildings: unknown }, terrainNames: readonly string[]): string[] {
  const errs: string[] = [];
  if (!Array.isArray(c.units) || !Array.isArray(c.buildings)) return ['units.json y buildings.json tienen que tener una lista'];
  const units = c.units as UnitDef[];
  const buildings = c.buildings as BuildingDef[];
  const uids = new Set<string>();
  const bids = new Set<string>();
  const isNum = (v: unknown, min: number, max = Infinity, int = false) =>
    typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max && (!int || Number.isInteger(v));
  const texts = (where: string, t: unknown) => {
    const o = t as Partial<Texts> | undefined;
    if (!o || typeof o.es !== 'string' || !o.es || typeof o.en !== 'string' || !o.en) errs.push(`${where}: falta name.es o name.en`);
  };
  for (const [i, b] of buildings.entries()) {
    const w = `edificio ${b?.id ?? `#${i}`}`;
    if (typeof b?.id !== 'string' || !/^\w+$/.test(b.id)) errs.push(`${w}: id no valido`);
    else if (bids.has(b.id)) errs.push(`${w}: id repetido`);
    else bids.add(b.id);
    texts(w, b?.name);
    if (!isNum(b?.earning, 0, 1e6, true)) errs.push(`${w}: earning tiene que ser un entero >= 0`);
    if (!isNum(b?.heals, 0, 100, true)) errs.push(`${w}: heals entre 0 y 100`);
    if (!isNum(b?.protection, 0.05, 1)) errs.push(`${w}: protection entre 0.05 y 1`);
    if (!isNum(b?.vision, 0, 20, true)) errs.push(`${w}: vision entre 0 y 20`);
  }
  if (buildings.filter((b) => b?.hq).length !== 1) errs.push('buildings.json: tiene que haber exactamente un edificio con "hq": true');
  for (const u of units) if (typeof u?.id === 'string') uids.add(u.id);
  const seen = new Set<string>();
  const refs = (w: string, field: string, list: unknown, known: Set<string>) => {
    if (!Array.isArray(list)) return errs.push(`${w}: ${field} tiene que ser una lista`);
    for (const x of list) if (!known.has(x as string)) errs.push(`${w}: ${field} nombra "${String(x)}", que no existe`);
  };
  for (const [i, u] of units.entries()) {
    const w = `unidad ${u?.id ?? `#${i}`}`;
    if (typeof u?.id !== 'string' || !/^\w+$/.test(u.id)) errs.push(`${w}: id no valido (letras, numeros y _)`);
    else if (seen.has(u.id)) errs.push(`${w}: id repetido`);
    else seen.add(u.id);
    texts(w, u?.name);
    if (!isNum(u?.cost, 1, 1e6, true)) errs.push(`${w}: cost tiene que ser un entero > 0`);
    if (!isNum(u?.move, 0, 30, true)) errs.push(`${w}: move entre 0 y 30`);
    if (!isNum(u?.vision, 0, 30, true)) errs.push(`${w}: vision entre 0 y 30`);
    if (!MOVEMENTS.includes(u?.movement)) errs.push(`${w}: movement tiene que ser ${MOVEMENTS.join(', ')}`);
    if (!isNum(u?.fuel?.max, 0, 999, true) || !isNum(u?.fuel?.perTurn, 0, 99, true))
      errs.push(`${w}: fuel.max y fuel.perTurn enteros >= 0`);
    else if (u.fuel.perTurn > 0 && u.fuel.max === 0) errs.push(`${w}: gasta combustible por ronda pero fuel.max es 0`);
    if (!isNum(u?.ammo, 0, 99, true)) errs.push(`${w}: ammo entero >= 0 (0 = infinita)`);
    if (typeof u?.captures !== 'boolean') errs.push(`${w}: captures tiene que ser true o false`);
    if (u?.attack !== null) {
      const a = u?.attack;
      if (!a || !Array.isArray(a.range) || a.range.length !== 2)
        errs.push(`${w}: attack.range tiene que ser [desde, hasta] (o attack: null si no ataca)`);
      else if (!isNum(a.range[0], 1, 30, true) || !isNum(a.range[1], a.range[0], 30, true))
        errs.push(`${w}: attack.range: 1 <= desde <= hasta`);
      for (const [t, p] of Object.entries(a?.hitChance ?? {})) {
        if (!uids.has(t)) errs.push(`${w}: attack.hitChance nombra "${t}", que no existe`);
        if (!isNum(p, 0, 1)) errs.push(`${w}: attack.hitChance.${t} entre 0 y 1`);
      }
      if (a && !Object.values(a.hitChance ?? {}).some((p) => p > 0))
        errs.push(`${w}: ataca pero no puede acertar a nadie (attack.hitChance)`);
    }
    if (u?.transport) {
      if (!isNum(u.transport.slots, 1, 9, true)) errs.push(`${w}: transport.slots entre 1 y 9`);
      refs(w, 'transport.carries', u.transport.carries, uids);
    }
    for (const f of ['builtAt', 'repairedAt', 'refueledAt', 'rearmedAt'] as const) refs(w, f, u?.[f], bids);
    if (Array.isArray(u?.builtAt) && !u.builtAt.length) errs.push(`${w}: builtAt vacio: nadie la puede comprar`);
    if (u?.supplies) {
      refs(w, 'supplies.fuel', u.supplies.fuel, uids);
      refs(w, 'supplies.ammo', u.supplies.ammo, uids);
    }
    for (const [t, h] of Object.entries(u?.heals ?? {})) {
      if (!uids.has(t)) errs.push(`${w}: heals nombra "${t}", que no existe`);
      if (!isNum(h, 0, 100, true)) errs.push(`${w}: heals.${t} entre 0 y 100`);
    }
    for (const t of Object.keys(u?.classicSprite ?? {}))
      if (!terrainNames.includes(t)) errs.push(`${w}: classicSprite nombra el terreno "${t}", que no existe`);
  }
  for (const b of buildings)
    for (const t of Object.keys(b?.classicSprite ?? {}))
      if (!terrainNames.includes(t)) errs.push(`edificio ${b.id}: classicSprite nombra el terreno "${t}"`);
  return errs;
}

/** Tablas por indice (las que usan las reglas desde 2013). */
export function buildTables(c: Content, terrainNames: readonly string[]) {
  const U = c.units.map((u) => u.id);
  const B = c.buildings.map((b) => b.id);
  const byUnit = <T>(f: (u: UnitDef) => T): T[] => c.units.map(f);
  const unitRow = (list: string[] | undefined) => U.map((id) => !!list?.includes(id));
  const buildingRow = (list: string[]) => B.map((id) => list.includes(id));
  const sprites = (m: Record<string, string> | undefined) => terrainNames.map((t) => m?.[t] ?? '');
  return {
    UNIT_NAMES: U,
    UNIT: {
      cost: byUnit((u) => u.cost),
      mover: byUnit((u) => u.move),
      vision: byUnit((u) => u.vision),
      alcance: byUnit((u) => u.attack?.range[1] ?? 0),
      minalc: byUnit((u) => (u.attack ? u.attack.range[0] - 1 : 0)),
      movtype: byUnit((u) => MOVEMENTS.indexOf(u.movement)),
      maxfuel: byUnit((u) => u.fuel.max),
      fuelperturn: byUnit((u) => u.fuel.perTurn),
      maxammo: byUnit((u) => u.ammo),
      maxcarry: byUnit((u) => u.transport?.slots ?? 0),
      cancapt: byUnit((u) => u.captures),
      canfight: byUnit((u) => u.attack !== null),
    },
    HEALER: byUnit((u) => buildingRow(u.repairedAt)),
    FUELER: byUnit((u) => buildingRow(u.refueledAt)),
    AMMO_RESTORER: byUnit((u) => buildingRow(u.rearmedAt)),
    SPAWNER: byUnit((u) => buildingRow(u.builtAt)),
    CAN_CARRY: byUnit((u) => unitRow(u.transport?.carries)),
    UNIT_FUELER: byUnit((u) => unitRow(u.supplies?.fuel)),
    UNIT_AMMO_RESTORER: byUnit((u) => unitRow(u.supplies?.ammo)),
    POWER: byUnit((u) => U.map((id) => u.attack?.hitChance[id] ?? 0)),
    UNIT_HEALS: byUnit((u) => U.map((id) => u.heals?.[id] ?? 0)),
    UNIT_TERRAIN_PREFIX: byUnit((u) => sprites(u.classicSprite)),
    UNIT_SUPPORT: byUnit((u) => !!u.ai?.support),
    BUILDING_NAMES: B,
    HQ: c.buildings.findIndex((b) => b.hq),
    BUILDING: {
      earning: c.buildings.map((b) => b.earning),
      heals: c.buildings.map((b) => b.heals),
      protection: c.buildings.map((b) => b.protection),
      vision: c.buildings.map((b) => b.vision),
    },
    BUILDING_TERRAIN_PREFIX: c.buildings.map((b) => sprites(b.classicSprite)),
  };
}

/** Lee, valida y convierte el contenido. Si algo esta mal, el juego no arranca y dice que. */
export function loadContent(terrainNames: readonly string[]) {
  const raw = { units: (unitsFile as { units: unknown }).units, buildings: (buildingsFile as { buildings: unknown }).buildings };
  const errs = validateContent(raw, terrainNames);
  if (errs.length) throw new Error(`Contenido del juego no valido (src/core/content):\n- ${errs.join('\n- ')}`);
  const content = raw as Content;
  return { content, tables: buildTables(content, terrainNames) };
}
