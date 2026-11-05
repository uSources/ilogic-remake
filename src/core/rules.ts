/**
 * Reglas del juego (portadas de Ilogic.java, Unit.java y Building.java).
 * Funciones sobre GameState, sin nada de Phaser, que preguntan y calculan: que puede hacer cada
 * unidad, hasta donde llega, cuanto acierta... Lo que cambia la partida son las acciones
 * (core/actions.ts, `dispatch`), que usan estas reglas para comprobar y hacer cada una; desde aqui
 * solo sale lo que no es de quien juega: crear unidades al preparar una partida y el fin de ronda.
 * Las desviaciones respecto al original estan marcadas con [CAMBIO].
 *
 * Este fichero solo reune lo publico de los modulos de `rules/` (uno por tema) para que se pueda
 * importar todo de un sitio, como siempre. Dentro de `src/core`, mejor importar del modulo concreto
 * (menos acoplamiento y sin ciclos). Mapa de modulos (de abajo arriba; cada uno solo usa los de antes):
 *
 * | Modulo | Que va |
 * |---|---|
 * | `queries` | que hay en una casilla, por donde se anda, unidades de un equipo, pasajeros |
 * | `unitTurn` | el turno de cada unidad: que le queda por hacer y como se gasta |
 * | `visibility` | vision y niebla |
 * | `capture` | puntos de captura, capturas a medias, capturar, su evento |
 * | `lifecycle` | crear, quitar y limpiar unidades |
 * | `movement` | alcance, caminos, emboscadas, distancia por tierra, mover, su evento |
 * | `combat` | alcance de tiro y objetivos, proteccion, acierto, veterania, contraataque, botin, tirada |
 * | `forecast` | prevision de combate, zona de amenaza |
 * | `transport` | unir, subir y bajar de transportes |
 * | `supply` | a quien se puede reparar, y repararlas |
 * | `unitActions` | menu de acciones de una unidad |
 * | `economy` | ingresos, mantenimiento, limite del ejercito, comprar |
 * | `control` | puntos de control |
 * | `round` | fin de ronda |
 * | `outcome` | victoria, derrota, objetivos de mision |
 * | `turnOrder` | quien juega y en que orden (los derrotados ya no) |
 */
export {
  unitById,
  unitAt,
  buildingAt,
  occupancy,
  canWalk,
  isWalkable,
  teamUnits,
  freeSlot,
  cargoUnits,
  movementOf,
  canMoveOn,
  terrainMoveCost,
} from './rules/queries';
export { canStillAct, canStillFire, canStillMove, isUnitTurnState, UNIT_TURN_STATES } from './rules/unitTurn';
export { visionOf, visibility } from './rules/visibility';
export {
  capturePointsOf,
  captureStrength,
  captureProgress,
  canCapture,
  captureEvent,
  type CaptureProgress,
  type CaptureResult,
} from './rules/capture';
export { newUnit } from './rules/lifecycle';
export {
  maxSteps,
  passMap,
  moveCost,
  pathCost,
  moveRange,
  canReach,
  reachableTiles,
  reachableTilesWithCost,
  distancesIgnoringUnits,
  walkPath,
  pathTo,
  validPath,
  groundDistance,
  stepToward,
  plannedPath,
  approachPath,
  moveEvent,
  endsInAmbush,
  type MoveRange,
  type MovePath,
  type PassMap,
  type ReachableTile,
  type DistanceMap,
} from './rules/movement';
export {
  inAttackRange,
  canDamage,
  fireOrigins,
  attackTargets,
  attackProblem,
  tileProtection,
  defenseStars,
  hitChance,
  RANK_KILLS,
  flanked,
  bountyFor,
  rank,
  expectedDamage,
  canCounter,
  HIT_MODIFIERS,
  type HitModifier,
} from './rules/combat';
export { damageDistribution, combatForecast, threatMap, unitThreat, attackZone, type CombatForecast } from './rules/forecast';
export { mergeTargets, mergeProblem, loadTargets, loadProblem, unloadTiles, unloadProblem } from './rules/transport';
export { canSupply } from './rules/supply';
export { unitActions, type UnitActions } from './rules/unitActions';
export {
  commandUsed,
  armyLimit,
  upkeepOf,
  buildingIncome,
  buyOptions,
  canBuyAt,
  buyProblem,
  type ArmyLimit,
  type BuyOption,
} from './rules/economy';
export { inControlZone, teamsInZone, controlRound, type ControlReport } from './rules/control';
export { unhealable, endRound, ROUND_PHASES, type RoundPhase, type RoundReport } from './rules/round';
export {
  score,
  allianceScore,
  rivalScore,
  dayLimitReached,
  isDefeated,
  isMatchOver,
  standingTeams,
  outcome,
  objectiveProgress,
  endReason,
} from './rules/outcome';
export { othersAfter, takesTurn, turnTakers, turnsAfter, type TurnStep } from './rules/turnOrder';
export { areEnemies, isOnMap, isAlive, canFight, isCapturer } from './util/predicates';
