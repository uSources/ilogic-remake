import type { TerrainType, UnitType } from '../core/content';
import { buildingTypeOf, terrainAt, unitTypeOf } from '../core/gameContent';
import type { Building, GameState, Pos, TeamId, Unit } from '../core/model';
import { hasImage, type GameImages } from '../atlas';
import { settings } from '../settings';
import { ownerSideOf, sideLetter, sideOf, unitSideLetter } from './sides';
import { canStillAct } from '../core/rules';

/**
 * Nombres de imagen, igual que en el original (ver docs/SPEC-INTERFAZ.md §5):
 * unidad  = (b_ activa | i_ usada | r_ IA) + (1_ en agua | 2_ en nieve) + nombre
 * edificio = (b_ | r_ | nada si neutral o en niebla) + (2_ en nieve) + nombre
 */

/** Orillas de 2013 de cada tema (id de themes.json): c_<numero>_<mascara>. */

const warned = new Set<string>();

/** Devuelve la primera clave que exista; avisa una vez por consola si no hay ninguna. */
function firstExisting(textures: GameImages, keys: string[]): string | null {
  for (const key of keys) if (hasImage(textures, key)) return key;
  if (!warned.has(keys[0]!)) {
    warned.add(keys[0]!);
    console.warn('Falta la imagen', keys[0]);
  }
  return null;
}

/** Como se dibuja una unidad cuando no es como esta ahora. */
export interface UnitDrawing {
  /** Activa (en color) o ya ha actuado (gris); por defecto, si aun puede actuar. */
  readonly active?: boolean;
  /** Donde se dibuja (el dibujo clasico cambia con el terreno); por defecto, su casilla. */
  readonly at?: Pos;
}

/** Dibujada como activa, haya actuado o no (iconos, quien empieza a moverse, unidades ajenas). */
export const AS_ACTIVE: UnitDrawing = { active: true };

/**
 * El dibujo de una unidad vista por `viewer`: azul (gris si ya ha actuado) la propia y la aliada,
 * roja la enemiga; `drawing` dice si se dibuja de otra forma que como esta (UnitDrawing).
 */
export function unitKey(textures: GameImages, s: GameState, unit: Unit, viewer: TeamId, drawing: UnitDrawing = {}): string | null {
  const isActive = drawing.active ?? canStillAct(unit);
  const drawnAt = drawing.at ?? unit;
  const unitSide = sideOf(s, viewer, unit.team);
  const side = `${unitSideLetter(unitSide, isActive)}_`;
  const unitType = unitTypeOf(s, unit);
  const terrain = unitType.classicSprite[terrainAt(s, drawnAt).id] ?? '';
  const name = unitType.art;
  // Dibujo nuevo (carpeta u/), si esta elegido y existe.
  if (settings.terrainArt === 'new' && hasImage(textures, `u/${side}${name}`)) return `u/${side}${name}`;
  return firstExisting(textures, [side + terrain + name, side + name, `${unitSideLetter(unitSide, true)}_${name}`]);
}

export function unitIconKey(unitType: UnitType, available: boolean): string {
  const key = (available ? 'b_' : 'i_') + unitType.art;
  return settings.terrainArt === 'new' ? `u/${key}` : key;
}

export function buildingKey(textures: GameImages, s: GameState, building: Building, visible: boolean, viewer: TeamId): string | null {
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
