import { useEffect, useRef } from 'preact/compat';
import { t } from '../../settings';
import type { UIState } from '../state';
import { ui } from '../store';
import type { MinimapVM } from '../vm/minimap';

/** Minimapa: 4 px por casilla, niebla oscurecida, edificios y unidades de colores. */

const TILE_PX = 4;
const FOG_SHADE = 'rgba(5,8,12,0.45)';
/** Marco oscuro alrededor de edificios y unidades, para que se vean sobre cualquier terreno. */
const OUTLINE = '#0b1220';
const NEUTRAL_COLOR = '#c9d2e3';
const CONTROL_POINT_BORDER = '#ffd34d';
const TEAM_COLOR = ['#3aa8ff', '#ff4d45'] as const;
/** Las unidades, mas claras que los edificios del mismo bando. */
const UNIT_COLOR = ['#8fd0ff', '#ff8a80'] as const;
/** Boton principal del raton en `PointerEvent.buttons`. */
const PRIMARY_BUTTON = 1;

type Team = 0 | 1;
type Painter = CanvasRenderingContext2D;

const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;
const ownerColor = (owner: Team | null) => (owner === null ? NEUTRAL_COLOR : TEAM_COLOR[owner]);

function fillTile(painter: Painter, x: number, y: number) {
  painter.fillRect(x * TILE_PX, y * TILE_PX, TILE_PX, TILE_PX);
}

/** Una casilla con marco oscuro de 1 px y `color` dentro. */
function fillOutlinedTile(painter: Painter, x: number, y: number, color: string) {
  painter.fillStyle = OUTLINE;
  fillTile(painter, x, y);
  painter.fillStyle = color;
  painter.fillRect(x * TILE_PX + 1, y * TILE_PX + 1, TILE_PX - 2, TILE_PX - 2);
}

function drawTerrain(painter: Painter, minimap: MinimapVM) {
  for (let y = 0; y < minimap.h; y++)
    for (let x = 0; x < minimap.w; x++) {
      painter.fillStyle = hex(minimap.terrain[y * minimap.w + x] ?? 0);
      fillTile(painter, x, y);
    }
}

function drawFog(painter: Painter, minimap: MinimapVM) {
  painter.fillStyle = FOG_SHADE;
  for (let x = 0; x < minimap.w; x++)
    for (let y = 0; y < minimap.h; y++) {
      const isVisible = minimap.fog[x]?.[y];
      if (!isVisible) fillTile(painter, x, y);
    }
}

/** [CAMBIO] Puntos de control: su zona con borde dorado y dentro el color de su dueño. */
function drawControlPoints(painter: Painter, minimap: MinimapVM) {
  for (const point of minimap.points ?? []) {
    const left = (point.x - point.r) * TILE_PX;
    const top = (point.y - point.r) * TILE_PX;
    const side = (2 * point.r + 1) * TILE_PX;
    painter.fillStyle = CONTROL_POINT_BORDER;
    painter.fillRect(left - 1, top - 1, side + 2, side + 2);
    painter.fillStyle = ownerColor(point.owner);
    painter.fillRect(left, top, side, side);
  }
}

/** En este orden: lo de despues tapa lo de antes. */
function drawMinimap(painter: Painter, minimap: MinimapVM) {
  drawTerrain(painter, minimap);
  drawFog(painter, minimap);
  for (const building of minimap.buildings) fillOutlinedTile(painter, building.x, building.y, ownerColor(building.owner));
  drawControlPoints(painter, minimap);
  for (const unit of minimap.units) fillOutlinedTile(painter, unit.x, unit.y, UNIT_COLOR[unit.team]);
}

/** Lleva la camara a la casilla bajo el puntero. */
function jumpToPointer(event: PointerEvent, minimap: MinimapVM) {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const tileX = ((event.clientX - box.left) / box.width) * minimap.w;
  const tileY = ((event.clientY - box.top) / box.height) * minimap.h;
  ui.actions.minimapJump(tileX, tileY);
}

export function Minimap({ minimap, view }: { minimap: MinimapVM; view: UIState['minimapView'] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const painter = canvas.current?.getContext('2d');
    if (painter) drawMinimap(painter, minimap);
  }, [minimap]);
  // El recuadro de lo que se ve, en % del mapa.
  const percentPerTileX = 100 / minimap.w;
  const percentPerTileY = 100 / minimap.h;
  return (
    <div class="px minimap" title={t('minimap')}>
      <div
        class="mm-wrap"
        onPointerDown={(event) => {
          (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
          jumpToPointer(event, minimap);
        }}
        onPointerMove={(event) => {
          if (event.buttons & PRIMARY_BUTTON) jumpToPointer(event, minimap);
        }}
      >
        <canvas ref={canvas} width={minimap.w * TILE_PX} height={minimap.h * TILE_PX} />
        <span
          class="mm-view"
          style={{
            left: `${view.x * percentPerTileX}%`,
            top: `${view.y * percentPerTileY}%`,
            width: `${view.w * percentPerTileX}%`,
            height: `${view.h * percentPerTileY}%`,
          }}
        />
      </div>
    </div>
  );
}
