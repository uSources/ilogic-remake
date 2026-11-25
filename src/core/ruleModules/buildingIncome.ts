/**
 * Ingresos de los edificios: al acabar la ronda, cada edificio con dueño le paga lo suyo (su
 * `earning` por el ajuste `incomeScale`; la cuenta en rules/economy.ts, `buildingIncome`). Es un
 * modulo, como el mantenimiento: una partida que no cobra por edificios (`incomeScale` a 0, que un
 * modo puede fijar con `fixedSettings`) no lo lleva. La cura sobre edificios propios no es de aqui:
 * la hacen todas las partidas (rules/round.ts).
 */
import { buildingTypeOf } from '../gameContent';
import type { GameEvent, GameState } from '../model';
import { buildingIncome } from '../rules/economy';
import { earn } from '../rules/funds';
import { addForTeam, perTeam, teamIds } from '../teams';
import type { RuleModule } from './hooks';

/** Cada edificio con dueño le paga: un suceso por equipo que cobra algo. */
function collectBuildingIncome(s: GameState): GameEvent[] {
  const income = perTeam(s, () => 0);
  for (const building of s.buildings) {
    if (building.owner === null) continue;
    const earned = buildingIncome(s, buildingTypeOf(s, building));
    earn(s, building.owner, earned);
    addForTeam(income, building.owner, earned);
  }
  return teamIds(s)
    .filter((team) => income[team])
    .map((team): GameEvent => ({ kind: 'income', actor: null, team, amount: income[team] ?? 0, source: 'buildings' }));
}

export const BUILDING_INCOME: RuleModule = {
  id: 'buildingIncome',
  isOn: (settings) => settings.incomeScale > 0,
  hooks: {
    roundPhases: [{ id: 'buildingIncome', stage: 'income', run: collectBuildingIncome }],
  },
};
