/**
 * Los controladores que deciden con la IA del juego (`session/aiControllers`: la IA rival, el piloto
 * automatico de las ordenes) y el de cada equipo segun quien lo juega (`session/controllers`:
 * `controllersFor`). Aparte de core/session.ts para que la sesion no dependa de la IA: quien solo
 * lleva una partida (un servidor, una repeticion) no la carga.
 */
export { aiController, standingOrderAutopilot, type AiBrain } from './session/aiControllers';
export { controllersFor } from './session/controllers';
