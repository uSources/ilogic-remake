import type Phaser from 'phaser';
import type { TerrainType, UnitType } from '../core/content';
import { buildingTypeOf, terrainAt, themeOf, unitTypeOf } from '../core/gameContent';
import { isOnBoard } from '../core/mapGrid';
import type { Building, GameState, Pos, TeamId, Unit } from '../core/model';
import { hasImage } from '../atlas';
import { settings } from '../settings';
import { isFriendly, ownerSideOf, sideLetter, sideOf } from './sides';

/**
 * Nombres de imagen, igual que en el original (ver docs/SPEC-INTERFAZ.md §5):
 * unidad  = (b_ activa | i_ usada | r_ IA) + (1_ en agua | 2_ en nieve) + nombre
 * edificio = (b_ | r_ | nada si neutral o en niebla) + (2_ en nieve) + nombre
 */

/** Orillas de 2013 de cada tema (id de themes.json): c_<numero>_<mascara>. */
const CLASSIC_COAST: Readonly<Record<string, number>> = { Plains: 0, Desert: 1, Forest: 2, Swamp: 3, Snowy: 4 };

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

/** El dibujo de una unidad vista por `viewer`: azul (gris si ya ha actuado) la propia y la aliada, roja la enemiga. */
export function unitKey(textures: Phaser.Textures.TextureManager, s: GameState, unit: Unit, viewer: TeamId): string | null {
  const friendly = isFriendly(sideOf(s, viewer, unit.team));
  const side = !friendly ? 'r_' : unit.active ? 'b_' : 'i_';
  const unitType = unitTypeOf(s, unit);
  const terrain = unitType.classicSprite[terrainAt(s, unit).id] ?? '';
  const name = unitType.art;
  // Dibujo nuevo (carpeta u/), si esta elegido y existe.
  if (settings.terrainArt === 'new' && hasImage(textures, `u/${side}${name}`)) return `u/${side}${name}`;
  return firstExisting(textures, [side + terrain + name, side + name, (friendly ? 'b_' : 'r_') + name]);
}

export function unitIconKey(unitType: UnitType, available: boolean): string {
  const key = (available ? 'b_' : 'i_') + unitType.art;
  return settings.terrainArt === 'new' ? `u/${key}` : key;
}

export function buildingKey(
  textures: Phaser.Textures.TextureManager,
  s: GameState,
  building: Building,
  visible: boolean,
  viewer: TeamId,
): string | null {
  const owner = visible ? ownerSideOf(s, viewer, building.owner) : 'neutral';
  const side = owner === 'neutral' ? '' : `${sideLetter(owner)}_`;
  const buildingType = buildingTypeOf(s, building);
  const terrain = buildingType.classicSprite[terrainAt(s, building).id] ?? '';
  const name = buildingType.id;
  // Dibujo nuevo (estilo plano).
  if (settings.terrainArt === 'new') {
    const key = `flat/bld_${side ? side[0] : 'n'}_${name}`;
    if (hasImage(textures, key)) return key;
  }
  // La Base no tiene imagen neutral: solo pasa al final de la partida.
  return firstExisting(textures, [side + terrain + name, side + name, 'b_' + name]);
}

export function terrainKey(terrain: TerrainType): string {
  return terrain.id;
}

/** La casilla a (dx, dy) de `tile` es tierra. Fuera del mapa cuenta como agua: no hay orilla en los bordes. */
function isLandBeside(s: GameState, tile: Pos, dx: number, dy: number): boolean {
  const pos = { x: tile.x + dx, y: tile.y + dy };
  return isOnBoard(s, pos) && !terrainAt(s, pos).isWater;
}

/** Orillas de una casilla de agua: c_<tema>_<mascara> y esquinas 16..19. */
export function shoreKeys(s: GameState, tile: Pos): string[] {
  if (!terrainAt(s, tile).isWater) return [];
  const isLand = (dx: number, dy: number) => isLandBeside(s, tile, dx, dy);
  const mask = (isLand(0, 1) ? 8 : 0) | (isLand(-1, 0) ? 4 : 0) | (isLand(0, -1) ? 2 : 0) | (isLand(1, 0) ? 1 : 0);
  const theme = CLASSIC_COAST[themeOf(s).id] ?? 0;
  const keys: string[] = [];
  if (mask) keys.push(`c_${theme}_${mask}`);
  if (isLand(-1, -1) && (mask & 6) === 0) keys.push(`c_${theme}_16`);
  if (isLand(1, -1) && (mask & 3) === 0) keys.push(`c_${theme}_17`);
  if (isLand(1, 1) && (mask & 9) === 0) keys.push(`c_${theme}_18`);
  if (isLand(-1, 1) && (mask & 12) === 0) keys.push(`c_${theme}_19`);
  return keys;
}
