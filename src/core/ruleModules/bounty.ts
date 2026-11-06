/** [CAMBIO] Botin (ajuste `bounty`): quien destruye una unidad cobra ese tanto por uno de su precio (atacar sale a cuenta). */
import { unitTypeOf } from '../gameContent';
import type { GameState, Unit } from '../model';
import { fallenIn, type AttackRecord } from '../rules/attackRecord';
import { earn } from '../rules/funds';
import type { RuleModule } from './hooks';

/** Lo que se cobra por destruir una unidad como `lost` (0 sin botin). */
export function bountyFor(s: GameState, lost: Pick<Unit, 'type'>): number {
  return Math.round(unitTypeOf(s, lost).cost * s.rules.bounty);
}

/** El equipo de quien ha destruido a la otra cobra su botin. */
function payBounty(s: GameState, attack: AttackRecord): void {
  const fallen = fallenIn(attack);
  if (!fallen) return;
  attack.bounty = bountyFor(s, fallen.loser);
  earn(s, fallen.winner.team, attack.bounty);
}

export const BOUNTY: RuleModule = {
  id: 'bounty',
  isOn: (settings) => settings.bounty > 0,
  hooks: { combatSteps: [{ id: 'bounty', stage: 'kill', run: payBounty }] },
};
