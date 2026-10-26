import Phaser from 'phaser';
import { deserialize } from '../core/save';
import { ui, type MainMenuItemVM } from '../hud/store';
import { WEB_URL } from '../layout';
import { playMusic, stopMusic } from '../music';
import { saveSettings, settings, t } from '../settings';
import { readSave } from '../storage';

interface MenuButton {
  id: string;
  label: () => string;
  value?: () => string;
  enabled: () => boolean;
  primary?: boolean;
  run: () => void;
}

/** Menu principal: Jugar, Continuar y opciones. El fondo es del juego; los botones, HTML. */
export class MenuScene extends Phaser.Scene {
  private selected = 0;
  private buttons: MenuButton[] = [];
  /** Hay una partida guardada valida (se comprueba al entrar en el menu). */
  private saveOk = false;
  private leaving = false;

  constructor() {
    super('Menu');
  }

  create(): void {
    this.leaving = false;
    const bg = this.add.image(0, 0, 'menubackground');
    const veil = this.add.rectangle(0, 0, 10, 10, 0x0b1220, 0.5).setOrigin(0);
    const layout = () => {
      const { width, height } = this.scale;
      bg.setPosition(width / 2, height / 2);
      bg.setScale(Math.max(width / bg.width, height / bg.height));
      veil.setSize(width, height);
    };
    layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, layout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, layout));

    const raw = readSave();
    this.saveOk = !!raw && deserialize(raw) !== null;
    const start = (mode: 'new' | 'load') => {
      this.leaving = true;
      this.scene.start('Game', { mode });
    };
    this.buttons = [
      { id: 'play', label: () => t('play'), enabled: () => true, primary: true, run: () => start('new') },
      { id: 'continue', label: () => t('continue'), enabled: () => this.saveOk, run: () => start('load') },
      {
        id: 'music',
        label: () => t('music'),
        value: () => (settings.music ? t('on') : t('off')),
        enabled: () => true,
        run: () => {
          settings.music = !settings.music;
          saveSettings();
          if (settings.music) playMusic(this, 'menu', true);
          else stopMusic();
        },
      },
      {
        id: 'autosave',
        label: () => t('autosave'),
        value: () => (settings.autosave ? t('on') : t('off')),
        enabled: () => true,
        run: () => {
          settings.autosave = !settings.autosave;
          saveSettings();
        },
      },
      {
        id: 'lang',
        label: () => t('language'),
        value: () => (settings.lang === 'es' ? 'Español' : 'English'),
        enabled: () => true,
        run: () => {
          settings.lang = settings.lang === 'es' ? 'en' : 'es';
          document.documentElement.lang = settings.lang;
          saveSettings();
        },
      },
      { id: 'web', label: () => t('website'), enabled: () => true, run: () => window.open(WEB_URL, '_blank', 'noopener') },
    ];
    this.selected = 0;
    Object.assign(ui.actions, {
      mainMenuHover: (i: number) => {
        if (this.buttons[i]?.enabled()) {
          this.selected = i;
          this.publish();
        }
      },
      mainMenuPick: (i: number) => {
        if (!this.buttons[i]?.enabled() || this.leaving) return;
        this.selected = i;
        this.activate();
      },
    });
    ui.set({ screen: 'menu' });
    this.publish();

    this.input.keyboard!.addCapture('SPACE,UP,DOWN');
    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      if (['ArrowUp', 'KeyW', 'Numpad8'].includes(e.code)) this.move(-1);
      else if (['ArrowDown', 'KeyS', 'Numpad2'].includes(e.code)) this.move(1);
      else if (['Enter', 'NumpadEnter', 'Space'].includes(e.code) && !e.repeat) this.activate();
    });
    playMusic(this, 'menu');
  }

  private publish(): void {
    const items: MainMenuItemVM[] = this.buttons.map((b) => ({
      id: b.id,
      label: b.label(),
      value: b.value?.(),
      disabled: !b.enabled(),
      primary: b.primary,
    }));
    ui.set({ mainMenu: { items, selected: this.selected } });
  }

  private move(dir: 1 | -1): void {
    const n = this.buttons.length;
    do this.selected = (this.selected + dir + n) % n;
    while (!this.buttons[this.selected]!.enabled());
    this.publish();
  }

  private activate(): void {
    const b = this.buttons[this.selected]!;
    if (!b.enabled() || this.leaving) return;
    b.run();
    if (!this.leaving) this.publish();
  }
}
