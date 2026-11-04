import { HQ, MAP_H, MAP_W, setMapSize } from '../core/data';
import type { GameState, Team } from '../core/model';
import { cells } from '../core/util/grid';
import { PAL_CSS } from '../ui/palette';

/** Ejecuta algo que cambia el tamaño del mapa global (crear o leer otra partida) y lo deja como estaba. */
export function keepMapSize<T>(fn: () => T): T {
  const width = MAP_W;
  const height = MAP_H;
  try {
    return fn();
  } finally {
    setMapSize(width, height);
  }
}

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

function drawTerrain(ctx: CanvasRenderingContext2D, s: GameState, palette: number[], px: number): void {
  for (const { pos, value } of cells(s.map)) {
    ctx.fillStyle = hex(palette[value] ?? FALLBACK_TERRAIN);
    ctx.fillRect(pos.x * px, pos.y * px, px, px);
  }
}

/** Cada edificio, con el color de su dueño y un borde oscuro; las bases, una casilla mas grandes. */
function drawBuildings(ctx: CanvasRenderingContext2D, s: GameState, px: number): void {
  for (const building of s.buildings) {
    const pad = building.type === HQ ? -1 : 0;
    ctx.fillStyle = PAL_CSS.ink;
    ctx.fillRect(building.x * px + pad - 1, building.y * px + pad - 1, px - 2 * pad + 2, px - 2 * pad + 2);
    ctx.fillStyle = ownerColor(building.owner);
    ctx.fillRect(building.x * px + pad, building.y * px + pad, px - 2 * pad, px - 2 * pad);
  }
}

function drawUnits(ctx: CanvasRenderingContext2D, s: GameState, px: number, which: true | 'own'): void {
  const size = Math.max(1, px - 2);
  for (const unit of s.units) {
    if (unit.carrier !== null || (which === 'own' && unit.team !== 0)) continue;
    ctx.fillStyle = unit.team === 0 ? PLAYER_UNIT_COLOR : ENEMY_UNIT_COLOR;
    ctx.fillRect(unit.x * px + 1, unit.y * px + 1, size, size);
  }
}

/**
 * Miniatura de un mapa (como imagen) para las tarjetas: terreno, edificios con el color de su dueño
 * (las bases mas grandes) y, si se pide, las unidades.
 */
export function mapThumb(s: GameState, palette: number[], options: ThumbOptions = {}): string {
  const mapSize = s.map.length;
  const px = options.px ?? defaultTileSize(mapSize);
  const canvas = document.createElement('canvas');
  canvas.width = mapSize * px;
  canvas.height = s.map[0]!.length * px;
  const ctx = canvas.getContext('2d')!;
  drawTerrain(ctx, s, palette, px);
  drawBuildings(ctx, s, px);
  if (options.units) drawUnits(ctx, s, px, options.units);
  return canvas.toDataURL();
}
