import { samePos } from '../../core/geom';
import { effectiveStandingOrder, isDetached, squadInFormation } from '../../core/squads';
import type { StandingOrderKind, GameState } from '../../core/model';
import type { SquadVM } from '../../hud/store';
import { t } from '../../settings';

/** Tus unidades: nombre de las ordenes y escuadras de la bandeja. */

/** [CAMBIO] Nombre de una orden con destino ("Atacar aquí"...). */
export const commandLabel = (k: StandingOrderKind): string =>
  t(k === 'capture' ? 'orderCapture' : k === 'defend' ? 'orderDefend' : 'orderAttack');

/**
 * [CAMBIO] Escuadras del jugador para la bandeja: nombre, cuantas unidades, su orden (la de la
 * escuadra; sin ella, la que lleven todas si es la misma), si avanzan en formacion (ver
 * squadInFormation) y cuantas van destacadas con otra orden.
 */
export function squadsVM(s: GameState): SquadVM[] {
  return (s.squads ?? [])
    .map((q) => {
      const units = s.units.filter((u) => u.squad === q.id);
      const first = units[0] && effectiveStandingOrder(s, units[0]);
      const same =
        !!first &&
        units.every((u) => {
          const c = effectiveStandingOrder(s, u);
          return c?.kind === first.kind && samePos(c.at, first.at);
        });
      const formation = squadInFormation(s, q.id);
      const kind = q.standingOrder?.kind ?? (same ? first.kind : formation ? 'capture' : null);
      const detached = units.filter((u) => isDetached(s, u)).length;
      return { id: q.id, name: q.name, key: q.key, count: units.length, order: kind ? commandLabel(kind) : null, formation, detached };
    })
    .filter((q) => q.count > 0)
    .sort((a, b) => (a.key ?? 99) - (b.key ?? 99));
}
