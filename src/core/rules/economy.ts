/**
 * Economia y ejercito: ingresos, mantenimiento, limite de unidades y puntos de mando, y compra
 * (Building.Spawn).
 */

import { unitTypeOf, buildingTypeOf } from '../gameContent';
import type { BuildingType, UnitType } from '../content';
import { teamState } from '../teams';
import { isWalkable, teamUnits, unitAt } from './queries';
import type { Building, GameState, TeamId, Unit } from '../model';
import { newUnit } from './lifecycle';

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
  if (s.rules.upkeep <= 0) return 0;
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

/** Fabrica una unidad: nace sin poder actuar hasta la ronda siguiente. */
export function spawn(s: GameState, building: Building, unitType: UnitType): Unit | null {
  if (building.owner === null || !builds(s, building, unitType)) return null;
  const team = building.owner;
  if (buyBlock(s, team, unitType)) return null;
  if (!isWalkable(s, building, unitType.movement)) return null;
  teamState(s, team).funds -= unitType.cost;
  return newUnit(s, unitType, team, building, false);
}
