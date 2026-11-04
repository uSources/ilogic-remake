import { MAP_H, MAP_W, RULES } from '../../core/data';
import type { GameState, Pos } from '../../core/model';
import type { MinimapVM } from '../../hud/store';

/** Minimapa (`palette`: color de cada terreno, ver terrainPalette): colores del terreno, niebla, edificios (dueño solo si se ve) y unidades visibles. */
export function minimapVM(pal: readonly number[], s: GameState, vis: boolean[][], hidden: ReadonlySet<number>): MinimapVM {
  const terrain: number[] = [];
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) terrain.push(pal[s.map[x]![y]!] ?? 0x3a7a3a);
  const seen = (p: Pos) => !!vis[p.x]?.[p.y];
  return {
    w: MAP_W,
    h: MAP_H,
    terrain,
    fog: vis.map((col) => col.slice()),
    buildings: s.buildings.map((b) => ({ x: b.x, y: b.y, owner: b.owner === 0 || seen(b) ? b.owner : null })),
    units: s.units
      .filter((u) => u.carrier === null && !hidden.has(u.uid) && (u.team === 0 || seen(u)))
      .map((u) => ({ x: u.x, y: u.y, team: u.team })),
    ...(s.controlPoints ? { points: s.controlPoints.map((c) => ({ x: c.x, y: c.y, owner: c.owner, r: RULES.controlRadius })) } : {}),
  };
}
