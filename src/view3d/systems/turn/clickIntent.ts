/**
 * El clic que acierta solo: con una unidad elegida, que hace tocar una casilla segun lo que hay en
 * ella. Un enemigo al que llega, atacarlo (moviendose antes si hace falta); un transporte suyo, subir;
 * una unidad igual que se puede unir, unirse; una casilla a su alcance, ir (y, si es un edificio que
 * no es de los suyos, empezar a capturarlo); una casilla libre fuera de su alcance a la que puede ir en
 * varios turnos, «Ir alli» (la orden 'goto'); la propia unidad, soltarla. Lo demas, soltarla y tocar
 * como sin nada elegido. Puro: el turno (turnControls.ts) lo cumple con acciones.
 */
import { isValidAction } from '../../../core/actions';
import { posOf, samePos } from '../../../core/geom';
import type { GameAction, GameState, Pos, TeamId, Unit } from '../../../core/model';
import {
  buildingAt,
  canBuyAt,
  canReach,
  loadTargets,
  mergeTargets,
  moveRange,
  sightOf,
  unitAt,
  visibleFoeAt,
  type MoveRange,
} from '../../../core/rules';
import { isAlliedOwner, isHostile } from '../../../core/teams';
import type { AttackPlan } from './attackPlan';

export type ClickIntent =
  | { kind: 'deselect' }
  | { kind: 'attack'; plan: AttackPlan }
  | { kind: 'load'; into: Unit }
  | { kind: 'merge'; into: Unit }
  /** `thenCapture`: es un edificio que no es de la alianza; al llegar, se empieza a capturar si se puede. */
  | { kind: 'move'; to: Pos; thenCapture: boolean }
  /** Fuera de su alcance: «Ir alli», el viaje de varios turnos hasta `to` (la orden 'goto'). */
  | { kind: 'travel'; to: Pos }
  /** Nada que hacer ahi con esta unidad: se suelta y se toca como sin nada elegido. */
  | { kind: 'elsewhere' };

/** La unidad elegida y a donde llega (null si ya no puede moverse este turno). */
export interface Chosen {
  unit: Unit;
  range: MoveRange | null;
}

const unitAtPos = (units: readonly Unit[], pos: Pos): Unit | undefined => units.find((candidate) => samePos(candidate, pos));

/**
 * Que hace tocar `pos` con la unidad elegida. `attack`: el plan de ataque contra lo que hay en `pos`,
 * si hay un enemigo al que puede atacar (lo calcula el turno, que es quien sabe desde donde).
 */
export function clickIntent(s: GameState, viewer: TeamId, chosen: Chosen, pos: Pos, attack: AttackPlan | null): ClickIntent {
  const { unit } = chosen;
  if (samePos(pos, unit)) return { kind: 'deselect' };
  if (attack) return { kind: 'attack', plan: attack };
  const range = chosen.range ?? moveRange(s, unit);
  const transport = unitAtPos(loadTargets(s, unit, range), pos);
  if (transport) return { kind: 'load', into: transport };
  const twin = unitAtPos(mergeTargets(s, unit, range), pos);
  if (twin) return { kind: 'merge', into: twin };
  if (chosen.range && canReach(chosen.range, pos)) return { kind: 'move', to: pos, thenCapture: isForeignBuilding(s, viewer, pos) };
  if (chosen.range && isTravelGoal(s, viewer, unit, pos)) return { kind: 'travel', to: pos };
  return { kind: 'elsewhere' };
}

/** La orden de ir alli de la unidad hasta `goal`. */
export const travelOrder = (unit: Unit, goal: Pos): GameAction => ({
  kind: 'giveStandingOrder',
  uids: [unit.uid],
  order: { kind: 'goto', at: posOf(goal) },
});

/**
 * Tocar alli es empezar un viaje: el nucleo deja darle la orden (un sitio que puede pisar y al que no
 * llega ya) y en la casilla no hay nada que tocar sin unidad elegida: una unidad que se ve (se elegiria
 * o se miraria) ni una fabrica propia (se abriria la compra). Un enemigo que no se ve no cuenta: no
 * delata a nadie.
 */
function isTravelGoal(s: GameState, viewer: TeamId, unit: Unit, pos: Pos): boolean {
  if (hasVisibleUnit(s, viewer, pos) || isOwnShop(s, viewer, pos)) return false;
  return isValidAction(s, viewer, travelOrder(unit, pos));
}

function hasVisibleUnit(s: GameState, viewer: TeamId, pos: Pos): boolean {
  const there = unitAt(s, pos);
  if (!there) return false;
  return !isHostile(s, there.team, viewer) || !!visibleFoeAt(s, viewer, pos, sightOf(s, viewer));
}

function isOwnShop(s: GameState, viewer: TeamId, pos: Pos): boolean {
  const building = buildingAt(s, pos);
  return building?.owner === viewer && canBuyAt(s, building);
}

function isForeignBuilding(s: GameState, viewer: TeamId, pos: Pos): boolean {
  const building = buildingAt(s, pos);
  return !!building && !isAlliedOwner(s, building.owner, viewer);
}
