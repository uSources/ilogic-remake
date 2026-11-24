/**
 * Puntos de mando (ajuste `commandPoints`; sin el, null): el ejercito tiene un tope y cada unidad
 * ocupa los puntos de su tipo (units.json, "command"; la cuenta, `commandUsed` de rules/economy.ts).
 * Es un tope del ejercito mas (`armyLimits`), detras del numero de unidades.
 */
import type { UnitType } from '../content';
import type { GameState, TeamId } from '../model';
import { commandUsed } from '../rules/economy';
import type { RuleModule } from './hooks';

/** Con esa unidad, el equipo pasaria de sus puntos de mando. */
function exceedsCommand(s: GameState, team: TeamId, unitType: UnitType): boolean {
  const points = s.settings.commandPoints;
  return points !== null && commandUsed(s, team) + unitType.command > points;
}

export const COMMAND_POINTS: RuleModule = {
  id: 'commandPoints',
  isOn: (settings) => settings.commandPoints !== null,
  hooks: { armyLimits: [{ id: 'command', blocks: exceedsCommand }] },
};
