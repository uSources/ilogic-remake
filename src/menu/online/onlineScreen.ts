/**
 * Pantalla de «Jugar en línea»: enlaza sus cuatro pantallas (el menu con «Mis partidas», crear
 * sala, entrar con enlace y el vestibulo; una por modulo en esta carpeta) y les reparte las ordenes
 * del menu: el foco (una rejilla por pantalla, `navGrid`), lo que se pulsa y lo que se publica a la
 * interfaz (`OnlineVM`). Lo que es de todas (el foco, el aviso de error, «esperando al servidor»)
 * vive aqui y las pantallas lo tocan por `OnlineScreens`. La escena del menu (MenuScene) solo ve
 * esta clase; pide a la escena lo poco que usa (`OnlineHost`).
 */
import type { MenuCommand } from '../../controls/menu';
import { ui, type UIActions } from '../../hud/store';
import { serverUrl } from '../../net/serverUrl';
import { t } from '../../settings';
import { navGrid } from '../nav';
import { CreateScreen } from './createScreen';
import { JoinScreen } from './joinScreen';
import { LobbyScreen } from './lobbyScreen';
import { MenuScreen } from './menuScreen';
import type { KnownSeat, Mode, OnlineHost, OnlineScreens } from './shared';

export { isTypingInvite } from './joinScreen';
export type { OnlineHost } from './shared';

export class OnlineScreen implements OnlineScreens {
  private mode: Mode = 'menu';
  focus = 'create';
  error: string | null = null;
  busy = false;

  private readonly menu = new MenuScreen(this);
  private readonly create = new CreateScreen(this);
  private readonly join = new JoinScreen(this);
  private readonly lobby = new LobbyScreen(this);

  constructor(readonly host: OnlineHost) {}

  actions(): Partial<UIActions> {
    return {
      onlineHover: (id) => {
        this.focus = id;
        this.publish();
      },
      onlinePick: (id) => {
        this.focus = id;
        this.pick();
      },
      onlineSet: (id, index) => {
        this.focus = id;
        this.create.setChoice(id, index);
      },
      onlineText: (text) => this.join.setText(text),
    };
  }

  /** Abre la pantalla en su menu. */
  open(): void {
    this.lobby.reset();
    this.mode = 'menu';
    this.focus = 'create';
    this.error = serverUrl() ? null : t('onlineUnavailable');
    this.create.reset();
    ui.set({ screen: 'online' });
    this.publish();
  }

  /** Abre la pantalla directamente en una sala (un enlace de invitacion al cargar, o «Volver a entrar»). */
  openRoom(code: string, token: string): void {
    this.open();
    this.joinRoom(code, token);
  }

  /** Al cerrar la escena del menu: nada queda esperando. */
  destroy(): void {
    this.lobby.leave();
  }

  /** Es el cuadro de texto del enlace el que escribe. */
  typingCommand(command: MenuCommand): void {
    if (command.kind === 'ok') return this.join.joinFromText();
    if (command.kind !== 'back' && !(command.kind === 'move' && command.dy)) return;
    (document.activeElement as HTMLElement).blur();
    if (command.kind === 'move') this.moveFocus(0, command.dy);
  }

  command(command: MenuCommand): void {
    const dx = command.kind === 'move' ? command.dx : 0;
    if (dx && this.create.isChoiceRow(this.focus)) return this.create.stepChoice(this.focus, dx);
    if (command.kind === 'move') return this.moveFocus(command.dx, command.dy);
    if (command.kind === 'ok' && !command.repeat) return this.pick();
    if (command.kind === 'reroll' && this.mode === 'create') return this.create.reroll();
    if (command.kind === 'back') this.back();
  }

  // --- Lo que piden las pantallas (OnlineScreens) ----------------------------------------------

  show(mode: Mode, focus: string): void {
    this.mode = mode;
    this.focus = focus;
  }

  joinRoom(code: string, token: string, known?: KnownSeat): void {
    this.lobby.join(code, token, this.create.teamCount, known);
  }

  publish(): void {
    ui.set({
      online: {
        mode: this.mode,
        focus: this.focus,
        rooms: this.menu.rooms(),
        create: this.create.vm(),
        join: this.join.vm(),
        lobby: this.lobby.vm(),
        error: this.error,
        busy: this.busy,
      },
    });
  }

  // --- Foco y lo que se pulsa --------------------------------------------------------------------

  /** La rejilla del foco de la pantalla que se ve. */
  private rows(): string[][] {
    switch (this.mode) {
      case 'menu':
        return this.menu.rows();
      case 'create':
        return this.create.rows();
      case 'join':
        return this.join.rows();
      case 'lobby':
        return this.lobby.rows();
    }
  }

  private moveFocus(dx: number, dy: number): void {
    this.focus = navGrid(this.rows(), this.focus, dx, dy);
    this.publish();
  }

  private back(): void {
    if (this.mode === 'menu') return this.host.toHome();
    this.lobby.leave();
    this.mode = 'menu';
    this.focus = 'create';
    this.error = null;
    this.publish();
  }

  /** Lo que tiene el foco: una fila de opciones cambia de valor; lo demas lo atiende su pantalla (los ids no se repiten). */
  private pick(): void {
    const focus = this.focus;
    if (this.create.isChoiceRow(focus)) return this.create.stepChoice(focus, 1);
    if (focus === 'back' || focus === 'leave') return this.back();
    if (focus === 'create') return this.create.open();
    if (focus === 'join') return this.join.open();
    if (this.create.pick(focus) || this.join.pick(focus) || this.menu.pick(focus)) return;
    this.lobby.pick(focus);
  }
}
