/**
 * El vestibulo de una sala: quien ha entrado (por `GET /rooms/:code` cada pocos segundos), los
 * enlaces para repartir (copiar y compartir) y «Sustituir por IA» de quien creo la sala. Es tambien
 * quien tiene la conexion con la sala (`OnlineMatch`): entra por el WebSocket al abrirse, apunta la
 * sala en «Mis partidas» y, cuando la sala juega (o ya acabo), le pasa la conexion a la escena
 * (`OnlineHost.startOnline`).
 */
import { defaultContent } from '../../core/content/default';
import type { RoomStatus, SeatId } from '../../core/net';
import { shownTeamNumber } from '../../core/teams';
import { ui, type OnlineSeatVM, type OnlineVM } from '../../hud/store';
import { OnlineMatch } from '../../net/onlineMatch';
import { forgetRoom, inviteUrl, readOnlineRooms, rememberRoom, type OnlineRoomEntry } from '../../net/onlineRooms';
import { handSeatToAi, lobbyOf, type CreatedSeat, type LobbyInfo } from '../../net/roomApi';
import type { RoomPlay } from '../../net/roomClient';
import type { FatalClose, LinkStatus } from '../../net/serverLink';
import { serverUrl } from '../../net/serverUrl';
import { settings, t, type TextKey } from '../../settings';
import { statusText, type KnownSeat, type OnlineScreens } from './shared';

/** Cada cuanto se pregunta al servidor quien esta en la sala mientras se espera. */
const LOBBY_POLL_MS = 3000;

const COPY_PREFIX = 'copy-';
const SHARE_PREFIX = 'share-';
const AI_PREFIX = 'ai-';

const CLOSE_TEXT: Record<FatalClose, TextKey> = {
  badToken: 'onlineBadToken',
  replaced: 'onlineReplaced',
  gone: 'onlineGone',
  badVersion: 'onlineBadVersion',
  other: 'onlineFailed',
};

const API_ERROR_TEXT: Partial<Record<string, TextKey>> = { noSuchRoom: 'onlineNoSuchRoom', badToken: 'onlineBadToken' };

const generalName = (id: string | null): string | null => {
  const general = defaultContent().files.generals.find((candidate) => candidate.id === id);
  return general ? general.name[settings.lang] : null;
};

/** El id del general de un equipo de la vista (su estado lleva `id`), o null. */
const generalIdOf = (general: unknown): string | null =>
  general && typeof general === 'object' && 'id' in general && typeof general.id === 'string' ? general.id : null;

export class LobbyScreen {
  /** La sala en la que se esta, con lo que se sabe de ella. */
  private match: OnlineMatch | null = null;
  private entry: OnlineRoomEntry | null = null;
  private lobby: LobbyInfo | null = null;
  /** Los enlaces de los demas asientos (solo quien creo la sala los tiene). */
  private invites: CreatedSeat[] = [];
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
    this.invites = [];
  }

  /**
   * Entra en la sala por su WebSocket y pasa al vestibulo; cuando la sala juega, a la partida.
   * `chosenTeams`, cuantos equipos se eligieron al crearla (hasta que la sala diga los de verdad).
   */
  join(code: string, token: string, chosenTeams: number, known?: KnownSeat): void {
    const base = serverUrl();
    if (!base) return;
    this.leave();
    const remembered = readOnlineRooms().find((room) => room.code === code);
    this.invites = known?.invites ?? remembered?.invites ?? [];
    this.entry = {
      code,
      token,
      seat: known?.seat ?? remembered?.seat ?? 0,
      team: known?.team ?? remembered?.team ?? 0,
      teams: remembered?.teams ?? chosenTeams,
      status: remembered?.status ?? 'waiting',
      at: Date.now(),
      invites: this.invites,
    };
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
    if (!this.entry) return null;
    const status = this.lobby?.status ?? this.entry.status;
    const isCreator = this.entry.seat === 0;
    const seats = (this.lobby?.seats ?? []).map((seat): OnlineSeatVM => {
      const invite = this.invites.find((candidate) => candidate.seat === seat.seat);
      const general = this.match?.client.state ? generalName(generalIdOf(this.match.client.state.teams[seat.team]?.general)) : null;
      return {
        seat: seat.seat,
        label: `${t('onlineTeam')} ${shownTeamNumber(seat.team)}`,
        general,
        kind: seat.kind,
        joined: seat.joined,
        isMe: seat.seat === this.entry?.seat,
        invite: invite ? inviteUrl(invite.invite, location.href) : null,
        canHandToAi: isCreator && status === 'waiting' && seat.kind === 'person' && !seat.joined && seat.seat !== 0,
      };
    });
    const connection = t(
      this.linkStatus === 'online' ? 'onlineOnline' : this.linkStatus === 'reconnecting' ? 'onlineReconnecting' : 'onlineConnecting',
    );
    const note = status === 'waiting' ? `${t('onlineWaitingAll')} ${t('onlineGeneralsNote')}` : statusText(status);
    return { code: this.entry.code, status: statusText(status), seats, note, connection };
  }

  /** Las filas del foco: por asiento, copiar su enlace y darlo a la IA (si se puede); y salir. */
  rows(): string[][] {
    const seats = (this.vm()?.seats ?? []).flatMap((seat) => {
      const row = [seat.invite ? `${COPY_PREFIX}${seat.seat}` : null, seat.canHandToAi ? `${AI_PREFIX}${seat.seat}` : null].filter(
        (id): id is string => id !== null,
      );
      return row.length ? [row] : [];
    });
    return [...seats, ['leave']];
  }

  /** Lo que se ha pulsado, si es de esta pantalla (copiar, compartir, a la IA): true si se ha atendido. */
  pick(focus: string): boolean {
    if (focus.startsWith(COPY_PREFIX)) void this.copyInvite(Number(focus.slice(COPY_PREFIX.length)), false);
    else if (focus.startsWith(SHARE_PREFIX)) void this.copyInvite(Number(focus.slice(SHARE_PREFIX.length)), true);
    else if (focus.startsWith(AI_PREFIX)) void this.handToAi(Number(focus.slice(AI_PREFIX.length)));
    else return false;
    return true;
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
    this.screens.error = t(CLOSE_TEXT[reason]);
    if (reason === 'gone' && this.entry) forgetRoom(this.entry.code);
    this.screens.publish();
  }

  /** La sala ya juega (o acabo): con la vista y a quien se espera, la partida sigue en la escena. */
  private playArrived(play: RoomPlay): void {
    const match = this.match;
    if (!match || this.isLeaving) return;
    if (play.kind === 'view') this.remember();
    const isInPlay = match.client.state && (match.client.turn || match.client.ended);
    if (!isInPlay || play.kind === 'events') return;
    this.isLeaving = true;
    this.stopPolling();
    match.listener = {};
    this.remember();
    this.screens.host.startOnline(match);
    this.match = null;
  }

  // --- El vestibulo ------------------------------------------------------------------------------

  private async pollLobby(): Promise<void> {
    const base = serverUrl();
    const entry = this.entry;
    if (!base || !entry || this.isLeaving) return;
    const info = await lobbyOf(base, entry.code);
    if (this.entry !== entry) return;
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

  private async handToAi(seat: SeatId): Promise<void> {
    const screens = this.screens;
    const base = serverUrl();
    if (!base || !this.entry || screens.busy) return;
    screens.busy = true;
    screens.publish();
    const handed = await handSeatToAi(base, this.entry.code, this.entry.token, seat);
    screens.busy = false;
    if (!handed.ok) screens.error = t('onlineFailed');
    this.stopPolling();
    await this.pollLobby();
  }

  private async copyInvite(seat: SeatId, share: boolean): Promise<void> {
    const invite = this.vm()?.seats.find((candidate) => candidate.seat === seat)?.invite;
    if (!invite) return;
    const shared = share && (await shareLink(invite));
    if (shared) return;
    const copied = await copyText(invite);
    this.screens.error = copied ? null : invite;
    if (copied) ui.set({ toast: { text: t('onlineCopied'), id: Date.now() } });
    this.screens.publish();
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
async function shareLink(url: string): Promise<boolean> {
  if (typeof navigator.share !== 'function') return false;
  try {
    await navigator.share({ url });
    return true;
  } catch {
    return false;
  }
}
