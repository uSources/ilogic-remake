import { terrainAt } from '../../core/gameContent';
import { mapGrid } from '../../core/mapGrid';
import type { Grid } from '../../core/util/grid';
import type { GameState, Pos } from '../../core/model';
import type { MinimapVM } from '../../hud/store';

/** Minimapa (`pal`: color de cada terreno por id, ver terrainPalette): colores del terreno, niebla, edificios (dueño solo si se ve) y unidades visibles. */
export function minimapVM(pal: Readonly<Record<string, number>>, s: GameState, vis: Grid<boolean>, hidden: ReadonlySet<number>): MinimapVM {
  const map = mapGrid(s);
  const terrain: number[] = [];
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) terrain.push(pal[terrainAt(s, { x, y }).id] ?? 0x3a7a3a);
  const seen = (pos: Pos) => vis.contains(pos) && vis.at(pos);
  return {
    w: map.width,
    h: map.height,
    terrain,
    fog: vis.columns.map((column) => column.slice()),
    buildings: s.buildings.map((building) => ({
      x: building.x,
      y: building.y,
      owner: building.owner === 0 || seen(building) ? building.owner : null,
    })),
    units: s.units
      .filter((unit) => unit.carrier === null && !hidden.has(unit.uid) && (unit.team === 0 || seen(unit)))
      .map((unit) => ({ x: unit.x, y: unit.y, team: unit.team })),
    ...(s.controlPoints
      ? {
          points: s.controlPoints.map((controlPoint) => ({
            x: controlPoint.x,
            y: controlPoint.y,
            owner: controlPoint.owner,
            r: s.rules.controlRadius,
          })),
        }
      : {}),
  };
}
