/**
 * Economia y ejercito: ingresos, mantenimiento, limite de unidades y puntos de mando, y compra
 * (Building.Spawn).
 */
import { BUILDING, SPAWNER, UNIT, UNIT_TYPES, Movement } from '../data';
import type { Building, GameState, Team, Unit } from '../model';
import { newUnit } from './lifecycle';
import { isWalkable, teamUnits, unitAt } from './queries';

/** Los ingresos y el mantenimiento se redondean a multiplos de esto. */
const MONEY_STEP = 100;

const roundToMoneyStep = (amount: number): number => Math.round(amount / MONEY_STEP) * MONEY_STEP;

/** Puntos de mando que ocupan las unidades de un bando (regla commandPoints). */
export function commandUsed(s: GameState, team: Team): number {
  return teamUnits(s, team).reduce((total, unit) => total + UNIT.command[unit.type]!, 0);
}

/** Por que no cabe una unidad mas de ese tipo en el bando (null = cabe). */
export type ArmyLimit = 'units' | 'command';
export function armyLimit(s: GameState, team: Team, type: number): ArmyLimit | null {
  if (teamUnits(s, team).length >= s.rules.maxUnits) return 'units';
  if (s.rules.commandPoints === null) return null;
  return commandUsed(s, team) + UNIT.command[type]! > s.rules.commandPoints ? 'command' : null;
}

/**
 * [CAMBIO] Mantenimiento por ronda de un bando: el tanto por uno `upkeep` del precio de sus
 * unidades, redondeado a 100. Frena la acumulacion de ejercitos enormes (el original no lo tenia).
 */
export function upkeepOf(s: GameState, team: Team): number {
  if (s.rules.upkeep <= 0) return 0;
  const armyCost = teamUnits(s, team).reduce((total, unit) => total + UNIT.cost[unit.type]!, 0);
  return roundToMoneyStep(armyCost * s.rules.upkeep);
}

/** Ingresos de un edificio por ronda con las reglas de la partida (multiplos de 100). */
export function buildingIncome(s: GameState, type: number): number {
  return roundToMoneyStep(BUILDING.earning[type]! * s.rules.incomeScale);
}

export interface BuyOption {
  type: number;
  cost: number;
  affordable: boolean;
  /** Por que no se puede comprar (si no se puede): sin dinero o sin sitio en el ejercito. */
  blocked?: ArmyLimit | 'funds';
}

/** El edificio fabrica ese tipo de unidad (units.json, "builtAt"). */
const builds = (building: Building, type: number): boolean => !!SPAWNER[type]![building.type];

/** Por que el bando no puede comprar ahora una unidad de ese tipo (undefined = puede). */
function buyBlock(s: GameState, team: Team, type: number): BuyOption['blocked'] {
  return armyLimit(s, team, type) ?? (UNIT.cost[type]! > s.funds[team] ? 'funds' : undefined);
}

/** Tipos que fabrica un edificio, en orden de tipo, y si se pueden pagar ahora. */
export function buyOptions(s: GameState, building: Building): BuyOption[] {
  if (building.owner === null) return [];
  const team = building.owner;
  const options: BuyOption[] = [];
  for (let type = 0; type < UNIT_TYPES; type++) {
    if (!builds(building, type)) continue;
    const cost = UNIT.cost[type]!;
    const blocked = buyBlock(s, team, type);
    options.push(blocked ? { type, cost, affordable: false, blocked } : { type, cost, affordable: true });
  }
  return options;
}

/** El edificio puede fabricar ahora (es de alguien, fabrica algo y la casilla esta libre). */
export function canBuyAt(s: GameState, building: Building): boolean {
  return building.owner !== null && buyOptions(s, building).length > 0 && !unitAt(s, building);
}

/** Fabrica una unidad: nace sin poder actuar hasta la ronda siguiente. */
export function spawn(s: GameState, building: Building, type: number): Unit | null {
  if (building.owner === null || !builds(building, type)) return null;
  const team = building.owner;
  if (buyBlock(s, team, type)) return null;
  if (!isWalkable(s, building, Movement.of(type))) return null;
  s.funds[team] -= UNIT.cost[type]!;
  return newUnit(s, type, team, building, false);
}
