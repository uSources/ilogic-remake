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
 * | `funds` | el dinero: cobrar, pagar y el tope (lo usan las acciones y el fin de ronda; no sale de aqui) |
 * | `visibility` | vision y niebla |
 * | `capture` | puntos de captura, capturas a medias, capturar, su evento |
 * | `lifecycle` | crear, quitar y limpiar unidades |
 * | `movement` | alcance, caminos, emboscadas, distancia por tierra, mover, su evento |
 * | `travel` | viajes de varios turnos (usa `movement`) |
 * | `engagement` | un combate como pregunta: quien, a quien, desde donde y con que vida (`engagement`) |
 * | `combat` | alcance de tiro y objetivos, proteccion, acierto, veterania, contraataque, botin, tirada |
 * | `forecast` | prevision de combate, zona de amenaza |
 * | `transport` | unir, subir y bajar de transportes |
 * | `supply` | a quien se puede reparar, y repararlas |
 * | `economy` | ingresos, mantenimiento, limite del ejercito, comprar |
 * | `control` | puntos de control |
 * | `round` | fin de ronda |
 * | `undo` | los movimientos que se pueden deshacer (`undoableMoves`): apuntarlos, olvidarlos y por que no se puede |
 * | `falls` | si un equipo ha caido y por que (`currentDefeat`, `isDefeated`) y cuando cayo (`recordFalls`, `fallOf`) |
 * | `invariants` | lo que se deja en orden tras cada accion y cada ronda (`INVARIANTS`, `restoreInvariants`) |
 * | `victory` | como acaba la partida (`VICTORY_RULES`, `matchResult`), derrota de un equipo, puntos, objetivo de mision |
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
export { canActNow, canMoveNow, canStillAct, canStillFire, canStillMove, isUnitTurnState, UNIT_TURN_STATES } from './rules/unitTurn';
export { visionOf, visibility, visibleFoeAt, isShownTo, isVisibleFoe, sightOf, type Sight } from './rules/visibility';
export {
  autoCapturers,
  capturePointsOf,
  captureStrength,
  captureProgress,
  canCapture,
  canCaptureAt,
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
  targetProblem,
  tileProtection,
  defenseStars,
  hitChance,
  hitModifiersOf,
  bountyFor,
  expectedDamage,
  canCounter,
  HIT_MODIFIERS,
} from './rules/combat';
export { RULE_MODULES, isRuleOn, hooksOf } from './ruleModules/registry';
export type { HitModifier, CoverPiercing, RuleHooks, RuleModule, RuleModuleId } from './ruleModules/hooks';
export { RANK_KILLS, rank } from './ruleModules/veterancy';
export { flanked } from './ruleModules/flank';
export { engagement, fighterOf, reversed, type Engagement, type EngagementOptions, type Fighter } from './rules/engagement';
export { damageDistribution, combatForecast, threatMap, unitThreat, attackZone, type CombatForecast } from './rules/forecast';
export { mergeTargets, mergeProblem, loadTargets, loadProblem, unloadTiles, unloadProblem } from './rules/transport';
export { canSupply } from './rules/supply';
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
export { unhealable, endRound, roundReport, ROUND_PHASES, type RoundPhase, type RoundReport } from './rules/round';
export { INVARIANTS, restoreInvariants, type Invariant } from './rules/invariants';
export { lastUndoableMove } from './rules/undo';
export {
  currentDefeat,
  fallenSince,
  fallOf,
  isDefeated,
  isDefeatReason,
  lastFallen,
  lastFallOrder,
  mainFall,
  recordFalls,
  type FallenTeam,
} from './rules/falls';
export {
  score,
  allianceScore,
  rivalScore,
  dayLimitReached,
  decidingFall,
  isMatchOver,
  isWinner,
  outcomeFor,
  type MatchOutcome,
  matchResult,
  standingTeams,
  objectiveProgress,
  VICTORY_RULES,
  type VictoryRule,
} from './rules/victory';
export { nextTurn, takesTurn, type NextTurn } from './rules/turnOrder';
export { areEnemies, isOnMap, isAlive, canFight, isCapturer } from './util/predicates';
