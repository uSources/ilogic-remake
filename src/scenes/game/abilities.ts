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

  constructor(private readonly host: AbilityHost) {}

  /** Habilidad elegida en el panel: las de area pasan a elegir casilla; el resto se usan ya. */
  async start(id: string): Promise<void> {
    const host = this.host;
    if (!this.abilityById(id)) return;
    const block = abilityBlock(host.state, 0, id);
    if (block === 'target') {
      host.abandonSelection();
      host.phase = 'target';
      this.targeting = id;
      return host.refresh();
    }
    if (block) return showToast(t(block === 'used' ? 'genUsed' : 'genCharge'));
    if (host.phase === 'target') host.toMap();
    const event = useAbility(host.state, 0, id);
    if (event) await host.play([event]);
  }

  /** Casillas que tocaria la habilidad que se apunta si se lanza en `c` (dentro del mapa). */
  area(target: Pos): Pos[] {
    const ability = this.targeting ? this.abilityById(this.targeting) : undefined;
    const radius = ability ? abilityArea(ability) : null;
    if (radius === null) return [];
    return squareArea(mapGrid(this.host.state), target, radius);
  }

  /** Habilidad del general del jugador con ese id (undefined si no tiene general o no la tiene). */
  private abilityById(id: string) {
    return generalOf(this.host.state, 0)?.definition.abilities.find((ability) => ability.id === id);
  }

  /** Lanzar la habilidad que se apunta en `c`. */
  async fire(target: Pos): Promise<void> {
    const host = this.host;
    const id = this.targeting;
    if (!id) return host.toMap();
    const event = useAbility(host.state, 0, id, target);
    host.toMap();
    if (event) await host.play([event]);
  }
}
