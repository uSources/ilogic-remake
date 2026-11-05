/**
 * [CAMBIO] Escuadras y ordenes permanentes del jugador (estilo RTS). Este fichero solo reune lo
 * publico de `squads/` para importarlo de un sitio desde fuera del nucleo; dentro, mejor del modulo
 * concreto (de abajo arriba, cada uno solo usa los de antes):
 *
 * | Modulo | Que va |
 * |---|---|
 * | `queries` | unidades de una escuadra, escuadra por id |
 * | `naming` | nombres y teclas de grupo (1-9) |
 * | `standingOrders` | la orden de la escuadra y la propia de cada unidad: dar, quitar, cumplir, formacion |
 * | `membership` | formar, meter y sacar unidades, grupos por tecla, renombrar y deshacer |
 */
export { squadUnits, squadById } from './squads/queries';
export { SQUAD_NAMES, SQUAD_NAME_MAX, SQUAD_KEYS, cleanSquadName, freeKey, squadByKey, squadsOfTeam, assignKeys } from './squads/naming';
export {
  effectiveStandingOrder,
  isDetached,
  standingOrderBlock,
  standingOrderChoices,
  giveStandingOrder,
  cancelStandingOrder,
  finishStandingOrder,
  keepCapturing,
  atStandingOrder,
  sameFormation,
  squadInFormation,
  liftStandingOrder,
} from './squads/standingOrders';
export { pruneSquads, formSquad, setGroup, addToGroup, leaveSquad, renameSquad, disbandSquad } from './squads/membership';
