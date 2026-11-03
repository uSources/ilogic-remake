/**
 * Turno de la IA con una de sus unidades: el orden de prioridades de cada unidad.
 */
import { HQ, UNIT } from '../data';
import { moveRange } from '../rules/movement';
import { buildingAt, unitById } from '../rules/queries';
import { wait } from '../rules/unitActions';
import type { GameEvent, GameState, Rng } from '../types';
import { bestMoveToward, doMove, needsRepair, type AiCtx } from './context';
import { advance, captureHere, randomMove, retreat, tryAttack, tryCapture } from './tactics';

/** Lo que hace la IA con una unidad en su turno (si sigue activa). */
export function* unitTurn(s: GameState, ctx: AiCtx, uid: number, rng: Rng): Generator<GameEvent> {
  const u = unitById(s, uid);
  if (!u || !u.active || u.carrier !== null || u.life <= 0) return;
  // [CAMBIO] Reglas nuevas: una captura a medias se termina antes que nada (si se va, se pierde).
  // Con captura por puntos, una unidad que ya esta sobre un edificio capturable lo empieza a capturar.
  const here = buildingAt(s, u.x, u.y);
  if (here && (yield* captureHere(s, u))) return;
  const range = moveRange(s, u);
  // [CAMBIO] Una unidad que no captura y esta encima de la Base enemiga se aparta para dejar sitio.
  if (here && here.type === HQ && here.owner !== ctx.me && here.owner !== null && !UNIT.cancapt[u.type]) {
    const dest = bestMoveToward(s, ctx, u, here, range, true);
    if (dest) {
      yield* doMove(s, u, dest, range);
      const after = moveRange(s, u);
      if (!(yield* tryAttack(s, ctx, u, after, rng))) wait(u);
      return;
    }
  }
  if (needsRepair(u) && (yield* retreat(s, ctx, u, range))) return;
  if (yield* tryAttack(s, ctx, u, range, rng)) return;
  if (yield* tryCapture(s, ctx, u, range)) return;
  if (yield* advance(s, ctx, u, range)) return;
  yield* randomMove(s, u, range, rng);
}
