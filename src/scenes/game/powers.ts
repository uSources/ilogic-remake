/**
 * Poderes del general del jugador desde su panel: los de area pasan a elegir casilla (fase
 * 'target'); el resto se usan ya. La animacion esta en playback.ts (evento 'power').
 */
import { mapGrid } from '../../core/mapGrid';
import { powerArea, powerBlock, generalOf, usePower } from '../../core/generals';
import { squareArea } from '../../core/geom';
import type { GameEvent, GameState, Pos, TeamId } from '../../core/model';
import { showToast } from '../../hud/store';
import { t } from '../../settings';
import type { Phase } from './types';

/** Lo que los poderes necesitan de la escena. */
export interface PowerHost {
  readonly state: GameState;
  /** El equipo que juega la persona en esta pantalla (el que mira). */
  readonly viewer: TeamId;
  phase: Phase;
  abandonSelection(): void;
  toMap(): void;
  refresh(): void;
  play(events: GameEvent[]): Promise<void>;
}

export class GeneralPowers {
  /** Poder del general que se esta apuntando (fase 'target'). */
  targeting: string | null = null;

  constructor(private readonly host: PowerHost) {}

  /** Poder elegido en el panel: los de area pasan a elegir casilla; el resto se usan ya. */
  async start(id: string): Promise<void> {
    const host = this.host;
    if (!this.powerById(id)) return;
    const block = powerBlock(host.state, 0, id);
    if (block === 'target') {
      host.abandonSelection();
      host.phase = 'target';
      this.targeting = id;
      return host.refresh();
    }
    if (block) return showToast(t(block === 'used' ? 'genUsed' : 'genCharge'));
    if (host.phase === 'target') host.toMap();
    const event = usePower(host.state, host.viewer, id);
    if (event) await host.play([event]);
  }

  /** Casillas que tocaria el poder que se apunta si se lanza en `c` (dentro del mapa). */
  area(target: Pos): Pos[] {
    const power = this.targeting ? this.powerById(this.targeting) : undefined;
    const radius = power ? powerArea(power) : null;
    if (radius === null) return [];
    return squareArea(mapGrid(this.host.state), target, radius);
  }

  /** Poder del general del jugador con ese id (undefined si no tiene general o no la tiene). */
  private powerById(id: string) {
    return generalOf(this.host.state, this.host.viewer)?.definition.powers.find((power) => power.id === id);
  }

  /** Lanzar el poder que se apunta en `c`. */
  async fire(target: Pos): Promise<void> {
    const host = this.host;
    const id = this.targeting;
    if (!id) return host.toMap();
    const event = usePower(host.state, host.viewer, id, target);
    host.toMap();
    if (event) await host.play([event]);
  }
}
