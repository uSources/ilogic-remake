/**
 * Habilidades del general del jugador desde su panel: las de area pasan a elegir casilla (fase
 * 'target'); el resto se usan ya. La animacion esta en playback.ts (evento 'ability').
 */
import { MAP_H, MAP_W } from '../../core/data';
import { abilityArea, abilityBlock, areaTiles, generalOf, useAbility } from '../../core/generals';
import type { GameEvent, GameState, Pos } from '../../core/types';
import { showToast } from '../../hud/store';
import { t } from '../../settings';
import type { Phase } from './types';

/** Lo que las habilidades necesitan de la escena. */
export interface AbilityHost {
  readonly state: GameState;
  phase: Phase;
  abandonSelection(): void;
  toMap(): void;
  refresh(): void;
  play(events: GameEvent[]): Promise<void>;
}

export class GeneralAbilities {
  /** Habilidad del general que se esta apuntando (fase 'target'). */
  targeting: string | null = null;

  constructor(private readonly h: AbilityHost) {}

  /** Habilidad elegida en el panel: las de area pasan a elegir casilla; el resto se usan ya. */
  async start(id: string): Promise<void> {
    const h = this.h;
    const g = generalOf(h.state, 0);
    const a = g?.def.abilities.find((x) => x.id === id);
    if (!g || !a) return;
    const block = abilityBlock(h.state, 0, id);
    if (block === 'target') {
      h.abandonSelection();
      h.phase = 'target';
      this.targeting = id;
      return h.refresh();
    }
    if (block) return showToast(t(block === 'used' ? 'genUsed' : 'genCharge'));
    if (h.phase === 'target') h.toMap();
    const ev = useAbility(h.state, 0, id);
    if (ev) await h.play([ev]);
  }

  /** Casillas que tocaria la habilidad que se apunta si se lanza en `c` (dentro del mapa). */
  area(c: Pos): Pos[] {
    const a = this.targeting ? generalOf(this.h.state, 0)?.def.abilities.find((x) => x.id === this.targeting) : undefined;
    const r = a ? abilityArea(a) : null;
    if (r === null) return [];
    return areaTiles(c, r).filter((p) => p.x >= 0 && p.y >= 0 && p.x < MAP_W && p.y < MAP_H);
  }

  /** Lanzar la habilidad que se apunta en `c`. */
  async fire(c: Pos): Promise<void> {
    const h = this.h;
    const id = this.targeting;
    if (!id) return h.toMap();
    const ev = useAbility(h.state, 0, id, c);
    h.toMap();
    if (ev) await h.play([ev]);
  }
}
