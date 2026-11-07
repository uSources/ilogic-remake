/**
 * Inteligencia artificial del rival (IA.java), con sus fallos corregidos.
 * Cada unidad decide sola, en orden: retirarse (si esta debil),
 * atacar, capturar, avanzar hacia edificios ajenos y, si nada de eso, moverse al azar.
 * [CAMBIO] Antes de mover reparte un plan de fuego concentrado (planFire) entre varias unidades.
 * Al final fabrica unidades en sus edificios.
 * Es un plan (`ActionPlan`): propone cada accion y decide lo siguiente con lo que ha dicho la partida.
 *
 * Aqui esta el turno completo (aiTurn); las piezas, una por tema, en `ai/`:
 *
 * | Modulo | Que va |
 * |---|---|
 * | `general` | el general de la IA: que poder usa y cuando (`choosePower`, `aiGeneral`) |
 * | `tactics` | ir a capturar, avanzar, moverse al azar |
 * | `fire` | plan de fuego concentrado y orden de juego |
 * | `unitTurn` | prioridades de cada unidad en el turno de la IA (`UNIT_BEHAVIOURS`) |
 * | `production` | que fabrica |
 * | `profile` | como juega una IA (`AiProfile`: pesos, razones de ataque, comportamientos) y la del juego (`defaultAiProfile`) |
 *
 * Lo que hace una unidad paso a paso (retirarse, atacar, capturar, ir en formacion: `PlayCtx` y
 * autopilot/) no es de la IA: lo usan tambien las ordenes permanentes, que cumple la partida para
 * todos los equipos (core/autopilot.ts). La IA lo reutiliza.
 *
 * Fuera de aqui se importa de este fichero.
 */
import { aiGeneral } from './ai/general';
import { teamUnits } from './rules/queries';
import type { ActionPlan, Rng } from './model';
import type { PlayerView } from './playerView';
import { playCtx, finish } from './autopilot/context';
import { planFire } from './ai/fire';
import { produce } from './ai/production';
import { unitTurn } from './ai/unitTurn';
import type { AiProfile } from './ai/profile';

export { defaultAiProfile, type AiProfile } from './ai/profile';
export { aiGeneral, choosePower, type PowerChoice } from './ai/general';

/**
 * Turno completo de la IA que juega con `profile`, con lo que sabe su equipo (`view`: no lee la
 * partida de verdad). Deja todas sus unidades inactivas; el mantenimiento
 * va aparte (endRound). Propone sus acciones (`ActionPlan`): las manda quien la hace jugar (su
 * controlador, por la sesion) y le contesta con lo que ha dicho la partida.
 */
export function* aiTurn(view: PlayerView, profile: AiProfile, rng: Rng): ActionPlan {
  const { state: s, team } = view;
  const alone = playCtx(team, profile);
  // [CAMBIO] Primero el general (un poder, si merece la pena): ver ai/general.ts.
  yield* aiGeneral(s, alone);
  const { plan, order } = planFire(s, alone);
  // Las unidades juegan como un ejercito, con el fuego concentrado del plan.
  const army = playCtx(team, profile, { paths: 'army', focusFire: plan });
  for (const uid of order) yield* unitTurn(s, army, profile.behaviours, uid, rng);
  yield* produce(s, alone, rng);
  for (const unit of teamUnits(s, team)) yield* finish(s, unit);
}
