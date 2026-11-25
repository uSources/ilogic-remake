import { mapGrid } from '../../core/mapGrid';
import { isShownTo } from '../../core/rules';
import type { Grid } from '../../core/util/grid';
import type { GameState, Pos, TeamId } from '../../core/model';
import type { MinimapVM } from '../../hud/store';
import { isFriendly, ownerSideOf, sideOf } from '../sides';
import { tileMapColor, type TerrainPalette } from '../terrainColors';

/**
 * Minimapa para el equipo que mira (`palette`: color de cada terreno por id, ver terrainPalette; el
 * tema puede cambiar alguno, `tileMapColor`): colores del terreno, niebla, edificios (dueño solo si se
 * ve o es de su alianza) y unidades visibles.
 */
export function minimapVM(
  palette: TerrainPalette,
  s: GameState,
  view: { viewer: TeamId; vis: Grid<boolean>; hidden: ReadonlySet<number> },
): MinimapVM {
  const { viewer, vis, hidden } = view;
  const map = mapGrid(s);
  const terrain: number[] = [];
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) terrain.push(tileMapColor(palette, s, { x, y }));
  const seen = (pos: Pos) => vis.contains(pos) && vis.at(pos);
  return {
    w: map.width,
    h: map.height,
    terrain,
    fog: vis.columns.map((column) => column.slice()),
    buildings: s.buildings.map((building) => {
      const owner = ownerSideOf(s, viewer, building.owner);
      return { x: building.x, y: building.y, owner: isFriendly(owner) || seen(building) ? owner : 'neutral' };
    }),
    units: s.units
      .filter((unit) => !hidden.has(unit.uid) && isShownTo(viewer, unit, seen))
      .map((unit) => ({ x: unit.x, y: unit.y, side: sideOf(s, viewer, unit.team) })),
  };
}
