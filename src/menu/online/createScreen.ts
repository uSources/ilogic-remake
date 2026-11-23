/**
 * «Crear partida»: quien juega cada asiento (el primero es siempre quien crea; los demas, otra
 * persona salvo que se elija la IA), las reglas (los ajustes de «Nueva partida»: Normal, Rápida o
 * Personalizada, que abre sus opciones), los relojes (por turno y de espera a los que faltan) y la
 * miniatura del mapa. «Crear partida» pide la sala al servidor (`createRoom`) y entra en ella con el
 * primer asiento; los demas llegan con el enlace o el codigo de la sala.
 */
import { createMatch } from '../../core/defaultGames';
import { themeOf } from '../../core/gameContent';
import { skirmishConfig, type SkirmishChoices } from '../../core/match';
import type { ControllerKind } from '../../core/model';
import type { OnlineVM, OptionRowVM, PresetVM } from '../../hud/store';
import { createRoom } from '../../net/roomApi';
import { serverUrl } from '../../net/serverUrl';
import {
  applyPreset,
  CHOICES,
  choiceLabel,
  loadOptions,
  PRESET_IDS,
  randomSeed,
  settingChangesFor,
  type ChoiceKey,
  type NewGameOptions,
  type PresetId,
} from '../../setup';
import { nameOf, settings, t, type TextKey } from '../../settings';
import { mapThumb } from '../thumb';
import type { OnlineScreens } from './shared';

/** Un asiento al crear la sala: quien lo juega (el primero es siempre quien crea). */
interface SeatChoice {
  kind: ControllerKind;
}

/** Las opciones de «Personalizada» que valen por la red (las que se piden al servidor). */
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
/** Persona primero: por la red se juega contra personas; la IA es para completar. */
const SEAT_KINDS: readonly ControllerKind[] = ['human', 'ai'];
/** Segundos por turno (null: sin reloj) y de espera a los que faltan. */
const TURN_SECONDS = [null, 60, 180, 600, 86400] as const;
const WAITING_SECONDS = [null, 300, 3600, 86400] as const;

const OPTION_PREFIX = 'opt-';
const SEAT_PREFIX = 'seat-';
const PRESET_PREFIX = 'preset-';

const thumbTileSize = (mapSize: number) => (mapSize <= 20 ? 10 : mapSize <= 32 ? 7 : 6);

const capitalized = (id: string) => `${id[0]!.toUpperCase()}${id.slice(1)}`;

/** Los ajustes, con los mismos nombres y notas que en «Nueva partida». */
const presetVM = (id: PresetId): PresetVM => ({
  id,
  label: t(`preset${capitalized(id)}` as TextKey),
  note: t(`preset${capitalized(id)}Note` as TextKey),
});

const isPresetId = (value: string): value is PresetId => (PRESET_IDS as readonly string[]).includes(value);

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
    const preset = presetVM(this.options.preset);
    return {
      seats: this.seatRows(),
      presets: PRESET_IDS.map(presetVM),
      preset: preset.id,
      presetNote: preset.note,
      options: this.isCustom() ? MATCH_KEYS.map(({ k: key, label }) => this.optionRow(key, label)) : [],
      timers: this.timerRows(),
      thumb: this.thumb,
      mapInfo: this.mapInfo,
    };
  }

  /** Las filas del foco: los equipos y sus asientos, los ajustes (y sus opciones, en «Personalizada»), los relojes, otro mapa, volver y crear. */
  rows(): string[][] {
    const seats = this.seats.flatMap((_, index) => (index === 0 ? [] : [[`${SEAT_PREFIX}${index}-kind`]]));
    const presets = PRESET_IDS.map((preset) => `${PRESET_PREFIX}${preset}`);
    const options = this.isCustom() ? MATCH_KEYS.map(({ k }) => [`${OPTION_PREFIX}${k}`]) : [];
    return [['teams'], ...seats, presets, ...options, ['turn'], ['wait'], ['reroll'], ['back', 'start']];
  }

  /** El id es de una fila de opciones (izquierda y derecha cambian su valor). */
  isChoiceRow(id: string): boolean {
    return id.startsWith(OPTION_PREFIX) || id.startsWith(SEAT_PREFIX) || id === 'teams' || id === 'turn' || id === 'wait';
  }

  /** Lo que se ha pulsado, si es de esta pantalla (un ajuste, otro mapa, crear): true si se ha atendido. */
  pick(focus: string): boolean {
    const preset = focus.slice(PRESET_PREFIX.length);
    if (focus.startsWith(PRESET_PREFIX) && isPresetId(preset)) this.pickPreset(preset);
    else if (focus === 'start') void this.create();
    else if (focus === 'reroll') this.reroll();
    else return false;
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
    if (id.startsWith(OPTION_PREFIX)) this.setOption(id.slice(OPTION_PREFIX.length), wrap);
    else if (id === 'teams') this.setTeams(TEAM_COUNTS[wrap(TEAM_COUNTS.length)]!);
    else if (id === 'turn') this.turnSeconds = TURN_SECONDS[wrap(TURN_SECONDS.length)]!;
    else if (id === 'wait') this.waitingSeconds = WAITING_SECONDS[wrap(WAITING_SECONDS.length)]!;
    else if (id.startsWith(SEAT_PREFIX)) this.setSeatChoice(id, wrap);
    this.screens.publish();
  }

  // --- Lo que se ve ----------------------------------------------------------------------------

  private isCustom(): boolean {
    return this.options.preset === 'custom';
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

  /** Cuantos equipos y, de cada asiento menos el primero (el de quien crea), quien lo juega. */
  private seatRows(): OptionRowVM[] {
    const teamsRow: OptionRowVM = {
      id: 'teams',
      group: '',
      label: t('onlineTeams'),
      choices: TEAM_COUNTS.map(String),
      index: TEAM_COUNTS.indexOf(this.teams as (typeof TEAM_COUNTS)[number]),
    };
    const seatRows = this.seats.slice(1).map((seat, index): OptionRowVM => ({
      id: `${SEAT_PREFIX}${index + 1}-kind`,
      group: '',
      label: `${t('onlineSeat')} ${index + 2}`,
      choices: SEAT_KINDS.map((candidate) => t(candidate === 'human' ? 'onlineSeatPerson' : 'onlineSeatAi')),
      index: SEAT_KINDS.indexOf(seat.kind),
    }));
    return [teamsRow, ...seatRows];
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
    const vm = this.vm();
    const row = [...vm.seats, ...vm.options, ...vm.timers].find((candidate) => candidate.id === id);
    return row?.index ?? 0;
  }

  private setOption(key: string, wrap: (length: number) => number): void {
    if (!(key in CHOICES)) return;
    const choiceKey = key as ChoiceKey;
    const list = CHOICES[choiceKey] as readonly unknown[];
    (this.options as unknown as Record<string, unknown>)[choiceKey] = list[wrap(list.length)];
    if (choiceKey === 'size' || choiceKey === 'theme') this.refreshPreview();
  }

  private pickPreset(preset: PresetId): void {
    const sizeBefore = this.options.size;
    this.options = applyPreset(this.options, preset);
    if (this.options.size !== sizeBefore) this.refreshPreview();
    this.screens.publish();
  }

  private setSeatChoice(id: string, wrap: (length: number) => number): void {
    const seat = this.seats[Number(id.slice(SEAT_PREFIX.length).split('-')[0])];
    if (seat) seat.kind = SEAT_KINDS[wrap(SEAT_KINDS.length)]!;
  }

  private setTeams(count: number): void {
    this.teams = count;
    const kept = this.seats.slice(0, count);
    while (kept.length < count) kept.push({ kind: 'human' });
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
      teams: this.seats.map((seat) => ({ controller: seat.kind })),
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
      // El servidor de Node, si alguien lo aloja, tiene un tope de salas (server/README.md).
      screens.error = t(created.error === 'serverFull' ? 'onlineServerFull' : 'onlineFailed');
      return screens.publish();
    }
    const { code, token, seat, team } = created.value;
    screens.joinRoom(code, token, { seat, team });
  }
}
