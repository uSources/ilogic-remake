/**
 * Vision y niebla: que casillas ve cada equipo. Los aliados comparten lo que ven.
 */

import { unitTypeOf, buildingTypeOf, terrainAt } from '../gameContent';
import { seesIntoCover } from '../abilities';
import { diamond, manhattan } from '../geom';
import { revealsAll } from '../generals';
import { createLayer } from '../mapGrid';
import type { Grid } from '../util/grid';
import { isOnMap } from '../util/predicates';
import { alliesOf, isHostile } from '../teams';
import { weatherVision } from '../weather';
import { unitAt } from './queries';
import type { GameState, Pos, TeamId, Unit } from '../model';

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

/**
 * Casillas visibles para un equipo: rombo de vision de sus unidades y las de sus aliados, y casillas
 * de sus edificios y los de sus aliados.
 */
export function visibility(s: GameState, team: TeamId): Grid<boolean> {
  const allies = alliesOf(s, team);
  const isAlly = (other: TeamId | null) => other !== null && allies.includes(other);
  // [CAMBIO] partida sin niebla, o un general de la alianza ha usado reconocimiento: se ve todo.
  if (!s.rules.fog || allies.some((ally) => revealsAll(s, ally))) return createLayer(s, true);
  const visible = createLayer(s, false);
  for (const unit of s.units) if (isAlly(unit.team) && isOnMap(unit)) markSeenByUnit(s, unit, visible);
  for (const building of s.buildings) {
    if (!isAlly(building.owner)) continue;
    for (const pos of diamond(visible, building, 0, buildingTypeOf(s, building).vision)) visible.set(pos, true);
  }
  return visible;
}

/** Uids de los enemigos de `team` que ve ahora en el mapa (para saber si un movimiento ha descubierto a alguien). */
export function visibleEnemies(s: GameState, team: TeamId): Set<number> {
  const visible = visibility(s, team);
  return new Set(s.units.filter((unit) => isHostile(s, team, unit.team) && isOnMap(unit) && visible.at(unit)).map((unit) => unit.uid));
}

/**
 * El enemigo de `team` que hay en `at` y que ve (`sees`: su capa de vision, o lo que ya sabe quien
 * pregunta), en el mapa; undefined si no hay ninguno a la vista.
 */
export function visibleFoeAt(s: GameState, team: TeamId, at: Pos, sees: (pos: Pos) => boolean): Unit | undefined {
  const unit = unitAt(s, at);
  return unit && isHostile(s, team, unit.team) && isOnMap(unit) && sees(unit) ? unit : undefined;
}
