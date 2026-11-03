/**
 * Economia y ejercito: ingresos, mantenimiento, limite de unidades y puntos de mando, y compra
 * (Building.Spawn).
 */
import { BUILDING, RULES, SPAWNER, UNIT, UNIT_TYPES, Movement } from '../data';
import type { Building, GameState, Team, Unit } from '../types';
import { newUnit } from './lifecycle';
import { isWalkable, teamUnits, unitAt } from './queries';

/** Puntos de mando que ocupan las unidades de un bando (regla commandPoints). */
export function commandUsed(s: GameState, team: Team): number {
  return teamUnits(s, team).reduce((n, u) => n + UNIT.command[u.type]!, 0);
}

/** Por que no cabe una unidad mas de ese tipo en el bando (null = cabe). */
export type ArmyLimit = 'units' | 'command';
export function armyLimit(s: GameState, team: Team, type: number): ArmyLimit | null {
  if (teamUnits(s, team).length >= RULES.maxUnits) return 'units';
  if (RULES.commandPoints !== null && commandUsed(s, team) + UNIT.command[type]! > RULES.commandPoints) return 'command';
  return null;
}

/**
 * [CAMBIO] Mantenimiento por ronda de un bando: el tanto por uno `upkeep` del precio de sus
 * unidades, redondeado a 100. Frena la acumulacion de ejercitos enormes (el original no lo tenia).
 */
export function upkeepOf(s: GameState, team: Team): number {
  if (RULES.upkeep <= 0) return 0;
  const value = teamUnits(s, team).reduce((n, u) => n + UNIT.cost[u.type]!, 0);
  return Math.round((value * RULES.upkeep) / 100) * 100;
}

/** Ingresos de un edificio por ronda con las reglas actuales (multiplos de 100). */
export function buildingIncome(type: number): number {
  return Math.round((BUILDING.earning[type]! * RULES.incomeScale) / 100) * 100;
}

export interface BuyOption {
  type: number;
  cost: number;
  affordable: boolean;
  /** Por que no se puede comprar (si no se puede): sin dinero o sin sitio en el ejercito. */
  blocked?: ArmyLimit | 'funds';
}

/** Tipos que fabrica un edificio, en orden de tipo, y si se pueden pagar ahora. */
export function buyOptions(s: GameState, b: Building): BuyOption[] {
  if (b.owner === null) return [];
  const team = b.owner;
  const out: BuyOption[] = [];
  for (let t = 0; t < UNIT_TYPES; t++) {
    if (!SPAWNER[t]![b.type]) continue;
    const cost = UNIT.cost[t]!;
    const blocked = armyLimit(s, team, t) ?? (cost > s.funds[team] ? 'funds' : undefined);
    out.push(blocked ? { type: t, cost, affordable: false, blocked } : { type: t, cost, affordable: true });
  }
  return out;
}

/** El edificio puede fabricar ahora (es de alguien, fabrica algo y la casilla esta libre). */
export function canBuyAt(s: GameState, b: Building): boolean {
  return b.owner !== null && buyOptions(s, b).length > 0 && !unitAt(s, b.x, b.y);
}

/** Fabrica una unidad: nace sin poder actuar hasta la ronda siguiente. */
export function spawn(s: GameState, b: Building, type: number): Unit | null {
  if (b.owner === null || !SPAWNER[type]![b.type]) return null;
  const team = b.owner;
  const cost = UNIT.cost[type]!;
  if (cost > s.funds[team] || armyLimit(s, team, type)) return null;
  if (!isWalkable(s, b.x, b.y, Movement.of(type))) return null;
  s.funds[team] -= cost;
  return newUnit(s, type, team, b.x, b.y, false);
}
