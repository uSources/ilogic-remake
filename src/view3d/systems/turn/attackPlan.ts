/**
 * Desde donde atacaria la unidad elegida a un enemigo tocado: desde donde esta, o desde la casilla de
 * su alcance mas cercana desde la que puede dispararle (si dispara despues de moverse). Puro: lo
 * dicen las reglas del nucleo (`fireOrigins`, `attackProblem`), aqui solo se elige la casilla.
 */
import { posOf, samePos } from '../../../core/geom';
import type { GameState, Pos, Unit } from '../../../core/model';
import { attackProblem, fireOrigins, sightOf, type MoveRange } from '../../../core/rules';
import { isHostile } from '../../../core/teams';
import { minBy } from '../../../core/util/pick';

export interface AttackPlan {
  attacker: Unit;
  /** La casilla desde la que dispara (la suya si no hace falta moverse). */
  from: Pos;
  target: Unit;
}

/** El plan para atacar a `target` (null si no se puede este turno). */
export function attackPlan(s: GameState, attacker: Unit, range: MoveRange | null, target: Unit): AttackPlan | null {
  const sees = sightOf(s, attacker.team);
  const canFireFrom = (from: Pos) => attackProblem(s, attacker, target, sees, from) === null;
  const origins = fireOrigins(s, attacker, range).filter(canFireFrom);
  // Lo que menos cuesta: quedarse; si no, la casilla del alcance a la que se llega con menos pasos.
  const from = minBy(origins, (pos) => (samePos(pos, attacker) ? -1 : (range?.steps.at(pos) ?? Infinity)));
  return from ? { attacker, from: posOf(from), target } : null;
}

/** Los enemigos visibles a los que podria llegar a atacar este turno, moviendose o no (los que se marcan en rojo). */
export function targetsInReach(s: GameState, unit: Unit, range: MoveRange | null): Unit[] {
  const enemies = s.units.filter((other) => isHostile(s, unit.team, other.team));
  return enemies.filter((enemy) => attackPlan(s, unit, range, enemy) !== null);
}
