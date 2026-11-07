/**
 * [CAMBIO] Mantenimiento (ajuste `upkeep`, el tanto por uno del precio del ejercito que se paga cada
 * ronda; la cuenta en rules/economy.ts, `upkeepOf`). Sin dinero no hay castigo: se paga lo que haya.
 */
import type { GameEvent, GameState } from '../model';
import { upkeepOf } from '../rules/economy';
import { pay } from '../rules/funds';
import { perTeam, teamIds } from '../teams';
import type { RuleModule } from './hooks';

declare module '../model/roundReport' {
  interface RoundReportParts {
    /** Mantenimiento pagado por cada equipo (si no llega el dinero, se paga lo que hay). */
    upkeep: number[];
  }
}

/** Cada equipo paga lo de su ejercito: un suceso por equipo que paga algo. */
function payUpkeep(s: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  for (const team of teamIds(s)) {
    const paid = pay(s, team, upkeepOf(s, team));
    if (paid > 0) events.push({ kind: 'upkeep', actor: null, team, amount: paid });
  }
  return events;
}

export const UPKEEP: RuleModule = {
  id: 'upkeep',
  isOn: (settings) => settings.upkeep > 0,
  hooks: {
    // Despues de cobrar, para que se pague con lo de hoy.
    roundPhases: [{ id: 'upkeep', stage: 'costs', run: payUpkeep }],
    roundReportParts: [
      {
        id: 'upkeep',
        add: (s, report, event) => {
          if (event.kind !== 'upkeep') return;
          report.upkeep ??= perTeam(s, () => 0);
          report.upkeep[event.team] = event.amount;
        },
      },
    ],
  },
};
