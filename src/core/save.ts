/**
 * Guardar y cargar partidas como JSON (en el original, formato binario en data/save).
 * [CAMBIO] sin comprobacion de "gameid" (el original cerraba el juego si no coincidia)
 * y sin modificar el estado al guardar.
 */
import {
  type RulesConfig,
  BUILDING_TYPES,
  MAP_H,
  MAP_MAX,
  MAP_MIN,
  MAP_W,
  setMapSize,
  MAX_LIFE,
  TERRAIN_TYPES,
  UNIT,
  UNIT_TYPES,
} from './data';
import { sanitizeStats } from './stats';
import type { GameState, Pos } from './types';

export function serialize(s: GameState): string {
  return JSON.stringify(s);
}

const isInt = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** Lee una partida guardada. Devuelve null si el contenido no es valido. */
export function deserialize(json: string): GameState | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const s = raw as GameState;
  if (s.version !== 1) return null;
  // [CAMBIO] mapas de varios tamaños: el tamaño sale del propio mapa guardado.
  if (!Array.isArray(s.map) || !isInt(s.map.length, MAP_MIN, MAP_MAX) || !Array.isArray(s.map[0])) return null;
  if (s.map[0].length !== s.map.length) return null;
  setMapSize(s.map.length, s.map[0].length);
  for (const col of s.map) {
    if (!Array.isArray(col) || col.length !== MAP_H || !col.every((t) => isInt(t, 0, TERRAIN_TYPES - 1))) return null;
  }
  if (!isInt(s.theme, 0, 4) || !Array.isArray(s.funds) || s.funds.length !== 2) return null;
  if (!s.funds.every((f) => isInt(f, 0, 1e9))) return null;
  if (!Array.isArray(s.units) || !Array.isArray(s.buildings)) return null;
  const uids = new Set<number>();
  for (const u of s.units) {
    if (!isInt(u.uid, 1, Number.MAX_SAFE_INTEGER) || uids.has(u.uid)) return null;
    uids.add(u.uid);
    if (!isInt(u.type, 0, UNIT_TYPES - 1) || (u.team !== 0 && u.team !== 1)) return null;
    if (!isInt(u.x, 0, MAP_W - 1) || !isInt(u.y, 0, MAP_H - 1) || !isInt(u.life, 1, MAX_LIFE)) return null;
    if (!Array.isArray(u.cargo) || u.cargo.length !== UNIT.maxcarry[u.type]) return null;
    // [CAMBIO] Las partidas guardadas antes de quitar combustible y municion los traen: se ignoran.
    delete (u as Partial<Record<'fuel' | 'ammo', unknown>>).fuel;
    delete (u as Partial<Record<'fuel' | 'ammo', unknown>>).ammo;
    u.active = !!u.active;
    u.canMove = !!u.canMove;
    u.canFire = !!u.canFire;
    if (u.kills !== undefined && !isInt(u.kills, 0, 1e6)) delete u.kills;
    if (u.order !== undefined && !(u.order && isInt(u.order.x, 0, MAP_W - 1) && isInt(u.order.y, 0, MAP_H - 1))) delete u.order;
  }
  const byUid = new Map(s.units.map((u) => [u.uid, u]));
  for (const u of s.units) {
    if (u.carrier !== null && !byUid.get(u.carrier)?.cargo.includes(u.uid)) return null;
    if (u.cargo.some((c) => c !== null && byUid.get(c)?.carrier !== u.uid)) return null;
  }
  for (const b of s.buildings) {
    if (!isInt(b.type, 0, BUILDING_TYPES - 1) || !isInt(b.x, 0, MAP_W - 1) || !isInt(b.y, 0, MAP_H - 1)) return null;
    if (b.owner !== null && b.owner !== 0 && b.owner !== 1) return null;
    if (b.capture != null) {
      const c = b.capture;
      if ((c.team !== 0 && c.team !== 1) || !isInt(c.uid, 1, Number.MAX_SAFE_INTEGER) || !isInt(c.left, 1, 1000)) b.capture = null;
    }
  }
  s.nextUid = Math.max(Number(s.nextUid) || 0, Math.max(0, ...uids) + 1);
  s.day = isInt(s.day, 1, 1e9) ? s.day : 1;
  if (s.stats !== undefined) s.stats = sanitizeStats(s.stats);
  if (s.mission !== undefined) {
    const m = s.mission;
    const o = m?.objective as Record<string, unknown> | undefined;
    const days = (v: unknown) => isInt(v, 1, 10000);
    const ok =
      !!m &&
      typeof m.id === 'string' &&
      !!o &&
      (o.kind === 'hq' ||
        (o.kind === 'survive' && days(o.days)) ||
        (o.kind === 'destroy' && days(o.days)) ||
        (o.kind === 'capture' && days(o.days) && isInt(o.count, 1, 1000) && (o.type === null || isInt(o.type, 0, BUILDING_TYPES - 1))) ||
        (o.kind === 'escort' &&
          days(o.days) &&
          isInt(o.uid, 1, Number.MAX_SAFE_INTEGER) &&
          !!o.to &&
          isInt((o.to as Pos).x, 0, MAP_W - 1) &&
          isInt((o.to as Pos).y, 0, MAP_H - 1)));
    if (!ok) return null;
  }
  if (s.setup !== undefined) {
    const g = s.setup;
    const ok = !!g && isInt(g.seed, 0, 2 ** 32) && g.size === s.map.length && (g.theme === null || isInt(g.theme, 0, 4));
    if (!ok) delete s.setup;
  }
  if (s.rules !== undefined) {
    const r = s.rules as Partial<RulesConfig>;
    const ok =
      isInt(r.initialFunds, 0, 1e9) &&
      isInt(r.maxUnits, 1, 200) &&
      typeof r.counterattack === 'boolean' &&
      (r.damageSpread === null || (typeof r.damageSpread === 'number' && r.damageSpread >= 0 && r.damageSpread <= 1)) &&
      isInt(r.capturePoints, 1, 1000) &&
      isInt(r.hqCapturePoints, 1, 1000) &&
      typeof r.incomeScale === 'number' &&
      r.incomeScale >= 0 &&
      r.incomeScale <= 10 &&
      typeof r.fog === 'boolean' &&
      (r.dayLimit === null || isInt(r.dayLimit, 1, 10000)) &&
      (r.veterancy === undefined || typeof r.veterancy === 'boolean') &&
      (r.passAllies === undefined || typeof r.passAllies === 'boolean') &&
      (r.ambush === undefined || typeof r.ambush === 'boolean') &&
      (r.forestHides === undefined || typeof r.forestHides === 'boolean') &&
      (r.terrainCost === undefined || typeof r.terrainCost === 'boolean') &&
      (r.abilities === undefined || typeof r.abilities === 'boolean') &&
      (r.commandPoints === undefined || r.commandPoints === null || isInt(r.commandPoints, 1, 10000)) &&
      (r.upkeep === undefined || (typeof r.upkeep === 'number' && r.upkeep >= 0 && r.upkeep <= 1));
    if (ok) {
      r.veterancy ??= false;
      r.passAllies ??= false;
      r.ambush ??= false;
      r.forestHides ??= false;
      r.terrainCost ??= false;
      r.abilities ??= false;
      r.commandPoints ??= null;
      r.upkeep ??= 0;
    }
    if (!ok) return null;
  }
  return s;
}
