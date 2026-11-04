/**
 * [CAMBIO] Prevision de las ordenes con destino (previewStandingOrders). Solo se recalcula si cambia algo de
 * la partida que pueda cambiarla (unidades, edificios, dia); mover el cursor solo cambia cuales se dibujan.
 */
import { previewStandingOrders, type StandingOrderIntent } from '../../core/ai';
import type { GameState } from '../../core/model';

export class CommandPreview {
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
      s.generals?.map((g) => g?.reveal ?? null),
      s.units.map((u) => [
        u.uid,
        u.type,
        u.team,
        u.x,
        u.y,
        u.life,
        u.active,
        u.canMove,
        u.canFire,
        u.carrier,
        u.cargo,
        u.standingOrder,
        u.squad,
        u.travelTo,
      ]),
      s.squads?.map((q) => [q.id, q.standingOrder]),
      s.buildings.map((b) => [b.owner, b.capture]),
    ]);
    if (this.cache?.sig !== sig) this.cache = { sig, map: previewStandingOrders(s, 0) };
    return this.cache.map;
  }
}
