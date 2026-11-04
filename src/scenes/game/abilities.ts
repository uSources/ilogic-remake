/**
 * Habilidades del general del jugador desde su panel: las de area pasan a elegir casilla (fase
 * 'target'); el resto se usan ya. La animacion esta en playback.ts (evento 'ability').
 */
import { mapGrid } from '../../core/mapGrid';
import { abilityArea, abilityBlock, generalOf, useAbility } from '../../core/generals';
import { squareArea } from '../../core/geom';
import type { GameEvent, GameState, Pos } from '../../core/model';
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
    if (!this.abilityById(id)) return;
    const block = abilityBlock(h.state, 0, id);
    if (block === 'target') {
      h.abandonSelection();
      h.phase = 'target';
      this.targeting = id;
      return h.refresh();
    }
    if (block) return showToast(t(block === 'used' ? 'genUsed' : 'genCharge'));
    if (h.phase === 'target') h.toMap();
    const event = useAbility(h.state, 0, id);
    if (event) await h.play([event]);
  }

  /** Casillas que tocaria la habilidad que se apunta si se lanza en `c` (dentro del mapa). */
  area(c: Pos): Pos[] {
    const ability = this.targeting ? this.abilityById(this.targeting) : undefined;
    const radius = ability ? abilityArea(ability) : null;
    if (radius === null) return [];
    return squareArea(mapGrid(this.h.state), c, radius);
  }

  /** Habilidad del general del jugador con ese id (undefined si no tiene general o no la tiene). */
  private abilityById(id: string) {
    return generalOf(this.h.state, 0)?.def.abilities.find((ability) => ability.id === id);
  }

  /** Lanzar la habilidad que se apunta en `c`. */
  async fire(c: Pos): Promise<void> {
    const h = this.h;
    const id = this.targeting;
    if (!id) return h.toMap();
    const event = useAbility(h.state, 0, id, c);
    h.toMap();
    if (event) await h.play([event]);
  }
}
