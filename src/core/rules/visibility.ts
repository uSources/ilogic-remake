/**
 * Vision y niebla: que casillas ve cada equipo. Los aliados comparten lo que ven.
 */

import { unitTypeOf, buildingTypeOf } from '../gameContent';
import { diamond, manhattan } from '../geom';
import { createLayer } from '../mapGrid';
import { hooksOf } from '../ruleModules/ruleset';
import type { Grid } from '../util/grid';
import { isOnMap } from '../util/predicates';
import { alliesOf, isHostile } from '../teams';
import { unitAt } from './queries';
import type { GameState, Pos, TeamId, Unit } from '../model';

/** Radio de vision de una unidad: el de su tipo, con lo que cambien los modulos ([CAMBIO] el clima). */
export function visionOf(s: GameState, unit: Unit): number {
  return hooksOf(s, 'visionRadius').reduce((radius, rule) => rule.radius(s, unit, radius), unitTypeOf(s, unit).vision);
}

/** La casilla solo se ve desde al lado ([CAMBIO] el bosque esconde a quien esta dentro). */
type IsConcealed = (pos: Pos) => boolean;

/** Lo que esconde en esta partida (lo que aportan sus modulos), para mirarlo casilla a casilla. */
function concealmentOf(s: GameState): IsConcealed {
  const rules = hooksOf(s, 'concealment');
  return (pos) => rules.some((rule) => rule.conceals(s, pos));
}

/** [CAMBIO] La unidad ve lo escondido en todo su radio (habilidad scout). */
const seesIntoCover = (s: GameState, unit: Unit): boolean => hooksOf(s, 'coverSight').some((rule) => rule.seesIntoCover(s, unit));

/** Casillas que ve una unidad: su rombo de vision, menos lo escondido que no tenga al lado. */
function markSeenByUnit(s: GameState, unit: Unit, visible: Grid<boolean>, isConcealed: IsConcealed): void {
  const isScout = seesIntoCover(s, unit);
  for (const pos of diamond(visible, unit, 0, visionOf(s, unit))) {
    if (isScout || !isConcealed(pos) || manhattan(unit, pos) <= 1) visible.set(pos, true);
  }
}

/** El equipo enseña todo el mapa a su alianza: sin niebla o con un reconocimiento (lo que aportan los modulos). */
const revealsAll = (s: GameState, team: TeamId): boolean => hooksOf(s, 'revealRules').some((rule) => rule.revealsAll(s, team));

/** [CAMBIO] El equipo ve todo el mapa: partida sin niebla, o un general de la alianza ha usado reconocimiento. */
export const seesEverything = (s: GameState, team: TeamId): boolean => alliesOf(s, team).some((ally) => revealsAll(s, ally));

/**
 * Casillas visibles para un equipo: rombo de vision de sus unidades y las de sus aliados, y casillas
 * de sus edificios y los de sus aliados.
 */
export function visibility(s: GameState, team: TeamId): Grid<boolean> {
  if (seesEverything(s, team)) return createLayer(s, true);
  const allies = alliesOf(s, team);
  const isAlly = (other: TeamId | null) => other !== null && allies.includes(other);
  const visible = createLayer(s, false);
  const isConcealed = concealmentOf(s);
  for (const unit of s.units) if (isAlly(unit.team) && isOnMap(unit)) markSeenByUnit(s, unit, visible, isConcealed);
  for (const building of s.buildings) {
    if (!isAlly(building.owner)) continue;
    for (const pos of diamond(visible, building, 0, buildingTypeOf(s, building).vision)) visible.set(pos, true);
  }
  return visible;
}

/** Si un equipo ve una casilla: una capa de `visibility` o lo que ya sepa quien pregunta (la escena). */
export type Sight = (pos: Pos) => boolean;

/** Lo que ve ahora el equipo `team` (sus aliados incluidos), como Sight. */
export function sightOf(s: GameState, team: TeamId): Sight {
  const visible = visibility(s, team);
  return (pos) => visible.at(pos);
}

/** La unidad es un enemigo de `team`, en el mapa, que su equipo ve (`sees`). */
export const isVisibleFoe = (s: GameState, team: TeamId, unit: Unit, sees: Sight): boolean =>
  isHostile(s, team, unit.team) && isOnMap(unit) && sees(unit);

/** Uids de los enemigos de `team` que ve ahora en el mapa (para saber si un movimiento ha descubierto a alguien). */
export function visibleEnemies(s: GameState, team: TeamId): Set<number> {
  const sees = sightOf(s, team);
  return new Set(s.units.filter((unit) => isVisibleFoe(s, team, unit, sees)).map((unit) => unit.uid));
}

/** El enemigo de `team` que hay en `at` y que ve (`sees`); undefined si no hay ninguno a la vista. */
export function visibleFoeAt(s: GameState, team: TeamId, at: Pos, sees: Sight): Unit | undefined {
  const unit = unitAt(s, at);
  return unit && isVisibleFoe(s, team, unit, sees) ? unit : undefined;
}

/**
 * Quien mira (el equipo `team`) ve la unidad en el mapa: suya, o de otro y a la vista (`sees`). Las
 * que van dentro de un transporte no se ven.
 */
export const isShownTo = (team: TeamId, unit: Unit, sees: Sight): boolean => isOnMap(unit) && (unit.team === team || sees(unit));
