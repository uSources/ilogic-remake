import { unitTypeOf, buildingTypeOf } from '../../core/gameContent';
import { allianceScore, buildingIncome, commandUsed, isRuleOn, rivalScore, upkeepOf, type BuyOption, buildingsOf } from '../../core/rules';
import { teamState } from '../../core/teams';
import type { Texts } from '../../core/content';
import type { GameState, TeamId } from '../../core/model';
import type { BreakdownLineVM, DayInfoVM, EconomyVM } from '../../hud/store';
import { nameOf, t } from '../../settings';

/** Dinero y dias: por que no se puede comprar, desglose del dinero y del dia (barra de arriba). */

/** Por que no se puede comprar una unidad (menu de compra y aviso). */
export function buyBlockedText(s: GameState, blocked: NonNullable<BuyOption['blocked']>): string {
  switch (blocked) {
    case 'funds':
      return t('cantAfford');
    case 'units':
      return t('unitLimit').replace('{n}', String(s.settings.maxUnits));
    case 'command':
      return t('commandLimit').replace('{n}', String(s.settings.commandPoints ?? 0));
  }
}
/** Un tipo del contenido (unidad o edificio): se cuenta por el y se enseña su nombre. */
type Named = { readonly name: Texts };

/** Cuenta por tipo y multiplica: filas "3 × Ciudad". Orden: de mas a menos cantidad. */
function tally<T extends Named>(types: readonly T[], each: (type: T) => number): BreakdownLineVM[] {
  const counts = new Map<T, number>();
  for (const type of types) counts.set(type, (counts.get(type) ?? 0) + 1);
  return [...counts]
    .map(([type, count]) => ({ label: nameOf(type), count, amount: count * each(type) }))
    .sort((first, second) => second.amount - first.amount || first.label.localeCompare(second.label));
}

/**
 * Desglose del dinero de un equipo: ingresos por tipo de edificio, mantenimiento por tipo de unidad,
 * lo que queda por dia, con cuanto se empieza el proximo turno y los puntos de mando por tipo. Mismas
 * cuentas que endRound (las cifras de cada fila de mantenimiento son su parte sin redondear; el total
 * es el que se cobra, redondeado a 100).
 */
export function economyVM(s: GameState, team: TeamId): EconomyVM {
  const owned = buildingsOf(s, team).map((building) => buildingTypeOf(s, building));
  const units = s.units.filter((unit) => unit.team === team).map((unit) => unitTypeOf(s, unit));
  const income = owned.reduce((sum, buildingType) => sum + buildingIncome(s, buildingType), 0);
  const upkeep = upkeepOf(s, team);
  // endRound cobra primero y despues paga lo que pueda del mantenimiento.
  const afterIncome = teamState(s, team).funds + income;
  const paid = Math.min(upkeep, afterIncome);
  return {
    income: {
      lines: tally(owned, (buildingType) => buildingIncome(s, buildingType)),
      total: income,
      scale: s.settings.incomeScale,
    },
    upkeep: isRuleOn(s, 'upkeep')
      ? {
          lines: tally(units, (unitType) => Math.round(unitType.cost * s.settings.upkeep)),
          total: upkeep,
          rate: s.settings.upkeep,
        }
      : null,
    net: income - upkeep,
    next: Math.min(afterIncome - paid, s.content.maxFunds),
    shortfall: paid < upkeep ? paid : null,
    commandPoints:
      s.settings.commandPoints === null
        ? null
        : {
            lines: tally(units, (unitType) => unitType.command),
            used: commandUsed(s, team),
            max: s.settings.commandPoints,
          },
  };
}

/**
 * Desglose del dia para el equipo que mira: limite, dias que quedan y puntos si se acabase ahora (los
 * de su alianza y los de la mejor alianza enemiga).
 */
export function dayInfoVM(s: GameState, viewer: TeamId): DayInfoVM {
  const limit = s.settings.dayLimit;
  return {
    day: s.day,
    limit,
    left: limit === null ? null : Math.max(0, limit - s.day + 1),
    score: limit === null ? null : [allianceScore(s, viewer), rivalScore(s, viewer)],
  };
}
