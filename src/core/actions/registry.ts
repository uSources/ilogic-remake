/**
 * Todas las acciones: una entrada por tipo de `GameAction`, cada una con su `validate` y su `apply`,
 * en el modulo de su tema. Una accion nueva es su forma en `GameAction` (model/actions.ts) y su
 * entrada en el modulo que toque; el tipo de ACTIONS obliga a tenerlas todas. Es el unico sitio de
 * actions/ que junta una pieza que se enchufa (la accion de los poderes, que vive en generalPowers.ts).
 */
import { CAPTURE_ACTIONS } from './capture';
import { COMBAT_ACTIONS } from './combat';
import { ECONOMY_ACTIONS } from './economy';
import { MATCH_ACTIONS } from './match';
import { TURN_ACTIONS } from './turn';
import { MOVEMENT_ACTIONS } from './movement';
import { POWER_ACTIONS } from '../generalPowers';
import { SQUAD_ACTIONS } from './squads';
import { STANDING_ORDER_ACTIONS } from './standingOrders';
import { TRANSPORT_ACTIONS } from './transport';
import { UNIT_ACTIONS } from './units';
import type { ActionRegistry } from '../model';

export const ACTIONS: ActionRegistry = {
  ...MOVEMENT_ACTIONS,
  ...COMBAT_ACTIONS,
  ...CAPTURE_ACTIONS,
  ...TRANSPORT_ACTIONS,
  ...UNIT_ACTIONS,
  ...ECONOMY_ACTIONS,
  ...POWER_ACTIONS,
  ...STANDING_ORDER_ACTIONS,
  ...SQUAD_ACTIONS,
  ...MATCH_ACTIONS,
  ...TURN_ACTIONS,
};
