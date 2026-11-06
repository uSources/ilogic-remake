/**
 * Las ordenes permanentes (StandingOrder): como las cumple una unidad, paso a paso. No es la IA: es
 * una regla de la partida para todos los equipos (la fase 'standingOrders' de TURN_END_PHASES,
 * actions/turn.ts), la cumpla quien la cumpla. Por eso no importa nada de ai/ (ESLint lo vigila); la
 * IA reutiliza sus pasos (retirarse, atacar, capturar, ir en formacion).
 *
 * | Modulo | Que va |
 * |---|---|
 * | `autopilot/context` | `PlayCtx` (estado del turno: equipo, grupo, plan, por donde manda) y ayudas comunes (acercarse, mover) |
 * | `autopilot/scoring` | cuanto vale cada ataque (`ATTACK_SCORE_TERMS`) |
 * | `autopilot/tactics` | retirarse, atacar, capturar lo de debajo |
 * | `autopilot/formation` | escuadras que avanzan juntas |
 * | `autopilot/standingOrders` | cumplir las ordenes de un equipo (`assistTurn`), empezar una recien dada y la prevision |
 *
 * Quien las manda dice por donde (`ActionDispatcher`: `dispatch`, o el que apunta la sesion).
 */
export { assistTurn, startStandingOrder, previewStandingOrders, type StandingOrderIntent } from './autopilot/standingOrders';
export { standingOrderPlayOrder } from './autopilot/formation';
export type { PlayCtx } from './autopilot/context';
