/**
 * Guardar y cargar partidas como JSON (en el original, formato binario en data/save).
 * [CAMBIO] sin comprobacion de "gameid" (el original cerraba el juego si no coincidia)
 * y sin modificar el estado al guardar.
 */
import { BUILDING_TYPES, MAP_H, MAP_W, MAX_LIFE, TERRAIN_TYPES, UNIT, UNIT_TYPES } from './data';
import type { Building, GameState, Unit } from './types';

export function serialize(s: GameState): string {
  return JSON.stringify(s);
}

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

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
  if (!Array.isArray(s.map) || s.map.length !== MAP_W) return null;
  for (const col of s.map) {
    if (!Array.isArray(col) || col.length !== MAP_H || !col.every((t) => isInt(t, 0, TERRAIN_TYPES - 1))) return null;
  }
  if (!isInt(s.theme, 0, 4) || !Array.isArray(s.funds) || s.funds.length !== 2) return null;
  if (!s.funds.every((f) => isInt(f, 0, 1e9))) return null;
  if (!Array.isArray(s.units) || !Array.isArray(s.buildings)) return null;
  const uids = new Set<number>();
  for (const u of s.units as Unit[]) {
    if (!isInt(u.uid, 1, Number.MAX_SAFE_INTEGER) || uids.has(u.uid)) return null;
    uids.add(u.uid);
    if (!isInt(u.type, 0, UNIT_TYPES - 1) || (u.team !== 0 && u.team !== 1)) return null;
    if (!isInt(u.x, 0, MAP_W - 1) || !isInt(u.y, 0, MAP_H - 1) || !isInt(u.life, 1, MAX_LIFE)) return null;
    if (!Array.isArray(u.cargo) || u.cargo.length !== UNIT.maxcarry[u.type]) return null;
    u.fuel = Math.max(0, Math.min(Number(u.fuel) || 0, UNIT.maxfuel[u.type]!));
    u.ammo = Math.max(0, Math.min(Number(u.ammo) || 0, UNIT.maxammo[u.type]!));
    u.active = !!u.active;
    u.canMove = !!u.canMove;
    u.canFire = !!u.canFire;
  }
  const byUid = new Map(s.units.map((u) => [u.uid, u]));
  for (const u of s.units) {
    if (u.carrier !== null && !byUid.get(u.carrier)?.cargo.includes(u.uid)) return null;
    if (u.cargo.some((c) => c !== null && byUid.get(c)?.carrier !== u.uid)) return null;
  }
  for (const b of s.buildings as Building[]) {
    if (!isInt(b.type, 0, BUILDING_TYPES - 1) || !isInt(b.x, 0, MAP_W - 1) || !isInt(b.y, 0, MAP_H - 1)) return null;
    if (b.owner !== null && b.owner !== 0 && b.owner !== 1) return null;
  }
  s.nextUid = Math.max(Number(s.nextUid) || 0, Math.max(0, ...uids) + 1);
  s.day = isInt(s.day, 1, 1e9) ? s.day : 1;
  return s;
}
