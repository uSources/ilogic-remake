import type Phaser from 'phaser';
import { TERRAIN_NAMES } from '../core/content';
import { tablesOf } from '../core/gameContent';
import { isOnBoard, terrainAt } from '../core/mapGrid';
import type { Building, GameState, Pos, Unit } from '../core/model';
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
  for (const key of keys) if (hasImage(textures, key)) return key;
  if (!warned.has(keys[0]!)) {
    warned.add(keys[0]!);
    console.warn('Falta la imagen', keys[0]);
  }
  return null;
}

export function unitKey(textures: Phaser.Textures.TextureManager, s: GameState, unit: Unit): string | null {
  const side = unit.team === 1 ? 'r_' : unit.active ? 'b_' : 'i_';
  const tables = tablesOf(s);
  const terrain = tables.UNIT_TERRAIN_PREFIX[unit.type]![terrainAt(s, unit)]!;
  const name = tables.UNIT_ART[unit.type]!;
  // Dibujo nuevo (carpeta u/), si esta elegido y existe.
  if (settings.terrainArt === 'new' && hasImage(textures, `u/${side}${name}`)) return `u/${side}${name}`;
  return firstExisting(textures, [side + terrain + name, side + name, (unit.team === 1 ? 'r_' : 'b_') + name]);
}

export function unitIconKey(s: GameState, type: number, available: boolean): string {
  const key = (available ? 'b_' : 'i_') + tablesOf(s).UNIT_ART[type]!;
  return settings.terrainArt === 'new' ? `u/${key}` : key;
}

export function buildingKey(textures: Phaser.Textures.TextureManager, s: GameState, building: Building, visible: boolean): string | null {
  const side = visible && building.owner === 0 ? 'b_' : visible && building.owner === 1 ? 'r_' : '';
  const tables = tablesOf(s);
  const terrain = tables.BUILDING_TERRAIN_PREFIX[building.type]![terrainAt(s, building)]!;
  const name = tables.BUILDING_NAMES[building.type]!;
  // Dibujo nuevo (estilo plano).
  if (settings.terrainArt === 'new') {
    const key = `flat/bld_${side ? side[0] : 'n'}_${name}`;
    if (hasImage(textures, key)) return key;
  }
  // La Base no tiene imagen neutral: solo pasa al final de la partida.
  return firstExisting(textures, [side + terrain + name, side + name, 'b_' + name]);
}

export function terrainKey(terrain: number): string {
  return TERRAIN_NAMES[terrain]!;
}

/** La casilla a (dx, dy) de `tile` es tierra. Fuera del mapa cuenta como agua: no hay orilla en los bordes. */
function isLandBeside(s: GameState, tile: Pos, dx: number, dy: number): boolean {
  const pos = { x: tile.x + dx, y: tile.y + dy };
  return isOnBoard(s, pos) && !tablesOf(s).TERRAIN.iswater[terrainAt(s, pos)];
}

/** Orillas de una casilla de agua: c_<tema>_<mascara> y esquinas 16..19. */
export function shoreKeys(s: GameState, tile: Pos): string[] {
  if (!tablesOf(s).TERRAIN.iswater[terrainAt(s, tile)]) return [];
  const isLand = (dx: number, dy: number) => isLandBeside(s, tile, dx, dy);
  const mask = (isLand(0, 1) ? 8 : 0) | (isLand(-1, 0) ? 4 : 0) | (isLand(0, -1) ? 2 : 0) | (isLand(1, 0) ? 1 : 0);
  const theme = s.theme;
  const keys: string[] = [];
  if (mask) keys.push(`c_${theme}_${mask}`);
  if (isLand(-1, -1) && (mask & 6) === 0) keys.push(`c_${theme}_16`);
  if (isLand(1, -1) && (mask & 3) === 0) keys.push(`c_${theme}_17`);
  if (isLand(1, 1) && (mask & 9) === 0) keys.push(`c_${theme}_18`);
  if (isLand(-1, 1) && (mask & 12) === 0) keys.push(`c_${theme}_19`);
  return keys;
}
