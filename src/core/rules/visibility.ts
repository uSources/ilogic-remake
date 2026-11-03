/**
 * Vision y niebla: que casillas ve cada bando.
 */
import { BUILDING, HIDING_TERRAIN, RULES, UNIT } from '../data';
import { seesIntoCover } from '../abilities';
import { diamond, grid, manhattan } from '../geom';
import { revealsAll } from '../generals';
import { cellAt, setCell } from '../util/grid';
import { isOnMap } from '../util/predicates';
import { weatherVision } from '../weather';
import type { GameState, Pos, Team, Unit } from '../types';

/** Radio de vision de una unidad. [CAMBIO] El clima puede quitar vision (nunca por debajo de 1 si ve). */
export function visionOf(s: GameState, unit: Unit): number {
  const base = UNIT.vision[unit.type]!;
  return base > 0 ? Math.max(1, base + weatherVision(s)) : base;
}

/** [CAMBIO] Reglas nuevas: el bosque esconde a quien esta dentro (solo se ve desde al lado). */
function hidesInside(s: GameState, pos: Pos): boolean {
  return RULES.forestHides && HIDING_TERRAIN.includes(cellAt(s.map, pos));
}

/** Casillas que ve una unidad: su rombo de vision, menos el bosque que no tenga al lado. */
function markSeenByUnit(s: GameState, unit: Unit, visible: boolean[][]): void {
  // [CAMBIO] Habilidad scout (Jeep): ve dentro del bosque en todo su radio.
  const isScout = seesIntoCover(unit.type);
  for (const pos of diamond(unit, 0, visionOf(s, unit))) {
    if (isScout || !hidesInside(s, pos) || manhattan(unit, pos) <= 1) setCell(visible, pos, true);
  }
}

/** Casillas visibles para un bando: rombo de vision de sus unidades + casillas de sus edificios. */
export function visibility(s: GameState, team: Team): boolean[][] {
  // [CAMBIO] partida sin niebla, o el general ha usado reconocimiento: se ve todo.
  if (!RULES.fog || revealsAll(s, team)) return grid(true);
  const visible = grid(false);
  for (const unit of s.units) if (unit.team === team && isOnMap(unit)) markSeenByUnit(s, unit, visible);
  for (const building of s.buildings) {
    if (building.owner !== team) continue;
    for (const pos of diamond(building, 0, BUILDING.vision[building.type]!)) setCell(visible, pos, true);
  }
  return visible;
}
