/**
 * Las ordenes permanentes (StandingOrder): como las cumple una unidad, paso a paso. No es la IA: es
 * una regla de la partida para todos los equipos (la fase 'standingOrders' de TURN_END_PHASES,
 * actions/turn.ts), la cumpla quien la cumpla. Por eso no importa nada de ai/ (ESLint lo vigila); la
 * IA reutiliza sus pasos (retirarse, atacar, capturar, ir en formacion).
 *
 * | Modulo | Que va |
 * |---|---|
 * | `autopilot/profile` | con que juega (`AutopilotProfile`: pesos y razones para valorar un ataque); el de las ordenes, `autopilotProfileOf` (defaultProfile.ts) |
 * | `autopilot/context` | `PlayCtx` (equipo, perfil, como mide los caminos, fuego concentrado) y ayudas comunes (acercarse, proponer lo que hace una unidad) |
 * | `autopilot/engagement` | como pelea una unidad (`EngagementPolicy`): `HUNT`, `SHOOT_FROM_HERE`, `guardZone`, `fireOnTheWay` |
 * | `autopilot/scoring` | cuanto vale cada ataque (`ATTACK_SCORE_TERMS`) |
 * | `autopilot/tactics` | retirarse, atacar, capturar lo de debajo |
 * | `autopilot/formation` | escuadras que avanzan juntas |
 * | `autopilot/standingOrders` | cumplir las ordenes de un equipo (`assistTurn`) y empezar una recien dada |
 * | `autopilot/preview` | lo que haran las ordenes al acabar el turno, sobre una copia con la niebla del equipo (`previewStandingOrders`) |
 *
 * Son planes (`ActionPlan`): proponen sus acciones y las manda quien los cumple (la sesion, el paso de
 * fin de turno, la prevision).
 */
export { assistTurn, startStandingOrder } from './autopilot/standingOrders';
export { plannedStandingOrders, previewStandingOrders, type PlannedAction, type StandingOrderIntent } from './autopilot/preview';
export { fireOnTheWay, guardZone, HUNT, SHOOT_FROM_HERE, type EngagementPolicy, type FiringPositions } from './autopilot/engagement';
export type { AutopilotProfile, AttackPlan, AttackScoreTerm } from './autopilot/profile';
export { autopilotProfileOf } from './autopilot/defaultProfile';
export { standingOrderPlayOrder } from './autopilot/formation';
export type { PlayCtx } from './autopilot/context';
