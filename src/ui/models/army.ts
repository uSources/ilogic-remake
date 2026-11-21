import type { TurnEndOrderKind } from '../../core/model';
import { t, type TextKey } from '../../settings';

/** Tus unidades: nombre de las ordenes. */

/** El texto del nombre de cada orden de pelear (una por tipo: el tipo lo exige). */
const ORDER_LABELS = { attack: 'orderAttack', capture: 'orderCapture', defend: 'orderDefend' } as const satisfies Record<
  TurnEndOrderKind,
  TextKey
>;

/** [CAMBIO] Nombre de una orden con destino ("Atacar aquí"...). */
export const standingOrderLabel = (kind: TurnEndOrderKind): string => t(ORDER_LABELS[kind]);
