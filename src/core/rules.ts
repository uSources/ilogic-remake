/**
 * Reglas del juego (portadas de Ilogic.java, Unit.java y Building.java).
 * Funciones puras sobre GameState: consultan o modifican el estado, sin nada de Phaser.
 * Las desviaciones respecto al original estan marcadas con [CAMBIO].
 *
 * Este fichero solo reune lo publico de los modulos de `rules/` (uno por tema) para que se pueda
 * importar todo de un sitio, como siempre. Dentro de `src/core`, mejor importar del modulo concreto
 * (menos acoplamiento y sin ciclos). Mapa de modulos (de abajo arriba; cada uno solo usa los de antes):
 *
 * | Modulo | Que va |
 * |---|---|
 * | `queries` | que hay en una casilla, por donde se anda, unidades de un bando, pasajeros |
 * | `visibility` | vision y niebla |
 * | `capture` | puntos de captura, capturas a medias, capturar, su evento |
 * | `lifecycle` | crear, quitar y limpiar unidades |
 * | `movement` | alcance, caminos, emboscadas, distancia por tierra, mover, su evento |
 * | `combat` | alcance de tiro, proteccion, acierto, veterania, contraataque, botin, atacar |
 * | `forecast` | prevision de combate, zona de amenaza |
 * | `transport` | unir, subir y bajar de transportes |
 * | `supply` | reparar a las vecinas |
 * | `unitActions` | menu de acciones de una unidad, esperar |
 * | `economy` | ingresos, mantenimiento, limite del ejercito, comprar |
 * | `control` | puntos de control |
 * | `round` | fin de ronda |
 * | `outcome` | victoria, derrota, objetivos de mision |
 */
export { unitById, unitAt, buildingAt, occupancy, canWalk, isWalkable, teamUnits, freeSlot, cargoUnits } from './rules/queries';
export { visionOf, visibility } from './rules/visibility';
export {
  capturePointsOf,
  captureStrength,
  captureProgress,
  dropStaleCaptures,
  canCapture,
  capture,
  captureEvent,
  type CaptureProgress,
  type CaptureResult,
} from './rules/capture';
export { newUnit, removeUnit, removeDead } from './rules/lifecycle';
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
  moveUnit,
  approachPath,
  moveEvent,
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
  tileProtection,
  defenseStars,
  hitChance,
  RANK_KILLS,
  flanked,
  bountyFor,
  rank,
  expectedDamage,
  canCounter,
  attackFull,
  attackEvent,
  attack,
  HIT_MODIFIERS,
  type AttackResult,
  type HitModifier,
} from './rules/combat';
export { damageDistribution, combatForecast, threatMap, unitThreat, attackZone, type CombatForecast } from './rules/forecast';
export { mergeTargets, merge, loadTargets, load, unloadTiles, unload } from './rules/transport';
export { canSupply, supply } from './rules/supply';
export { wait, unitActions, type UnitActions } from './rules/unitActions';
export {
  commandUsed,
  armyLimit,
  upkeepOf,
  buildingIncome,
  buyOptions,
  canBuyAt,
  spawn,
  type ArmyLimit,
  type BuyOption,
} from './rules/economy';
export { inControlZone, teamsInZone, controlRound, type ControlReport } from './rules/control';
export { unhealable, endRound, ROUND_PHASES, type RoundPhase, type RoundReport } from './rules/round';
export { score, dayLimitReached, outcome, objectiveProgress, endReason } from './rules/outcome';
