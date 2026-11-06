/**
 * Modelo de datos de una partida: solo tipos, sin dependencias. Es la capa de
 * abajo del nucleo: todo lo demas (contenido, reglas, IA, guardado) la importa y ella no importa nada.
 */
export type { Pos } from './geometry';
export type { ControllerKind, TeamId, TeamState } from './team';
export type { DefeatReason, TeamFall } from './defeat';
export type { Unit, UnitTurnState } from './unit';
export type { Building, ControlPoint } from './building';
export type { StandingOrder, StandingOrderKind } from './standingOrder';
export type { Squad } from './squad';
export type { UndoableMove } from './undo';
export type { EndReason, GameModeId, MatchResult, VictoryRuleId } from './match';
export type { GeneralState } from './general';
export type { WeatherState } from './weather';
export type { Objective, ObjectiveGoal, ObjectiveStatus } from './objective';
export type {
  CombatInfo,
  EventActor,
  GameEvent,
  GameEventKind,
  GameEventOf,
  GeneralCharge,
  Healing,
  SquadChange,
  TravelEnd,
  Interruption,
  InterruptionKind,
} from './events';
export type { ActionRejection, ActionResult, GameAction, GameActionKind, GameActionOf } from './actions';
export type { DamageModelId, MatchSettings } from './settings';
export type { TeamStats } from './stats';
export type { GameSetup, GameState, MatchContent, MatchRuleset, SavedGameState } from './state';
export type { Dice, Rng } from './random';
