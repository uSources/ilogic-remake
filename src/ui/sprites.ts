import type Phaser from 'phaser';
import {
  BUILDING_NAMES,
  BUILDING_TERRAIN_PREFIX,
  MAP_H,
  MAP_W,
  TERRAIN,
  TERRAIN_NAMES,
  UNIT_NAMES,
  UNIT_TERRAIN_PREFIX,
} from '../core/data';
import type { Building, GameState, Unit } from '../core/types';
import { hasImage } from '../atlas';
import { settings } from '../settings';

/**
 * Nombres de imagen, igual que en el original (ver docs/SPEC-INTERFAZ.md §5):
 * unidad  = (b_ activa | i_ usada | r_ IA) + (1_ en agua | 2_ en nieve) + nombre
 * edificio = (b_ | r_ | nada si neutral o en niebla) + (2_ en nieve) + nombre
 */

const warned = new Set<string>();

/** Devuelve la primera clave que exista; avisa una vez por consola si no hay ninguna. */
function firstExisting(textures: Phaser.Textures.TextureManager, keys: string[]): string | null {
  for (const k of keys) if (hasImage(textures, k)) return k;
  if (!warned.has(keys[0]!)) {
    warned.add(keys[0]!);
    console.warn('Falta la imagen', keys[0]);
  }
  return null;
}

export function unitKey(textures: Phaser.Textures.TextureManager, s: GameState, u: Unit): string | null {
  const side = u.team === 1 ? 'r_' : u.active ? 'b_' : 'i_';
  const terrain = UNIT_TERRAIN_PREFIX[u.type]![s.map[u.x]![u.y]!]!;
  const name = UNIT_NAMES[u.type]!;
  // Dibujo nuevo (carpeta u/), si esta elegido y existe.
  if (settings.terrainArt === 'new' && hasImage(textures, `u/${side}${name}`)) return `u/${side}${name}`;
  return firstExisting(textures, [side + terrain + name, side + name, (u.team === 1 ? 'r_' : 'b_') + name]);
}

export function unitIconKey(type: number, available: boolean): string {
  const k = (available ? 'b_' : 'i_') + UNIT_NAMES[type]!;
  return settings.terrainArt === 'new' ? `u/${k}` : k;
}

export function buildingKey(textures: Phaser.Textures.TextureManager, s: GameState, b: Building, visible: boolean): string | null {
  const side = visible && b.owner === 0 ? 'b_' : visible && b.owner === 1 ? 'r_' : '';
  const terrain = BUILDING_TERRAIN_PREFIX[b.type]![s.map[b.x]![b.y]!]!;
  const name = BUILDING_NAMES[b.type]!;
  // Dibujo nuevo (estilo plano).
  if (settings.terrainArt === 'new') {
    const k = `flat/bld_${side ? side[0] : 'n'}_${name}`;
    if (hasImage(textures, k)) return k;
  }
  // La Base no tiene imagen neutral: solo pasa al final de la partida.
  return firstExisting(textures, [side + terrain + name, side + name, 'b_' + name]);
}

export function terrainKey(t: number): string {
  return TERRAIN_NAMES[t]!;
}

function isLand(s: GameState, x: number, y: number): boolean {
  // Fuera del mapa cuenta como agua: no hay orilla en los bordes.
  return x >= 0 && x < MAP_W && y >= 0 && y < MAP_H && !TERRAIN.iswater[s.map[x]![y]!];
}

/** Orillas de una casilla de agua: c_<tema>_<mascara> y esquinas 16..19. */
export function shoreKeys(s: GameState, x: number, y: number): string[] {
  if (!TERRAIN.iswater[s.map[x]![y]!]) return [];
  const mask =
    (isLand(s, x, y + 1) ? 8 : 0) | (isLand(s, x - 1, y) ? 4 : 0) | (isLand(s, x, y - 1) ? 2 : 0) | (isLand(s, x + 1, y) ? 1 : 0);
  const t = s.theme;
  const keys: string[] = [];
  if (mask) keys.push(`c_${t}_${mask}`);
  if (isLand(s, x - 1, y - 1) && (mask & 6) === 0) keys.push(`c_${t}_16`);
  if (isLand(s, x + 1, y - 1) && (mask & 3) === 0) keys.push(`c_${t}_17`);
  if (isLand(s, x + 1, y + 1) && (mask & 9) === 0) keys.push(`c_${t}_18`);
  if (isLand(s, x - 1, y + 1) && (mask & 12) === 0) keys.push(`c_${t}_19`);
  return keys;
}
