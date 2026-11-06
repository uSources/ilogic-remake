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
 * | `tactics` | ir a capturar, avanzar, moverse al azar |
 * | `fire` | plan de fuego concentrado y orden de juego |
 * | `unitTurn` | prioridades de cada unidad en el turno de la IA (`UNIT_BEHAVIOURS`) |
 * | `production` | que fabrica |
 *
 * Lo que hace una unidad paso a paso (retirarse, atacar, capturar, ir en formacion: `PlayCtx` y
 * autopilot/) no es de la IA: lo usan tambien las ordenes permanentes, que cumple la partida para
 * todos los equipos (core/autopilot.ts). La IA lo reutiliza.
 *
 * Fuera de aqui se importa de este fichero.
 */
import { aiGeneral } from './aiGenerals';
import { teamUnits } from './rules/queries';
import { dispatch } from './actions/dispatch';
import type { ActionDispatcher } from './actions/types';
import type { GameEvent, GameState, Rng, TeamId } from './model';
import { playCtx, finish } from './autopilot/context';
import { planFire } from './ai/fire';
import { produce } from './ai/production';
import { unitTurn } from './ai/unitTurn';

/**
 * Turno completo de la IA. Deja todas sus unidades inactivas; el mantenimiento va aparte (endRound).
 * Manda sus acciones por `dispatcher` (dispatch, si no se dice: quien la hace jugar puede apuntarlas).
 */
export function* aiTurn(s: GameState, rng: Rng, team: TeamId, dispatcher: ActionDispatcher = dispatch): Generator<GameEvent> {
  const ai = playCtx(team, dispatcher);
  // [CAMBIO] Primero el general (un poder, si merece la pena): ver aiGenerals.ts.
  yield* aiGeneral(s, ai);
  const { plan, order } = planFire(s, ai.me);
  ai.plan = plan;
  ai.group = true;
  for (const uid of order) yield* unitTurn(s, ai, uid, rng);
  ai.group = false;
  ai.plan = new Map();
  yield* produce(s, ai, rng);
  for (const unit of teamUnits(s, ai.me)) yield* finish(s, ai, unit);
}
