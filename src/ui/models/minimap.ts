import { RULES } from '../../core/data';
import { mapGrid } from '../../core/mapGrid';
import type { Grid } from '../../core/util/grid';
import type { GameState, Pos } from '../../core/model';
import type { MinimapVM } from '../../hud/store';

/** Minimapa (`palette`: color de cada terreno, ver terrainPalette): colores del terreno, niebla, edificios (dueño solo si se ve) y unidades visibles. */
export function minimapVM(pal: readonly number[], s: GameState, vis: Grid<boolean>, hidden: ReadonlySet<number>): MinimapVM {
  const map = mapGrid(s);
  const terrain: number[] = [];
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) terrain.push(pal[map.at({ x, y })] ?? 0x3a7a3a);
  const seen = (p: Pos) => vis.contains(p) && vis.at(p);
  return {
    w: map.width,
    h: map.height,
    terrain,
    fog: vis.columns.map((column) => column.slice()),
    buildings: s.buildings.map((b) => ({ x: b.x, y: b.y, owner: b.owner === 0 || seen(b) ? b.owner : null })),
    units: s.units
      .filter((u) => u.carrier === null && !hidden.has(u.uid) && (u.team === 0 || seen(u)))
      .map((u) => ({ x: u.x, y: u.y, team: u.team })),
    ...(s.controlPoints ? { points: s.controlPoints.map((c) => ({ x: c.x, y: c.y, owner: c.owner, r: RULES.controlRadius })) } : {}),
  };
}
