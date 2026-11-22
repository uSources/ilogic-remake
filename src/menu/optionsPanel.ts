import { ui, type OptionsRowVM, type OptionsTabVM } from '../hud/store';
import { keyLabelOf } from '../hud/keyLabels';
import type { MusicTrack } from '../audio/music';
import { previewVolume } from '../audio/sfx';
import { applyVolumes } from '../audio/volumeControl';
import { LEVEL_STEP, MAX_LEVEL, VOLUME_CHANNELS, withLevel, withMuteToggled, type VolumeChannel, type Volumes } from '../audio/volumes';
import { saveSettings, settings, t, UI_SCALES, type Settings, type TextKey } from '../settings';
import type { MenuCommand, MenuContext } from '../controls/menu';
import { KEY_BINDING_IDS, keyConflict, withKeyBound, type KeyBindingId, type KeyConflict } from '../controls/keyboard';

interface Row<K extends keyof Settings = keyof Settings> {
  key: K;
  group: TextKey;
  label: TextKey;
  values: readonly Settings[K][];
  show: (v: Settings[K]) => string;
  /** Solo en el menu principal (no tiene efecto durante la partida). */
  menuOnly?: boolean;
}

const onOff = (v: boolean) => (v ? t('on') : t('off'));
const speed = (v: string) => t(`speed_${v}` as TextKey);
const BOOL = [false, true] as const;
const SPEEDS = ['normal', 'fast', 'instant'] as const;

const ROWS: Row[] = [
  { key: 'muteInBackground', group: 'optGroupSound', label: 'optMuteInBackground', values: BOOL, show: onOff },
  { key: 'autosave', group: 'optGroupGame', label: 'autosave', values: BOOL, show: onOff },
  { key: 'autoWait', group: 'optGroupGame', label: 'optAutoWait', values: BOOL, show: onOff },
  { key: 'autoNext', group: 'optGroupGame', label: 'optAutoNext', values: BOOL, show: onOff },
  { key: 'warnIdle', group: 'optGroupGame', label: 'optWarnIdle', values: BOOL, show: onOff },
  { key: 'speedOwn', group: 'optGroupGame', label: 'optSpeedOwn', values: SPEEDS, show: speed },
  { key: 'speedEnemy', group: 'optGroupGame', label: 'optSpeedEnemy', values: SPEEDS, show: speed },
  { key: 'uiScale', group: 'optGroupScreen', label: 'optUiScale', values: UI_SCALES, show: (v) => `${Math.round((v as number) * 100)} %` },
  { key: 'reduceMotion', group: 'optGroupScreen', label: 'optReduceMotion', values: BOOL, show: onOff },
  { key: 'alwaysThreat', group: 'optGroupScreen', label: 'optAlwaysThreat', values: BOOL, show: onOff },
  {
    key: 'terrainArt',
    group: 'optGroupScreen',
    label: 'optTerrainArt',
    values: ['new', 'classic'],
    show: (v) => t(v === 'new' ? 'artNew' : 'artClassic'),
  },
  { key: 'lang', group: 'optGroupLang', label: 'language', values: ['es', 'en'], show: (v) => (v === 'es' ? 'Español' : 'English') },
] as Row[];

/** El nombre de cada canal de volumen (textos en i18n/<idioma>/options.ts). */
const VOLUME_LABELS: Readonly<Record<VolumeChannel, TextKey>> = {
  master: 'volume_master',
  music: 'volume_music',
  effects: 'volume_effects',
  ambience: 'volume_ambience',
  voices: 'volume_voices',
  interface: 'volume_interface',
};

/** El nombre de cada orden cuya tecla se puede cambiar (textos en i18n/<idioma>/options.ts). */
const KEY_LABELS: Readonly<Record<KeyBindingId, TextKey>> = {
  endTurn: 'key_endTurn',
  nextUnit: 'key_nextUnit',
  orderHere: 'key_orderHere',
  orderAttack: 'key_orderAttack',
  orderCapture: 'key_orderCapture',
  orderDefend: 'key_orderDefend',
  orderCancel: 'key_orderCancel',
  threat: 'key_threat',
  intents: 'key_intents',
  minimap: 'key_minimap',
  zoomIn: 'key_zoomIn',
  zoomOut: 'key_zoomOut',
  stepBack: 'key_stepBack',
  cancel: 'key_cancel',
  help: 'key_help',
  options: 'key_options',
};

/** Las pestañas, en orden: cada una con los grupos de filas que enseña. */
interface Tab {
  id: string;
  title: TextKey;
  groups: readonly TextKey[];
}

const TABS: readonly Tab[] = [
  { id: 'game', title: 'optGroupGame', groups: ['optGroupGame'] },
  { id: 'screen', title: 'optGroupScreen', groups: ['optGroupScreen'] },
  { id: 'soundLang', title: 'optTabSoundLang', groups: ['optGroupVolume', 'optGroupSound', 'optGroupLang'] },
  { id: 'keys', title: 'optGroupKeys', groups: ['optGroupKeys'] },
];

/** Por que no vale una tecla, para el jugador. */
function conflictText(conflict: KeyConflict): string {
  if (conflict.kind === 'fixed') return t('keyTakenFixed');
  if (conflict.kind === 'modifier') return t('keyIsModifier');
  return t('keyTakenBy').replace('{a}', t(KEY_LABELS[conflict.id]));
}

/** Una fila de la pantalla: lo que enseña y lo que hace al moverse a los lados o pulsarla. */
interface Entry {
  vm(): OptionsRowVM;
  /** Izquierda o derecha: el valor anterior o el siguiente. */
  step(direction: -1 | 1): void;
  /** Enter o el boton de la fila. */
  pick(): void;
  /** El boton de segmento `choice` con el raton (las filas sin segmentos lo toman como pulsarlas). */
  select(choice: number): void;
  /** Solo las de volumen: arrastrar el deslizador a `level` y soltarlo. */
  slide?(level: number): void;
  slideEnd?(): void;
}

/** Una fila y el grupo en el que sale (de el depende en que pestaña). */
interface GroupedEntry {
  group: TextKey;
  entry: Entry;
}

/**
 * Pantalla de opciones (la misma en el menu principal y en la partida). Se abre encima de lo que haya;
 * mientras esta abierta, la escena le pasa las teclas (y, cambiando una tecla, todas: `context`).
 */
export class OptionsPanel {
  /** La ultima pestaña abierta, para volver a ella mientras dure la sesion (no se guarda). */
  private static lastTab = 0;
  private tab = OptionsPanel.lastTab;
  private focus = 0;
  /** Cada pestaña con sus filas, en el orden de TABS. */
  private tabs: { tab: Tab; entries: Entry[] }[];
  /** La orden cuya tecla nueva se espera. */
  private capturing: KeyBindingId | null = null;
  /** Por que no valio la ultima tecla pulsada, junto a su orden. */
  private notice: { id: KeyBindingId; text: string } | null = null;

  constructor(
    /** Donde se abre: en el menu (`'menu'`) o en la partida; algunas filas solo valen en el menu. */
    track: MusicTrack,
    /** Se llama al cambiar algo (p. ej. el idioma, para repintar lo de debajo). */
    private onChange: (key: keyof Settings) => void,
    private onClose: () => void,
  ) {
    const rows = ROWS.filter((row) => !(row.menuOnly && track === 'game'));
    const entries: GroupedEntry[] = [
      ...VOLUME_CHANNELS.map((channel) => ({ group: 'optGroupVolume' as const, entry: this.volumeEntry(channel) })),
      ...rows.map((row) => ({ group: row.group, entry: this.choiceEntry(row) })),
      ...KEY_BINDING_IDS.map((id) => ({ group: 'optGroupKeys' as const, entry: this.keyEntry(id) })),
      { group: 'optGroupKeys', entry: this.resetEntry() },
    ];
    this.tabs = TABS.map((tab) => ({
      tab,
      entries: entries.filter(({ group }) => tab.groups.includes(group)).map(({ entry }) => entry),
    }));
  }

  /** Las filas de la pestaña abierta. */
  private get entries(): Entry[] {
    return this.tabs[this.tab]?.entries ?? [];
  }

  get isOpen(): boolean {
    return ui.get().options !== null;
  }

  /** Que teclas valen ahora: las del menu o, esperando una tecla nueva, cualquiera. */
  context(): MenuContext {
    return this.capturing ? 'keyCapture' : 'options';
  }

  open(): void {
    this.tab = OptionsPanel.lastTab;
    this.focus = 0;
    this.capturing = null;
    this.notice = null;
    Object.assign(ui.actions, {
      optionsHover: (index: number) => {
        this.focus = index;
        this.publish();
      },
      optionsSet: (index: number, choice: number) => this.setChoice(index, choice),
      optionsPick: (index: number) => this.pick(index),
      optionsSlide: (index: number, level: number) => this.slide(index, level),
      optionsSlideEnd: (index: number) => this.entries[index]?.slideEnd?.(),
      optionsTab: (tab: number) => this.showTab(tab),
      optionsClose: () => this.close(),
    });
    this.publish();
  }

  /** Abrir la pestaña `tab` (dando la vuelta), con la primera fila elegida. */
  private showTab(tab: number): void {
    this.tab = (tab + this.tabs.length) % this.tabs.length;
    OptionsPanel.lastTab = this.tab;
    this.focus = 0;
    this.capturing = null;
    this.notice = null;
    this.publish();
  }

  close(): void {
    this.capturing = null;
    ui.set({ options: null });
    this.onClose();
  }

  /** Ordenes de menu mientras esta abierta (teclas en MENU_BINDINGS.options y .keyCapture, src/controls/menu.ts). */
  command(cmd: MenuCommand): void {
    if (cmd.kind === 'key') return this.bindKey(cmd.code);
    if (cmd.kind === 'back') return this.capturing ? this.stopCapturing() : this.close();
    if (cmd.kind === 'options') return this.close();
    if (cmd.kind === 'tab') return this.showTab(this.tab + cmd.dir);
    if (cmd.kind === 'ok') return cmd.repeat ? undefined : this.pick(this.focus);
    if (cmd.kind !== 'move') return;
    if (cmd.dx) return this.entries[this.focus]?.step(cmd.dx);
    this.focus = (this.focus + cmd.dy + this.entries.length) % this.entries.length;
    this.publish();
  }

  // --- Filas -----------------------------------------------------------------------------------

  private choiceEntry(row: Row): Entry {
    const current = () => Math.max(0, row.values.indexOf(settings[row.key]));
    const set = (index: number) => {
      const value = row.values[(index + row.values.length) % row.values.length];
      (settings as unknown as Record<string, unknown>)[row.key] = value;
      this.changed(row.key);
    };
    return {
      vm: () => ({
        kind: 'choices',
        id: row.key,
        group: t(row.group),
        label: t(row.label),
        choices: row.values.map((value) => row.show(value as never)),
        index: current(),
      }),
      step: (direction) => set(current() + direction),
      pick: () => set(current() + 1),
      select: set,
    };
  }

  /**
   * El volumen de un canal: los lados lo bajan y lo suben (con una muestra, para oirlo) y pulsarla lo
   * calla o lo vuelve a poner.
   */
  private volumeEntry(channel: VolumeChannel): Entry {
    const volume = () => settings.volumes[channel];
    const update = (volumes: Volumes) => {
      settings.volumes = volumes;
      this.changed('volumes');
    };
    const slide = (level: number) => update(withLevel(settings.volumes, channel, level));
    const toggleMute = () => {
      update(withMuteToggled(settings.volumes, channel));
      previewVolume(channel);
    };
    return {
      vm: () => ({
        kind: 'volume',
        id: `volume-${channel}`,
        group: t('optGroupVolume'),
        label: t(VOLUME_LABELS[channel]),
        level: volume().level,
        max: MAX_LEVEL,
        muted: volume().muted,
        text: volume().muted ? t('volumeMuted') : `${volume().level} %`,
      }),
      step: (direction) => {
        slide(volume().level + direction * LEVEL_STEP);
        previewVolume(channel);
      },
      pick: toggleMute,
      select: toggleMute,
      slide,
      slideEnd: () => previewVolume(channel),
    };
  }

  private keyEntry(id: KeyBindingId): Entry {
    const start = () => this.startCapturing(id);
    return {
      vm: () => ({
        kind: 'key',
        id: `key-${id}`,
        group: t('optGroupKeys'),
        label: t(KEY_LABELS[id]),
        value: keyLabelOf(id),
        capturing: this.capturing === id,
        notice: this.notice?.id === id ? this.notice.text : null,
      }),
      step: start,
      pick: start,
      select: start,
    };
  }

  private resetEntry(): Entry {
    const reset = () => {
      settings.keys = {};
      this.changed('keys');
    };
    return {
      vm: () => ({ kind: 'action', id: 'keys-reset', group: t('optGroupKeys'), label: t('keyResetAll'), text: t('keyReset') }),
      step: reset,
      pick: reset,
      select: reset,
    };
  }

  // --- Cambiar una tecla -----------------------------------------------------------------------

  private startCapturing(id: KeyBindingId): void {
    this.capturing = id;
    this.notice = null;
    this.publish();
  }

  private stopCapturing(): void {
    this.capturing = null;
    this.publish();
  }

  /** La tecla pulsada mientras se espera una: si vale, pasa a ser la de la orden; si no, se dice por que. */
  private bindKey(code: string): void {
    const id = this.capturing;
    if (!id) return;
    const conflict = keyConflict(id, code, settings.keys);
    if (conflict) {
      this.notice = { id, text: conflictText(conflict) };
      return this.publish();
    }
    settings.keys = withKeyBound(settings.keys, id, code);
    this.capturing = null;
    this.changed('keys');
  }

  // --- Cambios y pintado -----------------------------------------------------------------------

  private publish(): void {
    const tabs = this.tabs.map(({ tab, entries }): OptionsTabVM => ({
      id: tab.id,
      title: t(tab.title),
      rows: entries.map((entry) => entry.vm()),
    }));
    ui.set({ options: { tabs, tab: this.tab, focus: this.focus } });
  }

  /** Un ajuste ha cambiado: guardarlo, aplicarlo y repintar. */
  private changed(key: keyof Settings): void {
    saveSettings();
    if (key === 'volumes') applyVolumes();
    this.onChange(key);
    this.publish();
  }

  private pick(index: number): void {
    this.focus = index;
    this.entries[index]?.pick();
  }

  private setChoice(index: number, choice: number): void {
    this.focus = index;
    this.entries[index]?.select(choice);
  }

  private slide(index: number, level: number): void {
    this.focus = index;
    this.entries[index]?.slide?.(level);
  }
}
