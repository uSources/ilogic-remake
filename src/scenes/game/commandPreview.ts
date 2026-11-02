/**
 * [CAMBIO] Prevision de las ordenes con destino (previewCommands). Solo se recalcula si cambia algo de
 * la partida que pueda cambiarla (unidades, edificios, dia); mover el cursor solo cambia cuales se dibujan.
 */
import { previewCommands, type CommandIntent } from '../../core/ai';
import type { GameState } from '../../core/types';

export class CommandPreview {
  /** Prevision y la firma de la partida con la que se calculo. */
  private cache: { sig: string; map: Map<number, CommandIntent> } | null = null;

  reset(): void {
    this.cache = null;
  }

  /** Lo que hara cada unidad del jugador con orden al terminar el turno (por uid). */
  get(s: GameState): Map<number, CommandIntent> {
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
        u.command,
        u.squad,
        u.order,
      ]),
      s.squads?.map((q) => [q.id, q.command]),
      s.buildings.map((b) => [b.owner, b.capture]),
    ]);
    if (this.cache?.sig !== sig) this.cache = { sig, map: previewCommands(s, 0) };
    return this.cache.map;
  }
}
