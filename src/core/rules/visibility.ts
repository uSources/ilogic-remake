/**
 * Vision y niebla: que casillas ve cada bando.
 */

import { unitTypeOf, buildingTypeOf, terrainAt } from '../gameContent';
import { seesIntoCover } from '../abilities';
import { diamond, manhattan } from '../geom';
import { revealsAll } from '../generals';
import { createLayer } from '../mapGrid';
import type { Grid } from '../util/grid';
import { isOnMap } from '../util/predicates';
import { weatherVision } from '../weather';
import type { GameState, Pos, Team, Unit } from '../model';

/** Radio de vision de una unidad. [CAMBIO] El clima puede quitar vision (nunca por debajo de 1 si ve). */
export function visionOf(s: GameState, unit: Unit): number {
  const base = unitTypeOf(s, unit).vision;
  return base > 0 ? Math.max(1, base + weatherVision(s)) : base;
}

/** [CAMBIO] Reglas nuevas: el bosque esconde a quien esta dentro (solo se ve desde al lado). */
function hidesInside(s: GameState, pos: Pos): boolean {
  return s.rules.forestHides && terrainAt(s, pos).hides;
}

/** Casillas que ve una unidad: su rombo de vision, menos el bosque que no tenga al lado. */
function markSeenByUnit(s: GameState, unit: Unit, visible: Grid<boolean>): void {
  // [CAMBIO] Habilidad scout (Jeep): ve dentro del bosque en todo su radio.
  const isScout = seesIntoCover(s, unit);
  for (const pos of diamond(visible, unit, 0, visionOf(s, unit))) {
    if (isScout || !hidesInside(s, pos) || manhattan(unit, pos) <= 1) visible.set(pos, true);
  }
}

/** Casillas visibles para un bando: rombo de vision de sus unidades + casillas de sus edificios. */
export function visibility(s: GameState, team: Team): Grid<boolean> {
  // [CAMBIO] partida sin niebla, o el general ha usado reconocimiento: se ve todo.
  if (!s.rules.fog || revealsAll(s, team)) return createLayer(s, true);
  const visible = createLayer(s, false);
  for (const unit of s.units) if (unit.team === team && isOnMap(unit)) markSeenByUnit(s, unit, visible);
  for (const building of s.buildings) {
    if (building.owner !== team) continue;
    for (const pos of diamond(visible, building, 0, buildingTypeOf(s, building).vision)) visible.set(pos, true);
  }
  return visible;
}
