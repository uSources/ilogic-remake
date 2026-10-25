import Phaser from 'phaser';
import { SCREEN_H, SCREEN_W, WEB_URL } from '../layout';
import { playMusic, stopMusic } from '../music';
import { saveSettings, settings, t } from '../settings';
import { deserialize } from '../core/save';
import { readSave } from '../storage';
import { C, panelBg, textStyle } from '../ui/theme';

interface MenuButton {
  label: () => string;
  value?: () => string;
  enabled: () => boolean;
  primary?: boolean;
  run: () => void;
}

const BTN_W = 300;
const BTN_H = 44;
const GAP = 8;

/** Menu principal: Jugar, Continuar y opciones (musica, autoguardado, idioma). */
export class MenuScene extends Phaser.Scene {
  private selected = 0;
  private buttons: MenuButton[] = [];
  private layer!: Phaser.GameObjects.Container;
  private top = 0;
  /** Hay una partida guardada valida (se comprueba al entrar en el menu). */
  private saveOk = false;

  constructor() {
    super('Menu');
  }

  create(): void {
    // Fondo original, cubriendo la pantalla, con un velo oscuro para que resalte el menu.
    const bg = this.add.image(SCREEN_W / 2, SCREEN_H / 2, 'menubackground');
    bg.setScale(Math.max(SCREEN_W / bg.width, SCREEN_H / bg.height));
    this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0x05080c, 0.45).setOrigin(0);
    const logo = this.add.image(SCREEN_W / 2, 92, 'logoilogic').setDisplaySize(320, 128);
    this.tweens.add({ targets: logo, y: 98, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.add.text(SCREEN_W - 12, SCREEN_H - 10, 'Fingerprint Games · 2013 / 2026', textStyle(12, C.muted)).setOrigin(1, 1);

    const raw = readSave();
    this.saveOk = !!raw && deserialize(raw) !== null;
    this.buttons = [
      { label: () => t('play'), enabled: () => true, primary: true, run: () => this.scene.start('Game', { mode: 'new' }) },
      { label: () => t('continue'), enabled: () => this.saveOk, run: () => this.scene.start('Game', { mode: 'load' }) },
      {
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
        label: () => t('autosave'),
        value: () => (settings.autosave ? t('on') : t('off')),
        enabled: () => true,
        run: () => {
          settings.autosave = !settings.autosave;
          saveSettings();
        },
      },
      {
        label: () => t('language'),
        value: () => (settings.lang === 'es' ? 'Español' : 'English'),
        enabled: () => true,
        run: () => {
          settings.lang = settings.lang === 'es' ? 'en' : 'es';
          saveSettings();
        },
      },
      { label: () => t('website'), enabled: () => true, run: () => window.open(WEB_URL, '_blank', 'noopener') },
    ];
    this.top = 190;
    this.layer = this.add.container(0, 0);
    this.selected = 0;
    this.draw();

    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      if (['ArrowUp', 'KeyW', 'Numpad8'].includes(e.code)) this.move(-1);
      else if (['ArrowDown', 'KeyS', 'Numpad2'].includes(e.code)) this.move(1);
      else if (['Enter', 'NumpadEnter', 'Space'].includes(e.code)) this.activate();
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      const i = this.buttonAt(p.x, p.y);
      if (i !== null && this.buttons[i]!.enabled() && i !== this.selected) {
        this.selected = i;
        this.draw();
      }
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => {
      const i = this.buttonAt(p.x, p.y);
      if (i === null || !this.buttons[i]!.enabled()) return;
      this.selected = i;
      this.activate();
    });
    playMusic(this, 'menu');
  }

  private buttonAt(x: number, y: number): number | null {
    const left = (SCREEN_W - BTN_W) / 2;
    if (x < left || x > left + BTN_W || y < this.top) return null;
    const i = Math.floor((y - this.top) / (BTN_H + GAP));
    const inBtn = (y - this.top) % (BTN_H + GAP) <= BTN_H;
    return inBtn && i < this.buttons.length ? i : null;
  }

  private move(dir: 1 | -1): void {
    const n = this.buttons.length;
    do this.selected = (this.selected + dir + n) % n;
    while (!this.buttons[this.selected]!.enabled());
    this.draw();
  }

  private activate(): void {
    const b = this.buttons[this.selected]!;
    if (!b.enabled()) return;
    b.run();
    if (this.scene.isActive()) this.draw();
  }

  private draw(): void {
    this.layer.removeAll(true);
    const left = (SCREEN_W - BTN_W) / 2;
    this.buttons.forEach((b, i) => {
      const y = this.top + i * (BTN_H + GAP);
      const enabled = b.enabled();
      const sel = enabled && i === this.selected;
      const fill = b.primary ? (sel ? 0x4bb0ff : C.blue) : sel ? C.selected : C.panel;
      const g = panelBg(this, left, y, BTN_W, BTN_H, { radius: 10, fill, alpha: b.primary || sel ? 1 : 0.88, border: sel ? 0x9fd2ff : C.border });
      const color = !enabled ? C.dim : '#ffffff';
      const label = this.add.text(b.value ? left + 18 : SCREEN_W / 2, y + BTN_H / 2, b.label(), textStyle(b.primary ? 22 : 18, color, b.primary)).setOrigin(b.value ? 0 : 0.5, 0.5);
      this.layer.add([g, label]);
      if (b.value) {
        const v = b.value();
        const on = v === t('on') || (b.label() === t('language'));
        this.layer.add(this.add.text(left + BTN_W - 18, y + BTN_H / 2, v, textStyle(17, on ? C.gold : C.muted, true)).setOrigin(1, 0.5));
      }
    });
  }
}
