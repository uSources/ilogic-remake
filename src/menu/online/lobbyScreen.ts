/**
 * El vestibulo de una sala: el codigo y el enlace de la sala para invitar (copiar y compartir: quien
 * lo abre, o escribe el codigo, se queda con un asiento libre), quien ha entrado (por `GET
 * /rooms/:code` cada pocos segundos) y «Sustituir por IA» de quien creo la sala. Si es la sala de la
 * propia busqueda de rival, en vez de invitar dice que se esta buscando, y se puede jugar contra la
 * IA o cancelar la busqueda. Es tambien quien
 * tiene la conexion con la sala (`OnlineMatch`): entra por el WebSocket al abrirse, apunta la sala en
 * «Mis partidas» y, cuando la sala juega (o ya acabo), le pasa la conexion a la escena
 * (`OnlineHost.startOnline`).
 */
import type { RoomStatus, SearchPace, SeatId } from '../../core/net';
import { shownTeamNumber } from '../../core/teams';
import { ui, type OnlineSeatVM, type OnlineVM } from '../../hud/store';
import { OnlineMatch } from '../../net/onlineMatch';
import { forgetRoom, readOnlineRooms, rememberRoom, roomLinkUrl, type OnlineRoomEntry } from '../../net/onlineRooms';
import { handToAi, lobbyOf, type LobbyInfo, type LobbySeat } from '../../net/roomApi';
import type { RoomPlay } from '../../net/roomClient';
import type { FatalClose, LinkStatus } from '../../net/serverLink';
import { serverUrl } from '../../net/serverUrl';
import { t, type TextKey } from '../../settings';
import { closeText, paceLabel, paceTurnText, statusText, type KnownSeat, type OnlineScreens } from './shared';

/** Cada cuanto se pregunta al servidor quien esta en la sala mientras se espera. */
const LOBBY_POLL_MS = 3000;

const AI_PREFIX = 'ai-';

const API_ERROR_TEXT: Partial<Record<string, TextKey>> = { noSuchRoom: 'onlineNoSuchRoom', badToken: 'onlineBadToken' };

const LINK_STATUS_TEXT: Record<LinkStatus, TextKey> = {
  connecting: 'onlineConnecting',
  online: 'onlineOnline',
  reconnecting: 'onlineReconnecting',
  closed: 'onlineOffline',
};

/** Lo que se dice mientras se busca rival: con un ritmo se puede cerrar el juego; con el otro, hay que quedarse. */
const SEARCHING_NOTE: Record<SearchPace, TextKey> = { daily: 'onlineSearchingDaily', live: 'onlineSearchingLive' };

const canShare = (): boolean => typeof navigator.share === 'function';

export class LobbyScreen {
  /** La sala en la que se esta, con lo que se sabe de ella. */
  private match: OnlineMatch | null = null;
  private entry: OnlineRoomEntry | null = null;
  private lobby: LobbyInfo | null = null;
  private linkStatus: LinkStatus = 'connecting';
  private pollHandle: ReturnType<typeof setTimeout> | null = null;
  /** La conexion ya se ha pasado a la escena: lo que llegue despues no es de esta pantalla. */
  private isLeaving = false;

  constructor(private readonly screens: OnlineScreens) {}

  /** Al abrir «Jugar en línea»: fuera de cualquier sala. */
  reset(): void {
    this.leave();
    this.isLeaving = false;
  }

  /** Sale de la sala (si se estaba en una): nada queda esperando. */
  leave(): void {
    this.stopPolling();
    this.match?.close();
    this.match = null;
    this.entry = null;
    this.lobby = null;
  }

  /**
   * Entra en la sala por su WebSocket y pasa al vestibulo; cuando la sala juega, a la partida.
   * `chosenTeams`, cuantos equipos se eligieron al crearla (hasta que la sala diga los de verdad).
   * Con el asiento que acaba de dar el servidor (`known`), la sala se apunta en «Mis partidas» ya:
   * aunque no se llegue a entrar, se puede volver a ella.
   */
  join(code: string, token: string, chosenTeams: number, known?: KnownSeat): void {
    const base = serverUrl();
    if (!base) return;
    this.leave();
    const remembered = readOnlineRooms().find((room) => room.code === code);
    this.entry = {
      code,
      token,
      seat: known?.seat ?? remembered?.seat ?? 0,
      team: known?.team ?? remembered?.team ?? 0,
      teams: remembered?.teams ?? chosenTeams,
      status: remembered?.status ?? 'waiting',
      at: Date.now(),
      search: known?.search ?? remembered?.search,
    };
    if (known) rememberRoom(this.entry);
    this.screens.show('lobby', 'leave');
    this.screens.error = null;
    this.linkStatus = 'connecting';
    const match = new OnlineMatch(base, code, token);
    this.match = match;
    match.listener = {
      onStatus: (status) => this.linkStatusChanged(status),
      onClosed: (reason) => this.closedByServer(reason),
      onPlay: (play) => this.playArrived(play),
      onMessage: (message) => {
        if (message.kind === 'welcome') this.welcomed(message.seat, message.team, message.status);
      },
    };
    match.connect();
    this.screens.publish();
    void this.pollLobby();
  }

  vm(): OnlineVM['lobby'] {
    const entry = this.entry;
    if (!entry) return null;
    const status = this.lobby?.status ?? entry.status;
    const search = status === 'waiting' ? entry.search : undefined;
    const seats = (this.lobby?.seats ?? []).map((seat) => this.seatVM(seat, entry, status));
    return {
      code: entry.code,
      link: roomLinkUrl(entry.code, location.href),
      canInvite: status === 'waiting' && !search,
      canShare: canShare(),
      searching: search ? `${paceLabel(search)} · ${paceTurnText(search)}` : null,
      seats,
      handToAiLabel: t(search ? 'onlinePlayAi' : 'onlineHandToAi'),
      note: this.noteOf(status, search),
      connection: t(LINK_STATUS_TEXT[this.linkStatus]),
    };
  }

  /**
   * Las filas del foco: copiar y compartir el enlace (mientras se espera a quien se invita), dar a la
   * IA cada asiento que se pueda, cancelar la busqueda (si se busca rival) y salir.
   */
  rows(): string[][] {
    const lobby = this.vm();
    const invite = lobby?.canInvite ? [lobby.canShare ? ['copy', 'share'] : ['copy']] : [];
    const handToAi = (lobby?.seats ?? []).filter((seat) => seat.canHandToAi).map((seat) => [`${AI_PREFIX}${seat.seat}`]);
    const cancel = lobby?.searching ? [['cancelSearch']] : [];
    return [...invite, ...handToAi, ...cancel, ['leave']];
  }

  /** Lo que se ha pulsado, si es de esta pantalla (copiar, compartir, a la IA, cancelar la busqueda): true si se ha atendido. */
  pick(focus: string): boolean {
    if (focus === 'copy') void this.copyLink();
    else if (focus === 'share') void this.shareLink();
    else if (focus === 'cancelSearch') void this.cancelSearch();
    else if (focus.startsWith(AI_PREFIX)) void this.handToAi(Number(focus.slice(AI_PREFIX.length)));
    else return false;
    return true;
  }

  // --- Lo que se ve ------------------------------------------------------------------------------

  private seatVM(seat: LobbySeat, entry: OnlineRoomEntry, status: RoomStatus): OnlineSeatVM {
    const isMe = seat.seat === entry.seat;
    const isCreator = entry.seat === 0;
    const isPerson = seat.kind === 'person';
    const presence = !isPerson ? 'ai' : seat.joined ? 'in' : 'out';
    return {
      seat: seat.seat,
      label: `${t('onlineTeam')} ${shownTeamNumber(seat.team)}`,
      detail: this.seatDetail(seat, isMe, status === 'waiting' && entry.search !== undefined),
      presence,
      canHandToAi: isCreator && status === 'waiting' && isPerson && !seat.joined && !isMe,
    };
  }

  /** «Tú · dentro», «Persona · sin entrar», «La IA» o, buscando rival, «Rival · por llegar». */
  private seatDetail(seat: LobbySeat, isMe: boolean, isSearching: boolean): string {
    if (seat.kind === 'ai') return t('onlineSeatAi');
    if (isMe) return `${t('onlineYou')} · ${t(seat.joined ? 'onlineIn' : 'onlineOut')}`;
    if (isSearching) return `${t('onlineRival')} · ${t('onlineRivalComing')}`;
    return `${t('onlineSeatPerson')} · ${t(seat.joined ? 'onlineIn' : 'onlineOut')}`;
  }

  /** Lo de debajo de los asientos: buscando rival, que hacer mientras; esperando, cuantos han entrado; si no, como esta. */
  private noteOf(status: RoomStatus, search: SearchPace | undefined): string {
    if (search) return t(SEARCHING_NOTE[search]);
    return status === 'waiting' ? this.waitingNote() : statusText(status);
  }

  /** «La partida empieza cuando entren todos (1 de 2)». */
  private waitingNote(): string {
    const people = (this.lobby?.seats ?? []).filter((seat) => seat.kind === 'person');
    const joined = people.filter((seat) => seat.joined).length;
    return `${t('onlineWaitingAll')} (${joined}/${people.length})`;
  }

  // --- La conexion con la sala ---------------------------------------------------------------------

  private welcomed(seat: SeatId, team: number, status: RoomStatus): void {
    if (!this.entry) return;
    this.entry = { ...this.entry, seat, team, status, at: Date.now() };
    this.remember();
    this.screens.publish();
  }

  /** Apunta la sala en «Mis partidas» con lo ultimo que se sabe de ella. */
  private remember(): void {
    if (!this.entry) return;
    const teams = this.match?.client.state?.teams.length ?? this.lobby?.seats.length ?? this.entry.teams;
    this.entry = { ...this.entry, teams, status: this.lobby?.status ?? this.entry.status };
    rememberRoom(this.entry);
  }

  private linkStatusChanged(status: LinkStatus): void {
    this.linkStatus = status;
    this.screens.publish();
  }

  private closedByServer(reason: FatalClose): void {
    this.screens.error = closeText(reason);
    if (reason === 'gone' && this.entry) forgetRoom(this.entry.code);
    this.screens.publish();
  }

  /** La sala ya juega (o acabo): con la vista y a quien se espera, la partida sigue en la escena. */
  private playArrived(play: RoomPlay): void {
    const match = this.match;
    if (!match || this.isLeaving) return;
    if (play.kind === 'view') this.remember();
    if (!match.client.isInPlay || play.kind === 'events') return;
    this.isLeaving = true;
    this.stopPolling();
    match.listener = {};
    this.remember();
    this.screens.host.startOnline(match);
    this.match = null;
  }

  // --- El vestibulo ------------------------------------------------------------------------------

  /**
   * Pregunta quien esta en la sala y vuelve a preguntar mientras espera. Si se ha salido mientras
   * llegaba la respuesta, lo dice la conexion (`match`, una por cada vez que se entra), no `entry`: la
   * bienvenida y la vista lo rehacen, y con un servidor lejano llegan antes que esta respuesta.
   */
  private async pollLobby(): Promise<void> {
    const base = serverUrl();
    const match = this.match;
    if (!base || !match || this.isLeaving) return;
    const info = await lobbyOf(base, match.code);
    if (this.match !== match) return;
    if (info.ok) {
      this.lobby = info.value;
      this.remember();
    } else if (info.error !== 'unreachable') this.screens.error = t(API_ERROR_TEXT[info.error] ?? 'onlineFailed');
    this.screens.publish();
    if (this.lobby?.status === 'waiting' || !info.ok) this.pollHandle = setTimeout(() => void this.pollLobby(), LOBBY_POLL_MS);
  }

  private stopPolling(): void {
    if (this.pollHandle !== null) clearTimeout(this.pollHandle);
    this.pollHandle = null;
  }

  /** Cancela la propia busqueda: la sala se cierra y se vuelve al menu (si acaba de llegar un rival, se queda y empieza). */
  private async cancelSearch(): Promise<void> {
    const entry = this.entry;
    if (!entry || !(await this.screens.cancelSearch(entry)) || this.entry !== entry) return;
    this.leave();
    this.screens.error = null;
    this.screens.toMenu();
  }

  private async handToAi(seat: SeatId): Promise<void> {
    const screens = this.screens;
    const base = serverUrl();
    if (!base || !this.entry || screens.busy) return;
    screens.busy = true;
    screens.publish();
    const handed = await handToAi(base, this.entry.code, this.entry.token, seat);
    screens.busy = false;
    if (!handed.ok) screens.error = t('onlineFailed');
    this.stopPolling();
    await this.pollLobby();
  }

  /** Copia el enlace de la sala; si no se puede, lo enseña para copiarlo a mano. */
  private async copyLink(): Promise<void> {
    const link = this.vm()?.link;
    if (!link) return;
    const copied = await copyText(link);
    this.screens.error = copied ? null : link;
    if (copied) ui.set({ toast: { text: t('onlineCopied'), id: Date.now() } });
    this.screens.publish();
  }

  /** Comparte el enlace con lo que tenga el sistema (movil), con el codigo en el texto; si no se puede, lo copia. */
  private async shareLink(): Promise<void> {
    const lobby = this.vm();
    if (!lobby) return;
    const text = t('onlineShareText').replace('{code}', lobby.code);
    if (await shareLink(lobby.link, text)) return;
    await this.copyLink();
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Compartir con lo que tenga el sistema (movil); false si no se puede. */
async function shareLink(url: string, text: string): Promise<boolean> {
  if (!canShare()) return false;
  try {
    await navigator.share({ url, text });
    return true;
  } catch {
    return false;
  }
}
