/**
 * Lo que sabe un equipo de la partida (`PlayerView`): lo que recibe quien decide por el (los
 * controladores: la IA, el jugador al azar; y las ordenes permanentes que cumple la partida). Quien
 * decide no lee la partida de verdad: lee su vista, que se pone al dia despues de cada accion
 * (`seeing`), y propone acciones que la partida comprueba contra la de verdad.
 */
import type { ActionPlan, GameState, TeamId } from './model';

export interface PlayerView {
  /** El equipo que mira. */
  readonly team: TeamId;
  /**
   * La partida tal como la sabe el equipo. Es el mismo objeto todo el turno: se pone al dia con
   * `refresh` (lo hace `seeing` tras cada accion), asi quien guarda una unidad la sigue viendo como es.
   */
  readonly state: GameState;
  /** Vuelve a mirar la partida (tras una accion, o algo que haya pasado fuera del turno). */
  refresh(): void;
}

/** La vista del equipo `team` en la partida `s`. */
export function playerView(s: GameState, team: TeamId): PlayerView {
  return { team, state: s, refresh: () => {} };
}

/** El plan con la vista al dia: tras el resultado de cada accion que propone, `view` vuelve a mirar la partida. */
export function* seeing<Result>(view: PlayerView, plan: ActionPlan<Result>): ActionPlan<Result> {
  for (let step = plan.next(); ;) {
    if (step.done) return step.value;
    const result = yield step.value;
    view.refresh();
    step = plan.next(result);
  }
}
