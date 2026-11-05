/**
 * [CAMBIO] Prevision de las ordenes con destino (previewStandingOrders). Solo se recalcula si cambia algo de
 * la partida que pueda cambiarla (unidades, edificios, dia); mover el cursor solo cambia cuales se dibujan.
 */
import { previewStandingOrders, type StandingOrderIntent } from '../../core/ai';
import type { GameState } from '../../core/model';

export class StandingOrderPreview {
  /** Prevision y la firma de la partida con la que se calculo. */
  private cache: { sig: string; map: Map<number, StandingOrderIntent> } | null = null;

  reset(): void {
    this.cache = null;
  }

  /** Lo que hara cada unidad del jugador con orden al terminar el turno (por uid). */
  get(s: GameState): Map<number, StandingOrderIntent> {
    const sig = JSON.stringify([
      s.day,
      s.weather,
      s.generals?.map((generalState) => generalState?.reveal ?? null),
      s.units.map((unit) => [
        unit.uid,
        unit.type,
        unit.team,
        unit.x,
        unit.y,
        unit.life,
        unit.active,
        unit.canMove,
        unit.canFire,
        unit.carrier,
        unit.cargo,
        unit.standingOrder,
        unit.squad,
        unit.travelTo,
      ]),
      s.squads?.map((squad) => [squad.id, squad.standingOrder]),
      s.buildings.map((building) => [building.owner, building.capture]),
    ]);
    if (this.cache?.sig !== sig) this.cache = { sig, map: previewStandingOrders(s, 0) };
    return this.cache.map;
  }
}
