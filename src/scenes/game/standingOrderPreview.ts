/**
 * [CAMBIO] Prevision de las ordenes con destino (previewStandingOrders). Solo se recalcula si cambia algo de
 * la partida que pueda cambiarla (unidades, edificios, dia); mover el cursor solo cambia cuales se dibujan.
 */
import { previewStandingOrders, type StandingOrderIntent } from '../../core/ai';
import type { GameState, TeamId } from '../../core/model';

export class StandingOrderPreview {
  /** Prevision y la firma de la partida con la que se calculo. */
  private cache: { sig: string; map: Map<number, StandingOrderIntent> } | null = null;

  reset(): void {
    this.cache = null;
  }

  /** Lo que hara cada unidad de `team` con orden al terminar el turno (por uid). */
  get(s: GameState, team: TeamId): Map<number, StandingOrderIntent> {
    const sig = JSON.stringify([
      team,
      s.day,
      s.weather,
      s.teams.map((teamState) => teamState.general?.reveal ?? null),
      s.units.map((unit) => [
        unit.uid,
        unit.type,
        unit.team,
        unit.x,
        unit.y,
        unit.life,
        unit.turnState,
        unit.carrier,
        unit.cargo,
        unit.standingOrder,
        unit.squad,
        unit.travelTo,
      ]),
      s.squads?.map((squad) => [squad.id, squad.standingOrder]),
      s.buildings.map((building) => [building.owner, building.capture]),
    ]);
    if (this.cache?.sig !== sig) this.cache = { sig, map: previewStandingOrders(s, team) };
    return this.cache.map;
  }
}
