import type Phaser from 'phaser';
import { ui, type OptionsRowVM } from '../hud/store';
import { keyLabelOf } from '../hud/keyLabels';
import { playMusic, stopMusic } from '../music';
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
  { key: 'music', group: 'optGroupSound', label: 'music', values: BOOL, show: onOff },
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
  {
    key: 'menuBg',
    group: 'optGroupScreen',
    label: 'optMenuBg',
    values: ['live', 'classic'],
    show: (v) => t(v === 'live' ? 'bgLive' : 'bgClassic'),
    menuOnly: true,
  },
  { key: 'lang', group: 'optGroupLang', label: 'language', values: ['es', 'en'], show: (v) => (v === 'es' ? 'Español' : 'English') },
] as Row[];

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
}

/**
 * Pantalla de opciones (la misma en el menu principal y en la partida). Se abre encima de lo que haya;
 * mientras esta abierta, la escena le pasa las teclas (y, cambiando una tecla, todas: `context`).
 */
export class OptionsPanel {
  private focus = 0;
  private entries: Entry[];
  /** La orden cuya tecla nueva se espera. */
  private capturing: KeyBindingId | null = null;
  /** Por que no valio la ultima tecla pulsada, junto a su orden. */
  private notice: { id: KeyBindingId; text: string } | null = null;

  constructor(
    private scene: Phaser.Scene,
    private track: 'menu' | 'game',
    /** Se llama al cambiar algo (p. ej. el idioma, para repintar lo de debajo). */
    private onChange: (key: keyof Settings) => void,
    private onClose: () => void,
  ) {
    const rows = ROWS.filter((row) => !(row.menuOnly && track === 'game'));
    this.entries = [...rows.map((row) => this.choiceEntry(row)), ...KEY_BINDING_IDS.map((id) => this.keyEntry(id)), this.resetEntry()];
  }

  get isOpen(): boolean {
    return ui.get().options !== null;
  }

  /** Que teclas valen ahora: las del menu o, esperando una tecla nueva, cualquiera. */
  context(): MenuContext {
    return this.capturing ? 'keyCapture' : 'options';
  }

  open(): void {
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
      optionsClose: () => this.close(),
    });
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
    ui.set({ options: { focus: this.focus, rows: this.entries.map((entry) => entry.vm()) } });
  }

  /** Un ajuste ha cambiado: guardarlo, aplicarlo y repintar. */
  private changed(key: keyof Settings): void {
    saveSettings();
    if (key === 'music') {
      if (settings.music) playMusic(this.scene, this.track, true);
      else stopMusic();
    }
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
}
