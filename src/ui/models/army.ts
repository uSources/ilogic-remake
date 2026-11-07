import { samePos } from '../../core/geom';
import { turnEndOrderOf, isDetached, squadInFormation } from '../../core/squads';
import type { TurnEndOrderKind, GameState } from '../../core/model';
import type { SquadVM } from '../../hud/store';
import { t, type TextKey } from '../../settings';

/** Tus unidades: nombre de las ordenes y escuadras de la bandeja. */

/** El texto del nombre de cada orden de pelear (una por tipo: el tipo lo exige). */
const ORDER_LABELS = { attack: 'orderAttack', capture: 'orderCapture', defend: 'orderDefend' } as const satisfies Record<
  TurnEndOrderKind,
  TextKey
>;

/** [CAMBIO] Nombre de una orden con destino ("Atacar aquí"...). */
export const standingOrderLabel = (kind: TurnEndOrderKind): string => t(ORDER_LABELS[kind]);

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
