/**
 * Inteligencia artificial del rival (IA.java), con sus fallos corregidos.
 * Cada unidad decide sola, en orden: retirarse (si esta debil),
 * atacar, capturar, avanzar hacia edificios ajenos y, si nada de eso, moverse al azar.
 * [CAMBIO] Antes de mover reparte un plan de fuego concentrado (planFire) entre varias unidades.
 * Al final fabrica unidades en sus edificios.
 * Es un generador: devuelve un GameEvent tras cada accion para que la interfaz la anime.
 *
 * Aqui esta el turno completo (aiTurn); las piezas, una por tema, en `ai/`:
 *
 * | Modulo | Que va |
 * |---|---|
 * | `context` | AiCtx (estado del turno: bando, grupo, plan) y ayudas comunes (acercarse, mover) |
 * | `scoring` | cuanto vale cada ataque (`ATTACK_SCORE_TERMS`) |
 * | `tactics` | retirarse, atacar, capturar, avanzar, moverse al azar |
 * | `fire` | plan de fuego concentrado y orden de juego |
 * | `unitTurn` | prioridades de cada unidad en el turno de la IA (`UNIT_BEHAVIOURS`) |
 * | `production` | que fabrica |
 * | `formation` | escuadras que avanzan juntas |
 * | `standingOrders` | ordenes permanentes del jugador (con destino) y su prevision |
 *
 * Fuera de aqui se importa de este fichero (lo publico de `ai/` se reexporta abajo).
 */
import { aiGeneral } from './aiGenerals';
import { teamUnits } from './rules/queries';
import { wait } from './rules/unitActions';
import type { GameEvent, GameState, Rng, Team } from './model';
import { aiCtx } from './ai/context';
import { planFire } from './ai/fire';
import { produce } from './ai/production';
import { unitTurn } from './ai/unitTurn';

export { assistTurn, startStandingOrder, standingOrderTurn, previewStandingOrders, type StandingOrderIntent } from './ai/standingOrders';
export { standingOrderPlayOrder } from './ai/formation';
export type { AiCtx } from './ai/context';

/** Turno completo de la IA. Deja todas sus unidades inactivas; el mantenimiento va aparte (endRound). */
export function* aiTurn(s: GameState, rng: Rng, team: Team = 1): Generator<GameEvent> {
  const ai = aiCtx(team);
  // [CAMBIO] Primero el general (una habilidad, si merece la pena): ver aiGenerals.ts.
  yield* aiGeneral(s, ai.me);
  const { plan, order } = planFire(s, ai.me);
  ai.plan = plan;
  ai.group = true;
  for (const uid of order) yield* unitTurn(s, ai, uid, rng);
  ai.group = false;
  ai.plan = new Map();
  yield* produce(s, ai.me, rng);
  for (const unit of teamUnits(s, ai.me)) wait(unit);
}
