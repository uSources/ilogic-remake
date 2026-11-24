/**
 * Pantalla de «Jugar en línea»: enlaza sus tres pantallas (el menu con «Buscar rival», el codigo y
 * «Mis partidas», crear partida y el vestibulo; una por modulo en esta carpeta) y les reparte las
 * ordenes del menu: el foco (una rejilla por pantalla, `navGrid`), lo que se pulsa y lo que se publica
 * a la interfaz (`OnlineVM`). Lo que es de todas (el foco, el aviso de error, «esperando al servidor»,
 * entrar en una sala por su codigo, buscar rival y cancelar la busqueda) vive aqui y las pantallas lo
 * tocan por `OnlineScreens`. La escena del menu solo ve esta clase; pide a la escena lo poco que usa
 * (`OnlineHost`).
 */
import type { MenuCommand } from '../../controls/menu';
import { MAX_AVOIDED_ROOMS, type SearchPace } from '../../core/net';
import { ui, type UIActions } from '../../hud/store';
import { forgetRoom, readOnlineRooms, type OnlineRoomEntry } from '../../net/onlineRooms';
import { claimSeat, closeRoom, searchRival, type ApiResult } from '../../net/roomApi';
import { serverUrl } from '../../net/serverUrl';
import { t, type TextKey } from '../../settings';
import { navGrid } from '../nav';
import { CreateScreen } from './createScreen';
import { LobbyScreen } from './lobbyScreen';
import { MenuScreen } from './menuScreen';
import type { KnownSeat, Mode, OnlineHost, OnlineScreens } from './shared';

export { isTypingRoomCode } from './menuScreen';
export type { OnlineHost } from './shared';

/** Por que no se ha podido entrar con un codigo (lo que contesta el servidor al pedir asiento). */
const CLAIM_ERROR_TEXT: Partial<Record<string, TextKey>> = {
  noSuchRoom: 'onlineNoSuchRoom',
  badCode: 'onlineNoSuchRoom',
  notWaiting: 'onlineAlreadyStarted',
  noFreeSeat: 'onlineRoomFull',
};

const SEARCH_ERROR_TEXT: Partial<Record<string, TextKey>> = { tooManySearches: 'onlineTooManySearches', serverFull: 'onlineServerFull' };

/** Al cancelar la busqueda: si ya no espera es que acaba de llegar un rival (la partida sigue). */
const CANCEL_ERROR_TEXT: Partial<Record<string, TextKey>> = { notWaiting: 'onlineRivalArrived' };

/** Cerrar la sala, o que ya no exista (caduco, o se cerro desde otra pestaña): para quien cancela, lo mismo. */
async function closedOrGone(base: string, entry: OnlineRoomEntry): Promise<ApiResult<unknown>> {
  const closed = await closeRoom(base, entry.code, entry.token);
  return !closed.ok && closed.error === 'noSuchRoom' ? { ok: true, value: null } : closed;
}

/** Las salas propias que esperan rival: quien busca no tiene que caer en una de ellas. */
const ownSearchRooms = (): string[] =>
  readOnlineRooms()
    .filter((room) => room.search !== undefined && room.status === 'waiting')
    .map((room) => room.code)
    .slice(0, MAX_AVOIDED_ROOMS);

export class OnlineScreen implements OnlineScreens {
  private mode: Mode = 'menu';
  focus = 'search';
  error: string | null = null;
  busy = false;

  private readonly menu = new MenuScreen(this);
  private readonly create = new CreateScreen(this);
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
      onlineText: (text) => this.menu.setText(text),
    };
  }

  /** Abre la pantalla en su menu. */
  open(): void {
    this.lobby.reset();
    this.error = serverUrl() ? null : t('onlineUnavailable');
    this.create.reset();
    ui.set({ screen: 'online' });
    this.toMenu();
  }

  /**
   * Abre la pantalla directamente en una sala (un enlace al cargar la pagina): con la ficha de un
   * asiento, en ese asiento; con solo el codigo (el enlace de la sala), pidiendo uno.
   */
  openRoom(code: string, token: string | null): void {
    this.open();
    if (token) this.joinRoom(code, token);
    else this.enterRoom(code);
  }

  /** Al cerrar la escena del menu: nada queda esperando. */
  destroy(): void {
    this.menu.close();
    this.lobby.leave();
  }

  /** Es el cuadro del codigo el que escribe. */
  typingCommand(command: MenuCommand): void {
    if (command.kind === 'ok') return this.menu.enterFromText();
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
    if (mode !== 'menu') this.menu.close();
    this.mode = mode;
    this.focus = focus;
  }

  joinRoom(code: string, token: string, known?: KnownSeat): void {
    this.lobby.join(code, token, this.create.teamCount, known);
  }

  /** Con el asiento que este navegador ya tiene en la sala, si lo tiene; si no, pide uno libre al servidor. */
  enterRoom(code: string): void {
    const mine = readOnlineRooms().find((room) => room.code === code);
    if (mine) return this.joinRoom(mine.code, mine.token);
    void this.claimAndJoin(code);
  }

  searchRival(pace: SearchPace): void {
    void this.searchAndJoin(pace);
  }

  async cancelSearch(entry: OnlineRoomEntry): Promise<boolean> {
    const closed = await this.askServer((base) => closedOrGone(base, entry), CANCEL_ERROR_TEXT);
    if (!closed.ok) return false;
    forgetRoom(entry.code);
    return true;
  }

  toMenu(): void {
    this.menu.open();
    this.publish();
  }

  publish(): void {
    ui.set({
      online: {
        mode: this.mode,
        focus: this.focus,
        ...this.menu.vm(),
        create: this.create.vm(),
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
      case 'lobby':
        return this.lobby.rows();
      default:
        return this.mode satisfies never;
    }
  }

  private moveFocus(dx: number, dy: number): void {
    this.focus = navGrid(this.rows(), this.focus, dx, dy);
    this.publish();
  }

  private back(): void {
    if (this.mode === 'menu') {
      this.menu.close();
      return this.host.toHome();
    }
    this.lobby.leave();
    this.error = null;
    this.toMenu();
  }

  /** Lo que tiene el foco: una fila de opciones cambia de valor; lo demas lo atiende su pantalla (los ids no se repiten). */
  private pick(): void {
    const focus = this.focus;
    if (this.create.isChoiceRow(focus)) return this.create.stepChoice(focus, 1);
    if (focus === 'back' || focus === 'leave') return this.back();
    if (focus === 'create') return this.create.open();
    if (this.create.pick(focus) || this.menu.pick(focus)) return;
    this.lobby.pick(focus);
  }

  /** Pide un asiento libre de la sala (con su codigo) y, si lo da, entra en el. */
  private async claimAndJoin(code: string): Promise<void> {
    const claimed = await this.askServer((base) => claimSeat(base, code), CLAIM_ERROR_TEXT);
    if (!claimed.ok) return;
    const { token, seat, team } = claimed.value;
    this.joinRoom(code, token, { seat, team });
  }

  /** Busca rival y entra en la sala: con rival, la partida empieza enseguida; si no, el vestibulo de la propia busqueda. */
  private async searchAndJoin(pace: SearchPace): Promise<void> {
    const found = await this.askServer((base) => searchRival(base, { pace, avoid: ownSearchRooms() }), SEARCH_ERROR_TEXT);
    if (!found.ok) return;
    const { code, token, seat, team, matched } = found.value;
    this.joinRoom(code, token, { seat, team, search: matched ? undefined : pace, found: pace });
  }

  /**
   * Una peticion al servidor, de una en una y con «esperando» mientras dura. Si no sale, su aviso
   * (`errorText`, o «no se ha podido hablar con el servidor»).
   */
  private async askServer<Value>(
    call: (base: string) => Promise<ApiResult<Value>>,
    errorText: Partial<Record<string, TextKey>>,
  ): Promise<ApiResult<Value>> {
    const base = serverUrl();
    if (!base || this.busy) return { ok: false, error: 'busy' };
    this.busy = true;
    this.error = null;
    this.publish();
    const result = await call(base);
    this.busy = false;
    if (!result.ok) this.error = t(errorText[result.error] ?? 'onlineFailed');
    this.publish();
    return result;
  }
}
