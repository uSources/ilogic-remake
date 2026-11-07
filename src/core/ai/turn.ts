/**
 * El turno de la IA del juego (`aiTurn`): el general, el plan de fuego, cada unidad con sus
 * comportamientos y la compra. Es el `turn` del perfil por defecto (`defaultAiProfile`); otro perfil
 * puede traer otro (la arena prueba asi un cambio de codigo de la IA: `--candidate`).
 */
import { aiGeneral } from './general';
import { teamUnits } from '../rules/queries';
import type { ActionPlan, Rng } from '../model';
import type { PlayerView } from '../playerView';
import { playCtx, finish } from '../autopilot/context';
import { planFire } from './fire';
import { produce } from './production';
import { unitTurn } from './unitTurn';
import type { AiProfile } from './profile';

/**
 * Turno completo de la IA que juega con `profile`, con lo que sabe su equipo (`view`: no lee la
 * partida de verdad). Deja todas sus unidades inactivas; el mantenimiento va aparte (endRound).
 * Propone sus acciones (`ActionPlan`): las manda quien la hace jugar (su controlador, por la sesion)
 * y le contesta con lo que ha dicho la partida.
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
