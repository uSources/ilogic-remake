/**
 * El turno de la IA del juego (`aiTurn`): el plan de fuego, cada unidad con sus
 * comportamientos y la compra. Es el `turn` del perfil por defecto (`defaultAiProfile`); otro perfil
 * puede traer otro (asi se prueba un cambio de codigo de la IA: `npm run balance -- run --vs <perfil>`).
 */
import { teamUnits } from '../rules/queries';
import type { ActionPlan, GameState, Rng, TeamId } from '../model';
import type { Influence } from '../autopilot/profile';
import { influenceOf } from './influence';
import { knownFoes, type PlayerView } from '../playerView';
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
  const { plan, order } = planFire(s, alone);
  // Las unidades juegan como un ejercito, con el fuego concentrado del plan (y sus mapas de influencia, si los usa).
  const influence = new TurnInfluence(s, team, usesInfluence(profile), profile.weights.memoryDays);
  // Con nervios (su dificultad), a veces no elige lo mejor: con el azar del turno, repetible.
  const nerves = profile.weights.nerves > 0 ? { slack: profile.weights.nerves, rng } : undefined;
  if (profile.planner) yield* profile.planner(s, playCtx(team, profile, { paths: 'army', influence: influence.now(), nerves }));
  for (const uid of order)
    yield* unitTurn(
      s,
      playCtx(team, profile, { paths: 'army', focusFire: plan, influence: influence.now(), nerves }),
      profile.behaviours,
      uid,
      rng,
    );
  yield* produce(s, alone, rng);
  for (const unit of teamUnits(s, team)) yield* finish(s, unit);
}

/** El perfil mira el mapa entero (tiene razones para elegir casilla: `placeTerms`). */
const usesInfluence = (profile: AiProfile): boolean => profile.placeTerms.length > 0;

/**
 * Los mapas de influencia del turno: se calculan al empezar y otra vez si cae alguna unidad (cambia el
 * peligro y el control); sin `wanted`, ninguno.
 */
class TurnInfluence {
  private maps: Influence | undefined;
  private shape = '';

  constructor(
    private readonly s: GameState,
    private readonly team: TeamId,
    private readonly wanted: boolean,
    private readonly memoryDays: number,
  ) {}

  now(): Influence | undefined {
    if (!this.wanted) return undefined;
    const shape = `${knownFoes(this.s, this.team).length}/${teamUnits(this.s, this.team).length}`;
    if (!this.maps || shape !== this.shape) {
      this.maps = influenceOf(this.s, this.team, this.memoryDays);
      this.shape = shape;
    }
    return this.maps;
  }
}
