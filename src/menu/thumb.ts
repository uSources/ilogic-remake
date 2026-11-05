import { isHq, terrainAt } from '../core/gameContent';
import { mapGrid } from '../core/mapGrid';
import type { GameState, Team } from '../core/model';
import { PAL_CSS } from '../ui/palette';
import type { TerrainPalette } from '../ui/terrainColors';

const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

/** Color de una casilla cuyo terreno no esta en la paleta. */
const FALLBACK_TERRAIN = 0x3a7a3a;
const PLAYER_COLOR = '#3aa8ff';
const NEUTRAL_COLOR = '#d6dbe6';
const PLAYER_UNIT_COLOR = '#8fd0ff';
const ENEMY_UNIT_COLOR = '#ff8a80';

const ownerColor = (owner: Team | null) => (owner === 0 ? PLAYER_COLOR : owner === 1 ? PAL_CSS.red : NEUTRAL_COLOR);

/** Pixeles por casilla segun el lado del mapa, para que todas las miniaturas midan parecido. */
const defaultTileSize = (mapSize: number) => (mapSize <= 20 ? 6 : mapSize <= 32 ? 4 : 3);

interface ThumbOptions {
  /** Pintar las unidades: todas (true), solo las del jugador ('own') o ninguna. */
  units?: boolean | 'own';
  /** Pixeles por casilla. */
  px?: number;
}

function drawTerrain(context: CanvasRenderingContext2D, s: GameState, palette: TerrainPalette, px: number): void {
  for (const { pos } of mapGrid(s).cells()) {
    context.fillStyle = hex(palette[terrainAt(s, pos).id] ?? FALLBACK_TERRAIN);
    context.fillRect(pos.x * px, pos.y * px, px, px);
  }
}

/** Cada edificio, con el color de su dueño y un borde oscuro; las bases, una casilla mas grandes. */
function drawBuildings(context: CanvasRenderingContext2D, s: GameState, px: number): void {
  for (const building of s.buildings) {
    const pad = isHq(s, building) ? -1 : 0;
    context.fillStyle = PAL_CSS.ink;
    context.fillRect(building.x * px + pad - 1, building.y * px + pad - 1, px - 2 * pad + 2, px - 2 * pad + 2);
    context.fillStyle = ownerColor(building.owner);
    context.fillRect(building.x * px + pad, building.y * px + pad, px - 2 * pad, px - 2 * pad);
  }
}

function drawUnits(context: CanvasRenderingContext2D, s: GameState, px: number, which: true | 'own'): void {
  const size = Math.max(1, px - 2);
  for (const unit of s.units) {
    if (unit.carrier !== null || (which === 'own' && unit.team !== 0)) continue;
    context.fillStyle = unit.team === 0 ? PLAYER_UNIT_COLOR : ENEMY_UNIT_COLOR;
    context.fillRect(unit.x * px + 1, unit.y * px + 1, size, size);
  }
}

/**
 * Miniatura de un mapa (como imagen) para las tarjetas: terreno, edificios con el color de su dueño
 * (las bases mas grandes) y, si se pide, las unidades.
 */
export function mapThumb(s: GameState, palette: TerrainPalette, options: ThumbOptions = {}): string {
  const map = mapGrid(s);
  const px = options.px ?? defaultTileSize(map.width);
  const canvas = document.createElement('canvas');
  canvas.width = map.width * px;
  canvas.height = map.height * px;
  const context = canvas.getContext('2d')!;
  drawTerrain(context, s, palette, px);
  drawBuildings(context, s, px);
  if (options.units) drawUnits(context, s, px, options.units);
  return canvas.toDataURL();
}
