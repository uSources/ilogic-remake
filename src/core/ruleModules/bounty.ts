/** [CAMBIO] Botin (ajuste `bounty`): quien destruye una unidad cobra ese tanto por uno de su precio (atacar sale a cuenta). */
import { unitTypeOf } from '../gameContent';
import type { GameState, Unit } from '../model';
import { fallenIn, type AttackRecord } from '../rules/attackRecord';
import { earn } from '../rules/funds';
import type { RuleModule } from './hooks';
import { isRuleOn } from './ruleset';

/** Lo que se cobra por destruir una unidad como `lost` (0 si la partida no lleva botin). */
export function bountyFor(s: GameState, lost: Pick<Unit, 'type'>): number {
  return isRuleOn(s, 'bounty') ? Math.round(unitTypeOf(s, lost).cost * s.settings.bounty) : 0;
}

declare module '../model/combat' {
  interface AttackRecordParts {
    /**
     * [CAMBIO] Dinero cobrado por destruir una unidad (para quien la destruyo), entero: si pasa del
     * maximo, lo que se pierde lo cuenta un suceso 'fundsCapped' de la misma accion. Si es 0, no esta.
     */
    bounty: number;
  }
}

/** El equipo de quien ha destruido a la otra cobra su botin (y lo apunta en el ataque). */
function payBounty(s: GameState, attack: AttackRecord): void {
  const fallen = fallenIn(attack);
  if (!fallen) return;
  const bounty = bountyFor(s, fallen.loser);
  if (bounty) attack.parts.bounty = bounty;
  earn(s, fallen.winner.team, bounty);
}

export const BOUNTY: RuleModule = {
  id: 'bounty',
  isOn: (settings) => settings.bounty > 0,
  hooks: { combatSteps: [{ id: 'bounty', stage: 'kill', run: payBounty }] },
};
