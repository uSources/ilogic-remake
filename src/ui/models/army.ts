import { samePos } from '../../core/geom';
import { turnEndOrderOf, isDetached, squadInFormation } from '../../core/squads';
import type { TurnEndOrderKind, GameState } from '../../core/model';
import type { SquadVM } from '../../hud/store';
import { t } from '../../settings';

/** Tus unidades: nombre de las ordenes y escuadras de la bandeja. */

/** [CAMBIO] Nombre de una orden con destino ("Atacar aquí"...). */
export const standingOrderLabel = (kind: TurnEndOrderKind): string =>
  t(kind === 'capture' ? 'orderCapture' : kind === 'defend' ? 'orderDefend' : 'orderAttack');

/**
 * [CAMBIO] Escuadras del jugador para la bandeja: nombre, cuantas unidades, su orden (la de la
 * escuadra; sin ella, la que lleven todas si es la misma), si avanzan en formacion (ver
 * squadInFormation) y cuantas van destacadas con otra orden.
 */
export function squadsVM(s: GameState): SquadVM[] {
  return (s.squads ?? [])
    .map((listed) => {
      const units = s.units.filter((unit) => unit.squad === listed.id);
      const first = units[0] && turnEndOrderOf(s, units[0]);
      const same =
        !!first &&
        units.every((unit) => {
          const order = turnEndOrderOf(s, unit);
          return order?.kind === first.kind && samePos(order.at, first.at);
        });
      const formation = squadInFormation(s, listed.id);
      const kind = listed.standingOrder?.kind ?? (same ? first.kind : formation ? 'capture' : null);
      const detached = units.filter((unit) => isDetached(s, unit)).length;
      return {
        id: listed.id,
        name: listed.name,
        key: listed.key,
        count: units.length,
        order: kind ? standingOrderLabel(kind) : null,
        formation,
        detached,
      };
    })
    .filter((squad) => squad.count > 0)
    .sort((first, second) => (first.key ?? 99) - (second.key ?? 99));
}
