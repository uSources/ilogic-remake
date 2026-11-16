/**
 * El clic que acierta solo: con una unidad elegida, que hace tocar una casilla segun lo que hay en
 * ella. Un enemigo al que llega, atacarlo (moviendose antes si hace falta); un transporte suyo, subir;
 * una unidad igual que se puede unir, unirse; una casilla a su alcance, ir (y, si es un edificio que
 * no es de los suyos, empezar a capturarlo); la propia unidad, soltarla. Lo demas, soltarla y tocar
 * como sin nada elegido. Puro: el turno (turnControls.ts) lo cumple con acciones.
 */
import { samePos } from '../../../core/geom';
import type { GameState, Pos, TeamId, Unit } from '../../../core/model';
import { buildingAt, canReach, loadTargets, mergeTargets, moveRange, type MoveRange } from '../../../core/rules';
import { isAlliedOwner } from '../../../core/teams';
import type { AttackPlan } from './attackPlan';

export type ClickIntent =
  | { kind: 'deselect' }
  | { kind: 'attack'; plan: AttackPlan }
  | { kind: 'load'; into: Unit }
  | { kind: 'merge'; into: Unit }
  /** `thenCapture`: es un edificio que no es de la alianza; al llegar, se empieza a capturar si se puede. */
  | { kind: 'move'; to: Pos; thenCapture: boolean }
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
  return { kind: 'elsewhere' };
}

function isForeignBuilding(s: GameState, viewer: TeamId, pos: Pos): boolean {
  const building = buildingAt(s, pos);
  return !!building && !isAlliedOwner(s, building.owner, viewer);
}
