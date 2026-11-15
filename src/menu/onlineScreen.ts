/**
 * Pantalla de «Jugar en línea»: crear una sala (las opciones de una partida nueva, quien juega cada
 * asiento y con que general, y los relojes), entrar con un enlace de invitacion, la lista de salas en
 * las que este navegador tiene asiento y el vestibulo de una sala (quien ha entrado, los enlaces para
 * repartir, dar un asiento vacio a la IA). Cuando la sala empieza (o ya estaba en juego), la partida
 * pasa a la escena con su conexion (`OnlineMatch`). Pide a la escena lo poco que usa (`OnlineHost`).
 */
import type { MenuCommand } from '../controls/menu';
import { defaultContent } from '../core/content/default';
import { createMatch } from '../core/defaultGames';
import { themeOf } from '../core/gameContent';
import { skirmishConfig, type SkirmishChoices } from '../core/match';
import type { ControllerKind } from '../core/model';
import type { RoomStatus, SeatId } from '../core/net';
import { shownTeamNumber } from '../core/teams';
import { ui, type OnlineSeatVM, type OnlineVM, type OptionRowVM, type UIActions } from '../hud/store';
import { OnlineMatch } from '../net/onlineMatch';
import { forgetRoom, inviteUrl, parseInvite, readOnlineRooms, rememberRoom, type OnlineRoomEntry } from '../net/onlineRooms';
import { createRoom, handSeatToAi, lobbyOf, type CreatedSeat, type LobbyInfo } from '../net/roomApi';
import type { RoomPlay } from '../net/roomClient';
import type { FatalClose, LinkStatus } from '../net/serverLink';
import { serverUrl } from '../net/serverUrl';
import { CHOICES, choiceLabel, loadOptions, randomSeed, settingChangesFor, type ChoiceKey, type NewGameOptions } from '../setup';
import { nameOf, settings, t, type TextKey } from '../settings';
import type { TerrainPalette } from '../ui/terrainColors';
import { navGrid } from './nav';
import { mapThumb } from './thumb';

export interface OnlineHost {
  readonly palette: TerrainPalette;
  toHome(): void;
  /** La sala esta en juego (o acabada): la escena de la partida sigue con esta conexion. */
  startOnline(match: OnlineMatch): void;
}

type Mode = OnlineVM['mode'];

/** Un asiento al crear la sala: quien lo juega y su general (el primero es siempre quien crea). */
interface SeatChoice {
  kind: ControllerKind;
  general: string | null;
}

/** Las opciones de la partida que se piden al servidor (las de "Personalizada" que valen por la red). */
const MATCH_KEYS: { k: ChoiceKey; label: TextKey }[] = [
  { k: 'size', label: 'optSize' },
  { k: 'theme', label: 'optTheme' },
  { k: 'fog', label: 'optFog' },
  { k: 'weather', label: 'optWeather' },
  { k: 'funds', label: 'optFunds' },
  { k: 'income', label: 'optIncome' },
  { k: 'dayLimit', label: 'optDayLimit' },
  { k: 'command', label: 'optCommand' },
  { k: 'upkeep', label: 'optUpkeep' },
];

const TEAM_COUNTS = [2, 3, 4] as const;
const SEAT_KINDS: readonly ControllerKind[] = ['human', 'ai'];
/** Segundos por turno (null: sin reloj) y de espera a los que faltan. */
const TURN_SECONDS = [null, 60, 180, 600, 86400] as const;
const WAITING_SECONDS = [null, 300, 3600, 86400] as const;
/** Cada cuanto se pregunta al servidor quien esta en la sala mientras se espera. */
const LOBBY_POLL_MS = 3000;

const OPTION_PREFIX = 'opt-';
const SEAT_PREFIX = 'seat-';
const ROOM_PREFIX = 'room-';
const FORGET_PREFIX = 'forget-';
const COPY_PREFIX = 'copy-';
const SHARE_PREFIX = 'share-';
const AI_PREFIX = 'ai-';

const thumbTileSize = (mapSize: number) => (mapSize <= 20 ? 10 : mapSize <= 32 ? 7 : 6);

/** "3 min", "1 h", "1 día" o sin límite. */
function secondsLabel(seconds: number | null): string {
  if (seconds === null) return t('onlineNoTimer');
  if (seconds >= 86400) return t('onlineOneDay');
  if (seconds >= 3600) return `${seconds / 3600} ${t('onlineHours')}`;
  return `${seconds / 60} ${t('onlineMinutes')}`;
}

const generalName = (id: string | null): string | null => {
  const general = defaultContent().files.generals.find((candidate) => candidate.id === id);
  return general ? general.name[settings.lang] : null;
};

const statusText = (status: RoomStatus): string =>
  t(status === 'waiting' ? 'onlineStatusWaiting' : status === 'playing' ? 'onlineStatusPlaying' : 'onlineStatusEnded');

const CLOSE_TEXT: Record<FatalClose, TextKey> = {
  badToken: 'onlineBadToken',
  replaced: 'onlineReplaced',
  gone: 'onlineGone',
  badVersion: 'onlineBadVersion',
  other: 'onlineFailed',
};

const API_ERROR_TEXT: Partial<Record<string, TextKey>> = { noSuchRoom: 'onlineNoSuchRoom', badToken: 'onlineBadToken' };

/** El elemento con el foco es el cuadro del enlace: se esta escribiendo. */
export const isTypingInvite = () => (document.activeElement as HTMLElement | null)?.classList.contains('on-invite') === true;

export class OnlineScreen {
  private mode: Mode = 'menu';
  private focus = 'create';
  private options!: NewGameOptions;
  private teams: number = 2;
  private seats: SeatChoice[] = [];
  private turnSeconds: (typeof TURN_SECONDS)[number] = null;
  private waitingSeconds: (typeof WAITING_SECONDS)[number] = null;
  private seed = 0;
  private thumb = '';
  private mapInfo = '';
  private joinText = '';
  private joinError: string | null = null;
  private error: string | null = null;
  private busy = false;
  /** La sala en la que se esta (vestibulo), con lo que se sabe de ella. */
  private match: OnlineMatch | null = null;
  private entry: OnlineRoomEntry | null = null;
  private lobby: LobbyInfo | null = null;
  /** Los enlaces de los demas asientos (solo quien creo la sala los tiene). */
  private invites: CreatedSeat[] = [];
  private connection: LinkStatus = 'connecting';
  private pollHandle: ReturnType<typeof setTimeout> | null = null;
  private isLeaving = false;

  constructor(private readonly host: OnlineHost) {}

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
        this.setChoice(id, index);
      },
      onlineText: (text) => {
        this.joinText = text;
        this.joinError = null;
        this.publish();
      },
    };
  }

  /** Abre la pantalla en su menu. */
  open(): void {
    this.leaveRoom();
    this.mode = 'menu';
    this.focus = 'create';
    this.error = serverUrl() ? null : t('onlineUnavailable');
    this.options = loadOptions();
    this.seats = [];
    this.setTeams(2);
    this.isLeaving = false;
    ui.set({ screen: 'online' });
    this.publish();
  }

  /** Abre la pantalla directamente en una sala (un enlace de invitacion al cargar, o «Volver a entrar»). */
  openRoom(code: string, token: string): void {
    this.open();
    this.join(code, token);
  }

  /** Al cerrar la escena del menu: nada queda esperando. */
  destroy(): void {
    this.leaveRoom();
  }

  /** Es el cuadro de texto del enlace el que escribe. */
  typingCommand(command: MenuCommand): void {
    if (command.kind === 'ok') return this.joinFromText();
    if (command.kind !== 'back' && !(command.kind === 'move' && command.dy)) return;
    (document.activeElement as HTMLElement).blur();
    if (command.kind === 'move') this.moveFocus(0, command.dy);
  }

  command(command: MenuCommand): void {
    const dx = command.kind === 'move' ? command.dx : 0;
    if (dx && this.isChoiceRow(this.focus)) return this.stepChoice(this.focus, dx);
    if (command.kind === 'move') return this.moveFocus(command.dx, command.dy);
    if (command.kind === 'ok' && !command.repeat) return this.pick();
    if (command.kind === 'reroll' && this.mode === 'create') return this.reroll();
    if (command.kind === 'back') this.back();
  }

  // --- Lo que se ve ----------------------------------------------------------------------------

  publish(): void {
    ui.set({
      online: {
        mode: this.mode,
        focus: this.focus,
        rooms: readOnlineRooms().map((room) => ({
          code: room.code,
          summary: `${room.teams} ${t('onlineTeams').toLowerCase()} · ${statusText(room.status)}`,
        })),
        create: { groups: this.createGroups(), seats: this.seatRows(), timers: this.timerRows(), thumb: this.thumb, mapInfo: this.mapInfo },
        join: { text: this.joinText, error: this.joinError },
        lobby: this.lobbyVM(),
        error: this.error,
        busy: this.busy,
      },
    });
  }

  private createGroups(): OnlineVM['create']['groups'] {
    const rows = MATCH_KEYS.map(({ k: key, label }) => this.optionRow(key, label));
    return [{ title: t('newGame'), rows }];
  }

  private optionRow(key: ChoiceKey, label: TextKey): OptionRowVM {
    const list = CHOICES[key] as readonly unknown[];
    return {
      id: `${OPTION_PREFIX}${key}`,
      group: '',
      label: t(label),
      choices: list.map((value) => choiceLabel(key, value)),
      index: Math.max(0, list.indexOf(this.options[key])),
    };
  }

  private seatRows(): OptionRowVM[][] {
    const teamsRow: OptionRowVM = {
      id: 'teams',
      group: '',
      label: t('onlineTeams'),
      choices: TEAM_COUNTS.map(String),
      index: TEAM_COUNTS.indexOf(this.teams as (typeof TEAM_COUNTS)[number]),
    };
    const seatRows = this.seats.map((seat, index): OptionRowVM[] => {
      const label = `${t('onlineSeat')} ${index + 1}`;
      const kind: OptionRowVM = {
        id: `${SEAT_PREFIX}${index}-kind`,
        group: '',
        label: index === 0 ? `${label} (${t('onlineYou')})` : label,
        choices: SEAT_KINDS.map((candidate) => t(candidate === 'human' ? 'onlineSeatPerson' : 'onlineSeatAi')),
        index: SEAT_KINDS.indexOf(seat.kind),
      };
      const generals = CHOICES.general;
      const general: OptionRowVM = {
        id: `${SEAT_PREFIX}${index}-general`,
        group: '',
        // El primer asiento es siempre quien crea: solo tiene general.
        label: index === 0 ? `${label} (${t('onlineYou')}) · ${t('optGeneral')}` : t('optGeneral'),
        choices: generals.map((candidate) => choiceLabel('general', candidate)),
        index: Math.max(0, generals.indexOf(seat.general)),
      };
      return index === 0 ? [general] : [kind, general];
    });
    return [[teamsRow], ...seatRows];
  }

  private timerRows(): OptionRowVM[] {
    return [
      {
        id: 'turn',
        group: '',
        label: t('onlineTurnTimer'),
        choices: TURN_SECONDS.map(secondsLabel),
        index: TURN_SECONDS.indexOf(this.turnSeconds),
      },
      {
        id: 'wait',
        group: '',
        label: t('onlineWaitTimer'),
        choices: WAITING_SECONDS.map(secondsLabel),
        index: WAITING_SECONDS.indexOf(this.waitingSeconds),
      },
    ];
  }

  private lobbyVM(): OnlineVM['lobby'] {
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
      this.connection === 'online' ? 'onlineOnline' : this.connection === 'reconnecting' ? 'onlineReconnecting' : 'onlineConnecting',
    );
    const note = status === 'waiting' ? `${t('onlineWaitingAll')} ${t('onlineGeneralsNote')}` : statusText(status);
    return { code: this.entry.code, status: statusText(status), seats, note, connection };
  }

  // --- Crear una sala --------------------------------------------------------------------------

  private setTeams(count: number): void {
    this.teams = count;
    const kept = this.seats.slice(0, count);
    while (kept.length < count) kept.push({ kind: kept.length === 0 ? 'human' : 'ai', general: null });
    this.seats = kept;
  }

  private refreshPreview(): void {
    const s = createMatch(skirmishConfig(this.choices()));
    this.thumb = mapThumb(s, this.host.palette, { px: thumbTileSize(this.options.size) });
    const buildings = settings.lang === 'es' ? 'edificios' : 'buildings';
    this.mapInfo = `${this.options.size}×${this.options.size} · ${nameOf(themeOf(s))} · ${s.buildings.length} ${buildings}`;
  }

  private reroll(): void {
    this.seed = randomSeed();
    this.refreshPreview();
    this.publish();
  }

  /** Lo que se pide al servidor: una escaramuza con estos asientos. */
  private choices(): SkirmishChoices {
    return {
      seed: this.seed,
      size: this.options.size,
      theme: this.options.theme,
      settingChanges: settingChangesFor(this.options),
      teams: this.seats.map((seat) => ({ controller: seat.kind, general: seat.general })),
    };
  }

  private async create(): Promise<void> {
    const base = serverUrl();
    if (!base || this.busy) return;
    this.busy = true;
    this.error = null;
    this.publish();
    const created = await createRoom(base, {
      match: this.choices(),
      ...(this.turnSeconds === null ? {} : { turnSeconds: this.turnSeconds }),
      ...(this.waitingSeconds === null ? {} : { waitingSeconds: this.waitingSeconds }),
    });
    this.busy = false;
    if (!created.ok) {
      this.error = t('onlineFailed');
      return this.publish();
    }
    const mine = created.value.seats[0];
    if (!mine) {
      this.error = t('onlineFailed');
      return this.publish();
    }
    this.invites = created.value.seats.filter((seat) => seat.seat !== mine.seat);
    this.join(created.value.code, mine.token, { seat: mine.seat, team: mine.team, invites: this.invites });
  }

  // --- Entrar en una sala ----------------------------------------------------------------------

  private joinFromText(): void {
    const invite = parseInvite(this.joinText);
    if (!invite) {
      this.joinError = t('onlineBadInvite');
      return this.publish();
    }
    (document.activeElement as HTMLElement | null)?.blur?.();
    this.join(invite.code, invite.token);
  }

  /** Entra en la sala por su WebSocket y pasa al vestibulo; cuando la sala juega, a la partida. */
  private join(code: string, token: string, known?: { seat: SeatId; team: number; invites: CreatedSeat[] }): void {
    const base = serverUrl();
    if (!base) return;
    this.leaveRoom();
    const remembered = readOnlineRooms().find((room) => room.code === code);
    this.invites = known?.invites ?? remembered?.invites ?? [];
    this.entry = {
      code,
      token,
      seat: known?.seat ?? remembered?.seat ?? 0,
      team: known?.team ?? remembered?.team ?? 0,
      teams: remembered?.teams ?? this.teams,
      status: remembered?.status ?? 'waiting',
      at: Date.now(),
      invites: this.invites,
    };
    this.mode = 'lobby';
    this.focus = 'leave';
    this.error = null;
    this.connection = 'connecting';
    const match = new OnlineMatch(base, code, token);
    this.match = match;
    match.listener = {
      onStatus: (status) => this.connectionChanged(status),
      onClosed: (reason) => this.closedByServer(reason),
      onPlay: (play) => this.playArrived(play),
      onMessage: (message) => {
        if (message.kind === 'welcome') this.welcomed(message.seat, message.team, message.status);
      },
    };
    match.connect();
    this.publish();
    void this.pollLobby();
  }

  private welcomed(seat: SeatId, team: number, status: RoomStatus): void {
    if (!this.entry) return;
    this.entry = { ...this.entry, seat, team, status, at: Date.now() };
    this.remember();
    this.publish();
  }

  private remember(): void {
    if (!this.entry) return;
    const teams = this.match?.client.state?.teams.length ?? this.lobby?.seats.length ?? this.entry.teams;
    this.entry = { ...this.entry, teams, status: this.lobby?.status ?? this.entry.status };
    rememberRoom(this.entry);
  }

  private connectionChanged(status: LinkStatus): void {
    this.connection = status;
    this.publish();
  }

  private closedByServer(reason: FatalClose): void {
    this.error = t(CLOSE_TEXT[reason]);
    if (reason === 'gone' && this.entry) forgetRoom(this.entry.code);
    this.publish();
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
    this.host.startOnline(match);
    this.match = null;
  }

  private async pollLobby(): Promise<void> {
    const base = serverUrl();
    const entry = this.entry;
    if (!base || !entry || this.isLeaving) return;
    const info = await lobbyOf(base, entry.code);
    if (this.entry !== entry) return;
    if (info.ok) {
      this.lobby = info.value;
      this.remember();
    } else if (info.error !== 'unreachable') this.error = t(API_ERROR_TEXT[info.error] ?? 'onlineFailed');
    this.publish();
    if (this.lobby?.status === 'waiting' || !info.ok) this.pollHandle = setTimeout(() => void this.pollLobby(), LOBBY_POLL_MS);
  }

  private stopPolling(): void {
    if (this.pollHandle !== null) clearTimeout(this.pollHandle);
    this.pollHandle = null;
  }

  private async handToAi(seat: SeatId): Promise<void> {
    const base = serverUrl();
    if (!base || !this.entry || this.busy) return;
    this.busy = true;
    this.publish();
    const handed = await handSeatToAi(base, this.entry.code, this.entry.token, seat);
    this.busy = false;
    if (!handed.ok) this.error = t('onlineFailed');
    this.stopPolling();
    await this.pollLobby();
  }

  private async copyInvite(seat: SeatId, share: boolean): Promise<void> {
    const invite = this.lobbyVM()?.seats.find((candidate) => candidate.seat === seat)?.invite;
    if (!invite) return;
    const shared = share && (await shareLink(invite));
    if (shared) return;
    const copied = await copyText(invite);
    this.error = copied ? null : invite;
    if (copied) ui.set({ toast: { text: t('onlineCopied'), id: Date.now() } });
    this.publish();
  }

  private leaveRoom(): void {
    this.stopPolling();
    this.match?.close();
    this.match = null;
    this.entry = null;
    this.lobby = null;
    this.invites = [];
  }

  // --- Foco y opciones -------------------------------------------------------------------------

  private isChoiceRow(id: string): boolean {
    return id.startsWith(OPTION_PREFIX) || id.startsWith(SEAT_PREFIX) || id === 'teams' || id === 'turn' || id === 'wait';
  }

  private rows(): string[][] {
    switch (this.mode) {
      case 'menu': {
        const rooms = readOnlineRooms().flatMap((room) => [[`${ROOM_PREFIX}${room.code}`, `${FORGET_PREFIX}${room.code}`]]);
        return [['create', 'join'], ...rooms, ['back']];
      }
      case 'create': {
        const options = MATCH_KEYS.map(({ k }) => [`${OPTION_PREFIX}${k}`]);
        const seats = this.seats.flatMap((_, index) =>
          index === 0 ? [[`${SEAT_PREFIX}0-general`]] : [[`${SEAT_PREFIX}${index}-kind`], [`${SEAT_PREFIX}${index}-general`]],
        );
        return [...options, ['teams'], ...seats, ['turn'], ['wait'], ['reroll'], ['back', 'start']];
      }
      case 'join':
        return [['joinText'], ['back', 'joinGo']];
      case 'lobby': {
        const seats = (this.lobbyVM()?.seats ?? []).flatMap((seat) => {
          const row = [seat.invite ? `${COPY_PREFIX}${seat.seat}` : null, seat.canHandToAi ? `${AI_PREFIX}${seat.seat}` : null].filter(
            (id): id is string => id !== null,
          );
          return row.length ? [row] : [];
        });
        return [...seats, ['leave']];
      }
    }
  }

  private moveFocus(dx: number, dy: number): void {
    this.focus = navGrid(this.rows(), this.focus, dx, dy);
    this.publish();
  }

  private stepChoice(id: string, delta: number): void {
    this.setChoice(id, this.choiceIndex(id) + delta);
  }

  private choiceIndex(id: string): number {
    const row = [...this.createGroups().flatMap((group) => group.rows), ...this.seatRows().flat(), ...this.timerRows()].find(
      (candidate) => candidate.id === id,
    );
    return row?.index ?? 0;
  }

  private setChoice(id: string, index: number): void {
    const wrap = (length: number) => ((index % length) + length) % length;
    if (id.startsWith(OPTION_PREFIX)) {
      const key = id.slice(OPTION_PREFIX.length) as ChoiceKey;
      if (!(key in CHOICES)) return;
      const list = CHOICES[key] as readonly unknown[];
      (this.options as unknown as Record<string, unknown>)[key] = list[wrap(list.length)];
      if (key === 'size' || key === 'theme') this.refreshPreview();
    } else if (id === 'teams') this.setTeams(TEAM_COUNTS[wrap(TEAM_COUNTS.length)]!);
    else if (id === 'turn') this.turnSeconds = TURN_SECONDS[wrap(TURN_SECONDS.length)]!;
    else if (id === 'wait') this.waitingSeconds = WAITING_SECONDS[wrap(WAITING_SECONDS.length)]!;
    else if (id.startsWith(SEAT_PREFIX)) this.setSeatChoice(id, wrap);
    this.publish();
  }

  private setSeatChoice(id: string, wrap: (length: number) => number): void {
    const [index, field] = id.slice(SEAT_PREFIX.length).split('-');
    const seat = this.seats[Number(index)];
    if (!seat) return;
    if (field === 'kind') seat.kind = SEAT_KINDS[wrap(SEAT_KINDS.length)]!;
    else seat.general = CHOICES.general[wrap(CHOICES.general.length)] ?? null;
  }

  private back(): void {
    if (this.mode === 'menu') return this.host.toHome();
    this.leaveRoom();
    this.mode = 'menu';
    this.focus = 'create';
    this.error = null;
    this.publish();
  }

  private pick(): void {
    const focus = this.focus;
    if (this.isChoiceRow(focus)) return this.stepChoice(focus, 1);
    if (focus === 'back' || focus === 'leave') return this.back();
    if (focus === 'create') return this.openCreate();
    if (focus === 'join') return this.openJoin();
    if (focus === 'start') return void this.create();
    if (focus === 'reroll') return this.reroll();
    if (focus === 'joinGo') return this.joinFromText();
    if (focus === 'joinText') return document.querySelector<HTMLInputElement>('.on-invite')?.focus();
    if (focus.startsWith(ROOM_PREFIX)) return this.rejoin(focus.slice(ROOM_PREFIX.length));
    if (focus.startsWith(FORGET_PREFIX)) {
      forgetRoom(focus.slice(FORGET_PREFIX.length));
      this.focus = 'create';
      return this.publish();
    }
    if (focus.startsWith(COPY_PREFIX)) return void this.copyInvite(Number(focus.slice(COPY_PREFIX.length)), false);
    if (focus.startsWith(SHARE_PREFIX)) return void this.copyInvite(Number(focus.slice(SHARE_PREFIX.length)), true);
    if (focus.startsWith(AI_PREFIX)) return void this.handToAi(Number(focus.slice(AI_PREFIX.length)));
  }

  private openCreate(): void {
    if (!serverUrl()) return;
    this.mode = 'create';
    this.focus = 'start';
    this.seed = randomSeed();
    this.refreshPreview();
    this.publish();
  }

  private openJoin(): void {
    if (!serverUrl()) return;
    this.mode = 'join';
    this.focus = 'joinText';
    this.joinText = '';
    this.joinError = null;
    this.publish();
  }

  private rejoin(code: string): void {
    const room = readOnlineRooms().find((candidate) => candidate.code === code);
    if (room) this.join(room.code, room.token);
  }
}

/** El id del general de un equipo de la vista (su estado lleva `id`), o null. */
const generalIdOf = (general: unknown): string | null =>
  general && typeof general === 'object' && 'id' in general && typeof general.id === 'string' ? general.id : null;

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
