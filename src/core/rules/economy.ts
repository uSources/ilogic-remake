/**
 * Economia y ejercito: ingresos, mantenimiento, limite de unidades y puntos de mando, y compra
 * (Building.Spawn).
 */

import { unitTypeOf, buildingTypeOf } from '../gameContent';
import type { BuildingType, UnitType } from '../content';
import { teamState } from '../teams';
import { isWalkable, teamUnits, unitAt } from './queries';
import type { ActionRejection, Building, GameState, TeamId, Unit } from '../model';
import { newUnit } from './lifecycle';
import { pay } from './funds';

/** Los ingresos y el mantenimiento se redondean a multiplos de esto. */
const MONEY_STEP = 100;

const roundToMoneyStep = (amount: number): number => Math.round(amount / MONEY_STEP) * MONEY_STEP;

/** Puntos de mando que ocupan las unidades de un equipo (regla commandPoints). */
export function commandUsed(s: GameState, team: TeamId): number {
  return teamUnits(s, team).reduce((total, unit) => total + unitTypeOf(s, unit).command, 0);
}

/** Por que no cabe una unidad mas de ese tipo en el equipo (null = cabe). */
export type ArmyLimit = 'units' | 'command';
export function armyLimit(s: GameState, team: TeamId, unitType: UnitType): ArmyLimit | null {
  if (teamUnits(s, team).length >= s.rules.maxUnits) return 'units';
  if (s.rules.commandPoints === null) return null;
  return commandUsed(s, team) + unitType.command > s.rules.commandPoints ? 'command' : null;
}

/**
 * [CAMBIO] Mantenimiento por ronda de un equipo: el tanto por uno `upkeep` del precio de sus
 * unidades, redondeado a 100. Frena la acumulacion de ejercitos enormes (el original no lo tenia).
 */
export function upkeepOf(s: GameState, team: TeamId): number {
  const armyCost = teamUnits(s, team).reduce((total, unit) => total + unitTypeOf(s, unit).cost, 0);
  return roundToMoneyStep(armyCost * s.rules.upkeep);
}

/** Ingresos de un tipo de edificio por ronda con las reglas de la partida (multiplos de 100). */
export function buildingIncome(s: GameState, buildingType: BuildingType): number {
  return roundToMoneyStep(buildingType.earning * s.rules.incomeScale);
}

export interface BuyOption {
  unitType: UnitType;
  cost: number;
  affordable: boolean;
  /** Por que no se puede comprar (si no se puede): sin dinero o sin sitio en el ejercito. */
  blocked?: ArmyLimit | 'funds';
}

/** El edificio fabrica ese tipo de unidad (units.json, "builtAt"). */
const builds = (s: GameState, building: Building, unitType: UnitType): boolean => unitType.builtAt.includes(buildingTypeOf(s, building).id);

/** Por que el equipo no puede comprar ahora una unidad de ese tipo (undefined = puede). */
function buyBlock(s: GameState, team: TeamId, unitType: UnitType): BuyOption['blocked'] {
  return armyLimit(s, team, unitType) ?? (unitType.cost > teamState(s, team).funds ? 'funds' : undefined);
}

/** Tipos que fabrica un edificio, en el orden de units.json, y si se pueden pagar ahora. */
export function buyOptions(s: GameState, building: Building): BuyOption[] {
  if (building.owner === null) return [];
  const team = building.owner;
  const toOption = (unitType: UnitType): BuyOption => {
    const blocked = buyBlock(s, team, unitType);
    const cost = unitType.cost;
    return blocked ? { unitType, cost, affordable: false, blocked } : { unitType, cost, affordable: true };
  };
  return s.content.units.list.filter((unitType) => builds(s, building, unitType)).map(toOption);
}

/** El edificio puede fabricar ahora (es de alguien, fabrica algo y la casilla esta libre). */
export function canBuyAt(s: GameState, building: Building): boolean {
  return building.owner !== null && buyOptions(s, building).length > 0 && !unitAt(s, building);
}

/**
 * Por que `team` no puede fabricar ahora una unidad de ese tipo en ese edificio (null = puede): tiene
 * que ser suyo, fabricarla, estar libre (y la casilla ser de su tipo de movimiento), y que haya dinero y
 * sitio en el ejercito.
 */
export function buyProblem(s: GameState, team: TeamId, building: Building, unitType: UnitType): ActionRejection | null {
  if (building.owner !== team) return 'notYours';
  if (!builds(s, building, unitType)) return 'notBuiltHere';
  if (!isWalkable(s, building, unitType.movement)) return 'occupied';
  return buyBlock(s, team, unitType) ?? null;
}

/**
 * El equipo `team` fabrica una unidad en su edificio, ya comprobado (buyProblem): se paga y nace sin
 * poder actuar hasta la ronda siguiente.
 */
export function buildUnit(s: GameState, team: TeamId, building: Building, unitType: UnitType): Unit {
  pay(s, team, unitType.cost);
  return newUnit(s, unitType, team, building, 'done');
}
