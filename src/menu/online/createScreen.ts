/**
 * «Crear sala»: las opciones de una partida nueva (las de "Personalizada" que valen por la red),
 * cuantos equipos y quien juega cada asiento (el primero es siempre quien crea) y con que general,
 * los relojes (por turno y de espera a los que faltan) y la miniatura del mapa. «Empezar» pide la
 * sala al servidor (`createRoom`) y entra en ella con el primer asiento.
 */
import { createMatch } from '../../core/defaultGames';
import { themeOf } from '../../core/gameContent';
import { skirmishConfig, type SkirmishChoices } from '../../core/match';
import type { ControllerKind } from '../../core/model';
import type { OnlineVM, OptionRowVM } from '../../hud/store';
import { createRoom } from '../../net/roomApi';
import { serverUrl } from '../../net/serverUrl';
import { CHOICES, choiceLabel, loadOptions, randomSeed, settingChangesFor, type ChoiceKey, type NewGameOptions } from '../../setup';
import { nameOf, settings, t, type TextKey } from '../../settings';
import { mapThumb } from '../thumb';
import type { OnlineScreens } from './shared';

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

const OPTION_PREFIX = 'opt-';
const SEAT_PREFIX = 'seat-';

const thumbTileSize = (mapSize: number) => (mapSize <= 20 ? 10 : mapSize <= 32 ? 7 : 6);

/** "3 min", "1 h", "1 día" o sin límite. */
function secondsLabel(seconds: number | null): string {
  if (seconds === null) return t('onlineNoTimer');
  if (seconds >= 86400) return t('onlineOneDay');
  if (seconds >= 3600) return `${seconds / 3600} ${t('onlineHours')}`;
  return `${seconds / 60} ${t('onlineMinutes')}`;
}

export class CreateScreen {
  private options!: NewGameOptions;
  private teams: number = 2;
  private seats: SeatChoice[] = [];
  private turnSeconds: (typeof TURN_SECONDS)[number] = null;
  private waitingSeconds: (typeof WAITING_SECONDS)[number] = null;
  private seed = 0;
  private thumb = '';
  private mapInfo = '';
  /** Cuantos equipos se eligieron (el vestibulo lo apunta hasta que la sala dice los de verdad). */
  get teamCount(): number {
    return this.teams;
  }

  constructor(private readonly screens: OnlineScreens) {}

  /** Al abrir «Jugar en línea»: las opciones guardadas y dos asientos. */
  reset(): void {
    this.options = loadOptions();
    this.seats = [];
    this.setTeams(2);
  }

  /** Pasa a esta pantalla, con un mapa nuevo. */
  open(): void {
    if (!serverUrl()) return;
    this.screens.show('create', 'start');
    this.seed = randomSeed();
    this.refreshPreview();
    this.screens.publish();
  }

  vm(): OnlineVM['create'] {
    return { groups: this.createGroups(), seats: this.seatRows(), timers: this.timerRows(), thumb: this.thumb, mapInfo: this.mapInfo };
  }

  /** Las filas del foco: cada opcion, los equipos y sus asientos, los relojes, otro mapa, volver y empezar. */
  rows(): string[][] {
    const options = MATCH_KEYS.map(({ k }) => [`${OPTION_PREFIX}${k}`]);
    const seats = this.seats.flatMap((_, index) =>
      index === 0 ? [[`${SEAT_PREFIX}0-general`]] : [[`${SEAT_PREFIX}${index}-kind`], [`${SEAT_PREFIX}${index}-general`]],
    );
    return [...options, ['teams'], ...seats, ['turn'], ['wait'], ['reroll'], ['back', 'start']];
  }

  /** El id es de una fila de opciones (izquierda y derecha cambian su valor). */
  isChoiceRow(id: string): boolean {
    return id.startsWith(OPTION_PREFIX) || id.startsWith(SEAT_PREFIX) || id === 'teams' || id === 'turn' || id === 'wait';
  }

  /** Lo que se ha pulsado, si es de esta pantalla (otro mapa, empezar): true si se ha atendido. */
  pick(focus: string): boolean {
    if (focus === 'start') {
      void this.create();
      return true;
    }
    if (focus !== 'reroll') return false;
    this.reroll();
    return true;
  }

  /** Otro mapa (tecla R o «Otro mapa»). */
  reroll(): void {
    this.seed = randomSeed();
    this.refreshPreview();
    this.screens.publish();
  }

  stepChoice(id: string, delta: number): void {
    this.setChoice(id, this.choiceIndex(id) + delta);
  }

  setChoice(id: string, index: number): void {
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
    this.screens.publish();
  }

  // --- Lo que se ve ----------------------------------------------------------------------------

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

  // --- Las opciones ------------------------------------------------------------------------------

  private choiceIndex(id: string): number {
    const row = [...this.createGroups().flatMap((group) => group.rows), ...this.seatRows().flat(), ...this.timerRows()].find(
      (candidate) => candidate.id === id,
    );
    return row?.index ?? 0;
  }

  private setSeatChoice(id: string, wrap: (length: number) => number): void {
    const [index, field] = id.slice(SEAT_PREFIX.length).split('-');
    const seat = this.seats[Number(index)];
    if (!seat) return;
    if (field === 'kind') seat.kind = SEAT_KINDS[wrap(SEAT_KINDS.length)]!;
    else seat.general = CHOICES.general[wrap(CHOICES.general.length)] ?? null;
  }

  private setTeams(count: number): void {
    this.teams = count;
    const kept = this.seats.slice(0, count);
    while (kept.length < count) kept.push({ kind: kept.length === 0 ? 'human' : 'ai', general: null });
    this.seats = kept;
  }

  private refreshPreview(): void {
    const s = createMatch(skirmishConfig(this.choices()));
    this.thumb = mapThumb(s, this.screens.host.palette, { px: thumbTileSize(this.options.size) });
    const buildings = settings.lang === 'es' ? 'edificios' : 'buildings';
    this.mapInfo = `${this.options.size}×${this.options.size} · ${nameOf(themeOf(s))} · ${s.buildings.length} ${buildings}`;
  }

  // --- Pedir la sala -----------------------------------------------------------------------------

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
    const screens = this.screens;
    const base = serverUrl();
    if (!base || screens.busy) return;
    screens.busy = true;
    screens.error = null;
    screens.publish();
    const created = await createRoom(base, {
      match: this.choices(),
      ...(this.turnSeconds === null ? {} : { turnSeconds: this.turnSeconds }),
      ...(this.waitingSeconds === null ? {} : { waitingSeconds: this.waitingSeconds }),
    });
    screens.busy = false;
    if (!created.ok) {
      screens.error = t('onlineFailed');
      return screens.publish();
    }
    const mine = created.value.seats[0];
    if (!mine) {
      screens.error = t('onlineFailed');
      return screens.publish();
    }
    const invites = created.value.seats.filter((seat) => seat.seat !== mine.seat);
    screens.joinRoom(created.value.code, mine.token, { seat: mine.seat, team: mine.team, invites });
  }
}
