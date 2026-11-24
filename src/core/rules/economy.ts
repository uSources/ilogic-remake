/**
 * Economia y ejercito: ingresos, mantenimiento, limite de unidades y puntos de mando, y compra
 * (Building.Spawn).
 */

import { unitTypeOf, buildingTypeOf } from '../gameContent';
import type { BuildingType, UnitType } from '../content';
import { isWalkable, teamUnits, unitAt } from './queries';
import type { ActionRejection, ArmyLimit, Building, GameState, TeamId, Unit } from '../model';
import { newUnit } from './lifecycle';
import { PURCHASE, type Production, type ProductionShortage } from './production';
import { gameModeOf } from '../modes';
import { hooksOf, isRuleOn } from '../ruleModules/ruleset';
import type { ArmyLimitRule } from '../ruleModules/hooks';

/** Los ingresos y el mantenimiento se redondean a multiplos de esto. */
const MONEY_STEP = 100;

const roundToMoneyStep = (amount: number): number => Math.round(amount / MONEY_STEP) * MONEY_STEP;

/**
 * [CAMBIO] Lo que cobra quien destruye una unidad como `lost`: lo de los `killRewards` de los modulos
 * (el botin), 0 si la partida no lleva ninguno. Lo preguntan la prevision de combate y la IA.
 */
export const killReward = (s: GameState, lost: Pick<Unit, 'type'>): number =>
  hooksOf(s, 'killRewards').reduce((total, reward) => total + reward.amount(s, lost), 0);

/** La produccion de la partida (rules/production.ts): la de su modo o, si no dice ninguna, comprar. */
export const productionOf = (s: GameState): Production => gameModeOf(s).production ?? PURCHASE;

/** El equipo ya tiene todas las unidades que caben (`maxUnits`). */
export const hasFullArmy = (s: GameState, team: TeamId): boolean => teamUnits(s, team).length >= s.settings.maxUnits;

/** El ejercito tiene tope de puntos de mando (el modulo commandPoints): cada unidad ocupa los de su tipo. */
export const usesCommandPoints = (s: GameState): boolean => isRuleOn(s, 'commandPoints');

/** El tope de puntos de mando del ejercito, o null si la partida no lleva el modulo commandPoints. */
export const commandPointsCap = (s: GameState): number | null => (usesCommandPoints(s) ? s.settings.commandPoints : null);

/** Puntos de mando que ocupan las unidades de un equipo (los cuenta el modulo commandPoints y los enseña la interfaz). */
export function commandUsed(s: GameState, team: TeamId): number {
  return teamUnits(s, team).reduce((total, unit) => total + unitTypeOf(s, unit).command, 0);
}

/** Los topes del ejercito de cualquier partida: el numero de unidades. Los de los modulos (`armyLimits`) van detras. */
export const ARMY_LIMITS: readonly ArmyLimitRule[] = [{ id: 'units', blocks: (s, team) => hasFullArmy(s, team) }];

/** Por que no cabe una unidad mas de ese tipo en el equipo (null = cabe): el primer tope que la para. */
export function armyLimit(s: GameState, team: TeamId, unitType: UnitType): ArmyLimit | null {
  const stops = (limit: ArmyLimitRule): boolean => limit.blocks(s, team, unitType);
  return (ARMY_LIMITS.find(stops) ?? hooksOf(s, 'armyLimits').find(stops))?.id ?? null;
}

/**
 * [CAMBIO] Mantenimiento por ronda de un equipo: el tanto por uno `upkeep` del precio de sus
 * unidades, redondeado a 100. Frena la acumulacion de ejercitos enormes (el original no lo tenia).
 */
export function upkeepOf(s: GameState, team: TeamId): number {
  const armyCost = teamUnits(s, team).reduce((total, unit) => total + unitTypeOf(s, unit).cost, 0);
  return roundToMoneyStep(armyCost * s.settings.upkeep);
}

/** Ingresos de un tipo de edificio por ronda con las reglas de la partida (multiplos de 100). */
export function buildingIncome(s: GameState, buildingType: BuildingType): number {
  return roundToMoneyStep(buildingType.earning * s.settings.incomeScale);
}

/**
 * Lo que ganara el equipo la ronda que viene si nada cambia: lo que pagan sus edificios menos el
 * mantenimiento de sus unidades (sin puntos de control: lo que se sabe seguro).
 */
export function projectedIncome(s: GameState, team: TeamId): number {
  const income = s.buildings.reduce(
    (total, building) => total + (building.owner === team ? buildingIncome(s, buildingTypeOf(s, building)) : 0),
    0,
  );
  return income - upkeepOf(s, team);
}

export interface BuyOption {
  unitType: UnitType;
  cost: number;
  affordable: boolean;
  /** Por que no se puede sacar (si no se puede): sin sitio en el ejercito o por lo que cuesta (sin dinero). */
  blocked?: ArmyLimit | ProductionShortage;
}

/** El edificio fabrica ese tipo de unidad (units.json, "builtAt"). */
const builds = (s: GameState, building: Building, unitType: UnitType): boolean => unitType.builtAt.includes(buildingTypeOf(s, building).id);

/** Por que el equipo no puede sacar ahora una unidad de ese tipo (undefined = puede): el ejercito, y luego la produccion. */
function buyBlock(s: GameState, team: TeamId, unitType: UnitType): BuyOption['blocked'] {
  return armyLimit(s, team, unitType) ?? productionOf(s).shortage(s, team, unitType);
}

/** Tipos que fabrica un edificio, en el orden de units.json, lo que cuesta cada uno y si se puede sacar ahora. */
export function buyOptions(s: GameState, building: Building): BuyOption[] {
  if (building.owner === null) return [];
  const team = building.owner;
  const production = productionOf(s);
  const toOption = (unitType: UnitType): BuyOption => {
    const blocked = buyBlock(s, team, unitType);
    const cost = production.price(s, team, unitType);
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
 * que ser suyo, fabricarla, estar libre (y la casilla ser de su tipo de movimiento), que quepa en el
 * ejercito y que la produccion de la partida lo permita (comprando, que haya dinero).
 */
export function buyProblem(s: GameState, team: TeamId, building: Building, unitType: UnitType): ActionRejection | null {
  if (building.owner !== team) return 'notYours';
  if (!builds(s, building, unitType)) return 'notBuiltHere';
  if (!isWalkable(s, building, unitType.movement)) return 'occupied';
  return buyBlock(s, team, unitType) ?? null;
}

/**
 * El equipo `team` fabrica una unidad en su edificio, ya comprobado (buyProblem): se gasta lo que diga
 * la produccion de la partida (comprando, su precio) y nace sin poder actuar hasta la ronda siguiente.
 */
export function buildUnit(s: GameState, team: TeamId, building: Building, unitType: UnitType): Unit {
  productionOf(s).spend(s, team, unitType);
  return newUnit(s, unitType, team, building, 'done');
}
