/**
 * Elegir a quien atacar, tras «Atacar» en el bocadillo de la unidad (lienzo «Todo en estilo C»,
 * tablero 9; decidido con el usuario el 26-11-2026): los enemigos a tiro en el orden en que se pasa
 * por ellos, cual esta señalado (su prevision sube sobre el) y lo que sale en el bocadillo. Con el
 * raton se señala pasando por encima y se ataca tocandolo; con el teclado, ← → pasan de uno a otro,
 * Intro ataca y Esc vuelve. Puro: lo cumple el turno (turnControls.ts).
 */
import { manhattan, samePos } from '../../../core/geom';
import type { GameState, Pos, Unit } from '../../../core/model';
import type { MoveRange } from '../../../core/rules';
import { targetsInReach } from './attackPlan';

/** Los enemigos a tiro y cual esta señalado (su puesto en la lista). */
export interface TargetPick {
  readonly targets: readonly Unit[];
  readonly pointed: number;
}

/** Lo que sale en el bocadillo al elegir: atacar al señalado, pasar al siguiente y volver a la unidad. */
export type TargetEntry = 'attack' | 'nextTarget' | 'back';

/**
 * Empezar a elegir: los enemigos a tiro, del mas cercano al mas lejano (y, a igual distancia, de
 * arriba abajo y de izquierda a derecha del mapa), con el primero señalado. null si no hay ninguno.
 */
export function startPick(s: GameState, unit: Unit, range: MoveRange | null): TargetPick | null {
  const targets = [...targetsInReach(s, unit, range)].sort((a, b) => manhattan(unit, a) - manhattan(unit, b) || a.y - b.y || a.x - b.x);
  return targets.length ? { targets, pointed: 0 } : null;
}

/** El enemigo señalado. */
export function pointedTarget(pick: TargetPick): Unit | undefined {
  return pick.targets[pick.pointed];
}

/** Señalar el de esa casilla (pasar el raton por encima); si alli no hay ninguno, sigue el que estaba. */
export function pointAt(pick: TargetPick, pos: Pos): TargetPick {
  const index = pick.targets.findIndex((target) => samePos(target, pos));
  return index < 0 ? pick : { ...pick, pointed: index };
}

/** El siguiente (1) o el anterior (-1), dando la vuelta al llegar al final. */
export function stepPick(pick: TargetPick, step: -1 | 1): TargetPick {
  const count = pick.targets.length;
  return { ...pick, pointed: (pick.pointed + step + count) % count };
}

/** Lo que sale en el bocadillo: «Otro objetivo» solo si hay mas de uno. */
export function targetEntries(pick: TargetPick): TargetEntry[] {
  return pick.targets.length > 1 ? ['attack', 'nextTarget', 'back'] : ['attack', 'back'];
}
