/**
 * Los controladores que deciden con la IA del juego (`controllers/aiController`: la IA rival) y el
 * de cada equipo segun quien lo juega (`controllers/byTeam`: `controllersFor`). Fuera de
 * core/session (que no importa ai/: ESLint lo vigila) para que la sesion no dependa de la IA: quien
 * solo lleva una partida (un servidor, una repeticion) no la carga.
 */
export { aiController, type AiBrain } from './controllers/aiController';
export { controllersFor, screenControllers } from './controllers/byTeam';
