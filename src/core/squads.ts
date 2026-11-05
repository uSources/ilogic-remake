/**
 * [CAMBIO] Escuadras y ordenes permanentes de cada equipo (estilo RTS). Este fichero solo reune lo
 * publico de `squads/` para importarlo de un sitio desde fuera del nucleo; dentro, mejor del modulo
 * concreto (de abajo arriba, cada uno solo usa los de antes). Desde fuera solo se pregunta: formar
 * escuadras, darles ordenes y demas son acciones (core/actions.ts), que usan estos modulos para
 * hacerlas.
 *
 * | Modulo | Que va |
 * |---|---|
 * | `queries` | unidades de una escuadra, escuadra por id |
 * | `naming` | nombres y teclas de grupo (1-9) |
 * | `standingOrders` | la orden de la escuadra y la propia de cada unidad: dar, quitar, cumplir, formacion |
 * | `membership` | formar, meter y sacar unidades, grupos por tecla, renombrar y deshacer |
 */
export { squadUnits, squadById } from './squads/queries';
export { SQUAD_NAMES, SQUAD_NAME_MAX, SQUAD_KEYS, cleanSquadName, freeKey, squadByKey, squadsOfTeam } from './squads/naming';
export {
  effectiveStandingOrder,
  isDetached,
  standingOrderBlock,
  standingOrderChoices,
  atStandingOrder,
  sameFormation,
  squadInFormation,
} from './squads/standingOrders';
