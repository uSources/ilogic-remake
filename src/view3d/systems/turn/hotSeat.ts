/**
 * Varias personas en la misma pantalla, por turnos (el rival «Persona» de Nueva partida): quien mira
 * es la persona a la que le toca. Cuando el turno pasa a otra, la vista se pone a verlo como ella (sus
 * colores, su niebla, su camara) detras del aviso de cambio de jugador (hud/overlays/Handoff.tsx), que
 * tapa la partida entera hasta que la siguiente dice que esta lista: asi no ve lo de la anterior, ni
 * la anterior lo suyo. Con una sola persona no sale nunca, y por la red no se usa (cada pantalla
 * juega un asiento). Con el aviso delante, el teclado es suyo (es un KeyPanel): Enter o Espacio.
 */
import type { MenuCommand, MenuContext } from '../../../controls/menu';
import type { TeamId } from '../../../core/model';
import { shownTeamNumber } from '../../../core/teams';
import { ui } from '../../../hud/store';
import type { KeyPanel } from '../input/keyInput';
import type { Onlooker } from './matchRunner';

/** La pantalla pasa de una persona a otra: quien mira era el equipo `from` y ahora es `to`. */
export interface ScreenPass {
  readonly from: TeamId;
  readonly to: TeamId;
}

/** La vista se pone a ver la partida como el equipo que la recibe (aun tapada por el aviso). */
export type PassScreen = (pass: ScreenPass) => void;

export class HotSeat implements Onlooker, KeyPanel {
  /** Lo que sigue cuando la siguiente persona este lista (null: no hay aviso delante). */
  private whenReady: (() => void) | null = null;

  constructor(
    private viewer: TeamId,
    private readonly passScreen: PassScreen,
  ) {}

  /** El equipo que mira ahora. */
  get team(): TeamId {
    return this.viewer;
  }

  /** El aviso tapa la partida (se espera a la siguiente persona). */
  get isOpen(): boolean {
    return this.whenReady !== null;
  }

  /**
   * Le toca a `team`: si no es quien mira, la partida se tapa, la vista pasa a ser suya (asi el aviso
   * ya esta delante cuando se pinta como la ve el) y se espera a que diga que esta lista.
   */
  async handTo(team: TeamId): Promise<void> {
    const from = this.viewer;
    if (team === from) return;
    ui.set({ handoff: { team: shownTeamNumber(team) } });
    this.viewer = team;
    this.passScreen({ from, to: team });
    await new Promise<void>((resolve) => {
      this.whenReady = resolve;
    });
  }

  /** La siguiente persona esta lista («Empezar mi turno»): se quita el aviso y empieza su turno. */
  ready(): void {
    const whenReady = this.whenReady;
    if (!whenReady) return;
    this.whenReady = null;
    ui.set({ handoff: null });
    whenReady();
  }

  /** Que teclas valen con el aviso delante (MENU_BINDINGS.handoff). */
  context(): MenuContext {
    return 'handoff';
  }

  command(command: MenuCommand): void {
    if (command.kind === 'ok' && !command.repeat) this.ready();
  }
}
