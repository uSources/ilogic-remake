/**
 * Pantalla de partida nueva: ajustes ya hechos, opciones de "Personalizada", generales, codigo de
 * mapa y la vista previa del mapa que se jugara. Pide a la escena lo poco que usa (`SetupHost`).
 */
import { themeOf } from '../core/gameContent';
import type { MenuCommand } from '../controls/menu';
import { defaultContent } from '../core/content/default';
import { entryOf } from '../core/content';
import { seededRng } from '../core/geom';
import { generateGame } from '../core/mapgen';
import { duel } from '../core/teams';
import { ui, type OptionRowVM, type PresetVM, type UIActions } from '../hud/store';
import { nameOf, settings, t, type TextKey } from '../settings';
import type { TerrainPalette } from '../ui/terrainColors';
import {
  applyPreset,
  CHOICES,
  choiceLabel,
  codeToSeed,
  loadOptions,
  MAX_CODE_LENGTH,
  PRESET_IDS,
  randomSeed,
  saveOptions,
  seedToCode,
  type ChoiceKey,
  type NewGameOptions,
  type PresetId,
  ruleChangesFor,
} from '../setup';
import { rulesWith } from '../core/rulesConfig';
import { navGrid } from './nav';
import { mapThumb } from './thumb';

export interface SetupHost {
  readonly palette: TerrainPalette;
  toHome(): void;
  /** Empezar la partida con estas opciones y la semilla del mapa. */
  startNew(seed: number): void;
}

/** Grupos de opciones de "Personalizada". */
const CUSTOM_GROUPS: { title: TextKey; keys: { k: ChoiceKey; label: TextKey }[] }[] = [
  {
    title: 'optGroupGame',
    keys: [
      { k: 'fog', label: 'optFog' },
      { k: 'weather', label: 'optWeather' },
      { k: 'dayLimit', label: 'optDayLimit' },
    ],
  },
  {
    title: 'optSize',
    keys: [
      { k: 'size', label: 'optSize' },
      { k: 'theme', label: 'optTheme' },
    ],
  },
  {
    title: 'optFunds',
    keys: [
      { k: 'funds', label: 'optFunds' },
      { k: 'income', label: 'optIncome' },
    ],
  },
  {
    title: 'optGroupArmy',
    keys: [
      { k: 'command', label: 'optCommand' },
      { k: 'upkeep', label: 'optUpkeep' },
    ],
  },
];

const OPTION_PREFIX = 'opt-';
const PRESET_PREFIX = 'preset-';

/** Casillas mas pequeñas en la miniatura cuanto mas grande es el mapa, para que quepa. */
const thumbTileSize = (mapSize: number) => (mapSize <= 20 ? 10 : mapSize <= 32 ? 7 : 6);

/** Solo letras y numeros, en mayusculas, como mucho los que caben en un codigo. */
const cleanCode = (text: string) =>
  text
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .slice(0, MAX_CODE_LENGTH);

const choicesOf = (key: ChoiceKey) => CHOICES[key] as readonly unknown[];

const capitalized = (id: string) => `${id[0]!.toUpperCase()}${id.slice(1)}`;

const presetVM = (id: PresetId): PresetVM => ({
  id,
  label: t(`preset${capitalized(id)}` as TextKey),
  note: t(`preset${capitalized(id)}Note` as TextKey),
});

/** El elemento que tiene el foco en el campo de texto: se esta escribiendo el codigo. */
export const isTypingCode = () => (document.activeElement as HTMLElement | null)?.tagName === 'INPUT';

export class SetupScreen {
  options!: NewGameOptions;
  private focus = 'start';
  private code = '';
  private codeError = false;
  /** Semilla del mapa de la vista previa (la que se jugara). */
  private seed = 0;
  private thumb = '';
  private mapInfo = '';

  constructor(private readonly host: SetupHost) {}

  /** Las opciones guardadas de la ultima vez. */
  loadOptions(): void {
    this.options = loadOptions();
  }

  actions(): Partial<UIActions> {
    return {
      setupHover: (id: string) => {
        this.focus = id;
        this.publish();
      },
      setupPick: (id: string) => {
        this.focus = id;
        this.pick();
      },
      setupSet: (id: string, index: number) => {
        this.focus = id;
        this.setChoice(id, index);
      },
      setupCode: (text: string) => this.typeCode(text),
    };
  }

  open(): void {
    this.focus = 'start';
    this.clearCode();
    this.seed = randomSeed();
    this.refreshPreview();
    ui.set({ screen: 'setup' });
    this.publish();
  }

  publish(): void {
    const options = this.options;
    ui.set({
      setup: {
        focus: this.focus,
        preset: options.preset,
        presets: PRESET_IDS.map(presetVM),
        groups: this.customGroups(),
        general: hasGenerals() ? this.generalRow('general', 'optGeneral') : null,
        enemyGeneral: hasGenerals() ? this.generalRow('enemyGeneral', 'optEnemyGeneral') : null,
        generalNote: defaultContent().files.generals.find((general) => general.id === options.general)?.description[settings.lang] ?? '',
        code: this.code,
        codeError: this.codeError,
        mapCode: seedToCode(this.seed),
        thumb: this.thumb,
        mapInfo: this.mapInfo,
      },
    });
  }

  command(command: MenuCommand): void {
    const dx = command.kind === 'move' ? command.dx : 0;
    // A los lados, en una opcion, se cambia su valor.
    if (dx && this.focus.startsWith(OPTION_PREFIX)) return this.stepChoice(this.focus, dx);
    if (command.kind === 'move') return this.moveFocus(command.dx, command.dy);
    if (command.kind === 'ok' && !command.repeat) return this.pick();
    if (command.kind === 'reroll') {
      this.focus = 'reroll';
      return this.pick();
    }
    if (command.kind === 'back') this.host.toHome();
  }

  /** Escribiendo el codigo: Enter empieza; Esc o arriba/abajo salen del cuadro (MENU_BINDINGS.typing). */
  typingCommand(command: MenuCommand): void {
    if (command.kind === 'ok') return this.start();
    if (command.kind !== 'back' && !(command.kind === 'move' && command.dy)) return;
    (document.activeElement as HTMLElement).blur();
    if (command.kind === 'move') this.moveFocus(0, command.dy);
  }

  // --- Vista previa y codigo -------------------------------------------------------------------

  private refreshPreview(): void {
    const { size, theme } = this.options;
    const s = generateGame(seededRng(this.seed), {
      size,
      theme: theme === null ? null : entryOf(defaultContent().themes, theme, 'tema'),
      rules: rulesWith(defaultContent(), ruleChangesFor(this.options)),
      content: defaultContent(),
      teams: duel('human', 'ai'),
    });
    this.thumb = mapThumb(s, this.host.palette, { px: thumbTileSize(size) });
    const themeName = nameOf(themeOf(s));
    const buildings = settings.lang === 'es' ? 'edificios' : 'buildings';
    this.mapInfo = `${size}×${size} · ${themeName} · ${s.buildings.length} ${buildings}`;
  }

  private clearCode(): void {
    this.code = '';
    this.codeError = false;
  }

  /** Un codigo valido cambia ya la vista previa; uno a medias se queda escrito sin mas. */
  private typeCode(text: string): void {
    this.code = cleanCode(text);
    this.codeError = false;
    const seed = this.code ? codeToSeed(this.code) : null;
    if (seed !== null) {
      this.seed = seed;
      this.refreshPreview();
    }
    this.publish();
  }

  private reroll(): void {
    this.clearCode();
    this.seed = randomSeed();
    this.refreshPreview();
  }

  /** Con un codigo escrito se juega ese mapa (si el codigo no vale, se avisa y no se empieza). */
  private start(): void {
    if (this.code) {
      const seed = codeToSeed(this.code);
      if (seed === null) {
        this.codeError = true;
        return this.publish();
      }
      this.seed = seed;
    }
    this.host.startNew(this.seed);
  }

  // --- Opciones --------------------------------------------------------------------------------

  private customGroups() {
    return CUSTOM_GROUPS.map((group) => ({
      title: t(group.title),
      rows: group.keys.map(({ k: key, label }): OptionRowVM => {
        const list = choicesOf(key);
        return {
          id: `${OPTION_PREFIX}${key}`,
          group: t(group.title),
          label: t(label),
          choices: list.map((value) => choiceLabel(key, value)),
          index: Math.max(0, list.indexOf(this.options[key])),
        };
      }),
    }));
  }

  private generalRow(key: 'general' | 'enemyGeneral', label: TextKey): OptionRowVM {
    return {
      id: `${OPTION_PREFIX}${key}`,
      group: t(label),
      label: t(label),
      choices: CHOICES[key].map((value) => choiceLabel(key, value)),
      index: Math.max(0, CHOICES[key].indexOf(this.options[key])),
    };
  }

  /** Pasa la opcion `id` ("opt-xxx") `delta` valores adelante o atras. */
  private stepChoice(id: string, delta: number): void {
    const key = id.slice(OPTION_PREFIX.length) as ChoiceKey;
    this.setChoice(id, choicesOf(key).indexOf(this.options[key]) + delta);
  }

  /** Cambia una opcion de "Personalizada" (id "opt-xxx"); el indice da la vuelta. */
  private setChoice(id: string, index: number): void {
    const key = id.replace(/^opt-/, '') as ChoiceKey;
    if (!(key in CHOICES)) return this.publish();
    const list = choicesOf(key);
    (this.options as unknown as Record<string, unknown>)[key] = list[(index + list.length) % list.length];
    saveOptions(this.options);
    if (key === 'size' || key === 'theme') this.refreshPreview();
    this.publish();
  }

  private pickPreset(preset: PresetId): void {
    const sizeBefore = this.options.size;
    this.options = applyPreset(this.options, preset);
    saveOptions(this.options);
    if (this.options.size !== sizeBefore) this.refreshPreview();
    // En "Personalizada", el foco baja a la primera opcion.
    if (preset === 'custom') this.focus = `${OPTION_PREFIX}${CUSTOM_GROUPS[0]!.keys[0]!.k}`;
  }

  // --- Foco ------------------------------------------------------------------------------------

  private rows(): string[][] {
    const rows: string[][] = [PRESET_IDS.map((preset) => `${PRESET_PREFIX}${preset}`)];
    if (hasGenerals()) rows.push([`${OPTION_PREFIX}general`], [`${OPTION_PREFIX}enemyGeneral`]);
    if (this.options.preset === 'custom')
      for (const group of CUSTOM_GROUPS) for (const { k: key } of group.keys) rows.push([`${OPTION_PREFIX}${key}`]);
    rows.push(['code', 'reroll']);
    rows.push(['back', 'start']);
    return rows;
  }

  private moveFocus(dx: number, dy: number): void {
    this.focus = navGrid(this.rows(), this.focus, dx, dy);
    this.publish();
  }

  /** Aceptar sobre lo que tiene el foco. */
  private pick(): void {
    const focus = this.focus;
    if (focus.startsWith(OPTION_PREFIX)) return this.stepChoice(focus, 1);
    if (focus === 'back') return this.host.toHome();
    if (focus === 'start') return this.start();
    if (focus.startsWith(PRESET_PREFIX)) this.pickPreset(focus.slice(PRESET_PREFIX.length) as PresetId);
    else if (focus === 'reroll') this.reroll();
    else if (focus === 'code') document.querySelector<HTMLInputElement>('.ng-code')?.focus();
    this.publish();
  }
}

const hasGenerals = (): boolean => defaultContent().files.generals.length > 0;
