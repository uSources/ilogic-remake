/**
 * A donde llegaria la unidad elegida si se la mandase a la casilla señalada, y por donde: el camino
 * que se traza con el cursor (core/trail.ts: se alarga casilla a casilla, se recorta al volver y salta
 * al mas corto si se pasa). Si se señala un enemigo al que puede atacar, el camino va hasta la casilla
 * desde donde dispararia; si le dispara de lejos (en arco), tambien el visor del disparo. Puro: lo
 * enseña el motor por el puerto `MovePreview` (ports/turn.ts).
 */
import { samePos } from '../../../core/geom';
import type { Pos } from '../../../core/model';
import { canReach, pathTo, type MoveRange } from '../../../core/rules';
import { extendTrail } from '../../../core/trail';
import type { MoveLook, ShotLook } from '../../ports/turn';
import type { AttackPlan } from './attackPlan';

/** El camino trazado despues de señalar una casilla, y lo que se enseña (null: nada). */
export interface PreviewState {
  readonly trail: Pos[];
  readonly look: MoveLook | null;
}

/** Un camino que acaba en la casilla de salida: no se mueve. */
const startOnly = (range: MoveRange): PreviewState => ({ trail: [{ ...range.origin }], look: null });

/**
 * Lo que se enseña al señalar `pos` con la unidad `uid` elegida. `attackFrom`: si en `pos` hay un
 * enemigo al que puede atacar, la casilla desde donde lo haria (null si no). Fuera de su alcance se
 * deja el camino como estaba (para volver a el) y no se enseña nada.
 */
export function previewAt(uid: number, range: MoveRange, trail: Pos[], pos: Pos, attackFrom: Pos | null): PreviewState {
  const goal = attackFrom ?? (canReach(range, pos) ? pos : null);
  if (!goal) return { trail, look: null };
  if (samePos(goal, range.origin)) return startOnly(range);
  const extended = extendTrail(range, trail, goal);
  const last = extended.at(-1);
  const path = last && samePos(last, goal) ? extended : pathTo(range, goal);
  return { trail: path, look: { uid, path } };
}

/** El camino para ir a `to`: el trazado si acaba alli; si no, el mas corto. */
export function pathFor(range: MoveRange, trail: readonly Pos[], to: Pos): Pos[] {
  const last = trail.at(-1);
  const isTraced = trail.length > 1 && !!last && samePos(last, to) && samePos(trail[0]!, range.origin);
  return isTraced ? [...trail] : pathTo(range, to);
}

/** De mas lejos que esto (casillas, en linea recta) el disparo va en arco: lo mismo que su animacion (eventSteps.ts). */
const ARC_FROM = 1.5;

/** El visor del disparo de ese plan: solo si va en arco (de lejos); null si no hay plan o es de cerca. */
export function arcShotOf(plan: AttackPlan | null): ShotLook | null {
  if (!plan || Math.hypot(plan.target.x - plan.from.x, plan.target.y - plan.from.y) <= ARC_FROM) return null;
  return { from: { ...plan.from }, to: { x: plan.target.x, y: plan.target.y } };
}
