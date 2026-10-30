import type Phaser from 'phaser';
import { ui, type OptionRowVM } from '../hud/store';
import { playMusic, stopMusic } from '../music';
import { saveSettings, settings, t, UI_SCALES, type Settings, type TextKey } from '../settings';
import { KEY_BACK, KEY_DOWN, KEY_LEFT, KEY_OK, KEY_RIGHT, KEY_UP } from './nav';

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
  { key: 'vibrate', group: 'optGroupSound', label: 'optVibrate', values: BOOL, show: onOff },
  { key: 'autosave', group: 'optGroupGame', label: 'autosave', values: BOOL, show: onOff },
  { key: 'autoWait', group: 'optGroupGame', label: 'optAutoWait', values: BOOL, show: onOff },
  { key: 'autoNext', group: 'optGroupGame', label: 'optAutoNext', values: BOOL, show: onOff },
  { key: 'confirmEnd', group: 'optGroupGame', label: 'optConfirmEnd', values: BOOL, show: onOff },
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

/**
 * Pantalla de opciones (la misma en el menu principal y en la partida). Se abre encima de lo que haya;
 * mientras esta abierta, la escena le pasa las teclas.
 */
export class OptionsPanel {
  private focus = 0;
  private rows: Row[];

  constructor(
    private scene: Phaser.Scene,
    private track: 'menu' | 'game',
    /** Se llama al cambiar algo (p. ej. el idioma, para repintar lo de debajo). */
    private onChange: (key: keyof Settings) => void,
    private onClose: () => void,
  ) {
    this.rows = ROWS.filter((r) => !(r.menuOnly && track === 'game'));
  }

  get isOpen(): boolean {
    return ui.get().options !== null;
  }

  open(): void {
    this.focus = 0;
    Object.assign(ui.actions, {
      optionsHover: (i: number) => {
        this.focus = i;
        this.publish();
      },
      optionsSet: (i: number, index: number) => {
        this.focus = i;
        this.set(i, index);
      },
      optionsClose: () => this.close(),
    });
    this.publish();
  }

  close(): void {
    ui.set({ options: null });
    this.onClose();
  }

  private publish(): void {
    const rows: OptionRowVM[] = this.rows.map((r) => ({
      id: r.key,
      group: t(r.group),
      label: t(r.label),
      choices: r.values.map((v) => r.show(v as never)),
      index: Math.max(0, r.values.indexOf(settings[r.key] as never)),
    }));
    ui.set({ options: { focus: this.focus, rows } });
  }

  private set(i: number, index: number): void {
    const r = this.rows[i];
    if (!r) return;
    const v = r.values[(index + r.values.length) % r.values.length];
    (settings as unknown as Record<string, unknown>)[r.key] = v;
    saveSettings();
    if (r.key === 'music') {
      if (settings.music) playMusic(this.scene, this.track, true);
      else stopMusic();
    }
    this.onChange(r.key);
    this.publish();
  }

  /** Teclas mientras esta abierta. */
  key(e: KeyboardEvent): void {
    const n = this.rows.length;
    const r = this.rows[this.focus]!;
    const cur = Math.max(0, r.values.indexOf(settings[r.key]));
    if (KEY_UP.includes(e.code)) this.focus = (this.focus - 1 + n) % n;
    else if (KEY_DOWN.includes(e.code)) this.focus = (this.focus + 1) % n;
    else if (KEY_LEFT.includes(e.code)) return this.set(this.focus, cur - 1);
    else if (KEY_RIGHT.includes(e.code) || (KEY_OK.includes(e.code) && !e.repeat)) return this.set(this.focus, cur + 1);
    else if (KEY_BACK.includes(e.code) || e.code === 'KeyO') return this.close();
    this.publish();
  }
}
