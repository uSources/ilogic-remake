/**
 * Modelo de datos de una partida: solo tipos, sin dependencias. Es la capa de
 * abajo del nucleo: todo lo demas (contenido, reglas, IA, guardado) la importa y ella no importa nada.
 */
export type { Pos } from './geometry';
export type { ControllerKind, TeamId, TeamState } from './team';
export type { Unit, UnitTurnState } from './unit';
export type { Building, ControlPoint } from './building';
export type { StandingOrder, StandingOrderKind } from './standingOrder';
export type { Squad } from './squad';
export type { GeneralState } from './general';
export type { WeatherState } from './weather';
export type { Objective, Outcome } from './objective';
export type { CombatInfo, GameEvent, GameEventKind, GameEventOf } from './events';
export type { RulesConfig } from './rules';
export type { TeamStats } from './stats';
export type { GameSetup, GameState, MatchContent, SavedGameState } from './state';
export type { Dice, Rng } from './random';
