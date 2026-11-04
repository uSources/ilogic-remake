import { MAX_FUNDS, RULES, UNIT } from '../../core/data';
import { buildingIncome, commandUsed, score, upkeepOf, type BuyOption } from '../../core/rules';
import type { GameState, Team } from '../../core/model';
import type { BreakdownLineVM, DayInfoVM, EconomyVM } from '../../hud/store';
import { buildingLabel, t, unitLabel } from '../../settings';

/** Dinero y dias: por que no se puede comprar, desglose del dinero y del dia (barra de arriba). */

/** Por que no se puede comprar una unidad (menu de compra y aviso). */
export function buyBlockedText(b: NonNullable<BuyOption['blocked']>): string {
  switch (b) {
    case 'funds':
      return t('cantAfford');
    case 'units':
      return t('unitLimit').replace('{n}', String(RULES.maxUnits));
    case 'command':
      return t('commandLimit').replace('{n}', String(RULES.commandPoints ?? 0));
  }
}
/** Cuenta por tipo y multiplica: filas "3 × Ciudad". Orden: de mas a menos cantidad. */
function tally(types: number[], label: (t: number) => string, each: (t: number) => number): BreakdownLineVM[] {
  const counts = new Map<number, number>();
  for (const t of types) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts]
    .map(([t, count]) => ({ label: label(t), count, amount: count * each(t) }))
    .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));
}

/**
 * Desglose del dinero de un bando: ingresos por tipo de edificio, mantenimiento por tipo de unidad,
 * lo que queda por dia, con cuanto se empieza el proximo turno y los puntos de mando por tipo. Mismas
 * cuentas que endRound (las cifras de cada fila de mantenimiento son su parte sin redondear; el total
 * es el que se cobra, redondeado a 100).
 */
export function economyVM(s: GameState, team: Team): EconomyVM {
  const owned = s.buildings.filter((b) => b.owner === team).map((b) => b.type);
  const units = s.units.filter((u) => u.team === team).map((u) => u.type);
  const income = owned.reduce((n, t) => n + buildingIncome(t), 0);
  const upkeep = upkeepOf(s, team);
  // endRound cobra primero y despues paga lo que pueda del mantenimiento.
  const afterIncome = s.funds[team] + income;
  const paid = Math.min(upkeep, afterIncome);
  return {
    income: { lines: tally(owned, buildingLabel, buildingIncome), total: income, scale: RULES.incomeScale },
    upkeep:
      RULES.upkeep > 0
        ? { lines: tally(units, unitLabel, (t) => Math.round(UNIT.cost[t]! * RULES.upkeep)), total: upkeep, rate: RULES.upkeep }
        : null,
    net: income - upkeep,
    next: Math.min(afterIncome - paid, MAX_FUNDS),
    shortfall: paid < upkeep ? paid : null,
    command:
      RULES.commandPoints === null
        ? null
        : { lines: tally(units, unitLabel, (t) => UNIT.command[t]!), used: commandUsed(s, team), max: RULES.commandPoints },
  };
}

/** Desglose del dia: limite, dias que quedan y puntos si se acabase ahora. */
export function dayInfoVM(s: GameState): DayInfoVM {
  const limit = RULES.dayLimit;
  return {
    day: s.day,
    limit,
    left: limit === null ? null : Math.max(0, limit - s.day + 1),
    score: limit === null ? null : [score(s, 0), score(s, 1)],
  };
}
