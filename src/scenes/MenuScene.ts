import Phaser from 'phaser';
import { deserialize } from '../core/save';
import { ui, type MainMenuItemVM, type SetupRowVM } from '../hud/store';
import { WEB_URL } from '../layout';
import { playMusic, stopMusic } from '../music';
import { completedMissions, missionUnlocked, objectiveText } from '../campaign';
import { MISSIONS } from '../core/missions';
import { saveSettings, settings, t, type TextKey } from '../settings';
import { CHOICES, choiceLabel, codeToSeed, DEFAULT_OPTIONS, loadOptions, randomSeed, rulesFor, saveOptions, type ChoiceKey, type NewGameOptions } from '../setup';
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
    this.setupMode = false;
    this.campaignMode = false;
    this.options = loadOptions();
    this.buttons = [
      { id: 'play', label: () => t('play'), enabled: () => true, primary: true, run: () => this.openSetup() },
      { id: 'campaign', label: () => t('campaign'), enabled: () => true, run: () => this.openCampaign() },
      { id: 'continue', label: () => t('continue'), enabled: () => this.saveOk, run: () => start('load') },
      { id: 'help', label: () => t('help'), enabled: () => true, run: () => ui.set({ help: true }) },
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
      setupHover: (i: number) => {
        this.setupSel = i;
        this.publishSetup();
      },
      setupChange: (i: number, dir: 1 | -1) => {
        this.setupSel = i;
        this.changeOption(dir);
      },
      setupPick: (i: number) => {
        this.setupSel = i;
        this.pickSetup();
      },
      campaignHover: (i: number) => {
        this.campaignSel = i;
        this.publishCampaign();
      },
      campaignPick: (i: number) => {
        this.campaignSel = i;
        this.startMission();
      },
      campaignBack: () => this.closeCampaign(),
      setupCode: (text: string) => {
        this.code = text.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 7);
        this.publishSetup();
      },
    });
    ui.set({ screen: 'menu' });
    this.publish();

    // Las teclas que captura la partida (Retroceso, flechas...) siguen capturadas: liberarlas para el campo de texto.
    this.input.keyboard!.clearCaptures();
    this.input.keyboard!.addCapture('SPACE,UP,DOWN');
    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      if (ui.get().help) {
        if (['Escape', 'Backspace', 'Enter', 'NumpadEnter', 'Space', 'KeyH'].includes(e.code)) ui.set({ help: false });
        return;
      }
      if (this.setupMode) return this.setupKey(e);
      if (this.campaignMode) return this.campaignKey(e);
      if (['ArrowUp', 'KeyW', 'Numpad8'].includes(e.code)) this.move(-1);
      else if (['ArrowDown', 'KeyS', 'Numpad2'].includes(e.code)) this.move(1);
      else if (['Enter', 'NumpadEnter', 'Space'].includes(e.code) && !e.repeat) this.activate();
    });
    playMusic(this, 'menu');
  }

  // -------------------------------------------------------------------------
  // Campaña
  // -------------------------------------------------------------------------

  private campaignMode = false;
  private campaignSel = 0;

  private openCampaign(): void {
    this.campaignMode = true;
    const done = completedMissions();
    // Empezar por la primera sin terminar.
    const next = MISSIONS.findIndex((m, i) => !done.has(m.id) && missionUnlocked(i, done));
    this.campaignSel = next >= 0 ? next : 0;
    ui.set({ screen: 'campaign' });
    this.publishCampaign();
  }

  private closeCampaign(): void {
    this.campaignMode = false;
    ui.set({ screen: 'menu' });
    this.publish();
  }

  private publishCampaign(): void {
    const done = completedMissions();
    const lang = settings.lang;
    const items = MISSIONS.map((m, i) => ({
      id: m.id,
      title: m.title[lang],
      status: (done.has(m.id) ? 'done' : missionUnlocked(i, done) ? 'open' : 'locked') as 'done' | 'open' | 'locked',
    }));
    const m = MISSIONS[this.campaignSel]!;
    ui.set({ campaign: { items, selected: this.campaignSel, brief: m.brief[lang], objective: objectiveText(m) } });
  }

  private startMission(): void {
    if (this.leaving || !missionUnlocked(this.campaignSel)) return this.publishCampaign();
    this.leaving = true;
    this.scene.start('Game', { mode: 'mission', mission: MISSIONS[this.campaignSel]!.id });
  }

  private campaignKey(e: KeyboardEvent): void {
    const n = MISSIONS.length;
    if (['ArrowUp', 'KeyW', 'Numpad8'].includes(e.code)) this.campaignSel = (this.campaignSel - 1 + n) % n;
    else if (['ArrowDown', 'KeyS', 'Numpad2'].includes(e.code)) this.campaignSel = (this.campaignSel + 1) % n;
    else if (['Enter', 'NumpadEnter', 'Space'].includes(e.code) && !e.repeat) return this.startMission();
    else if (e.code === 'Escape' || e.code === 'Backspace') return this.closeCampaign();
    this.publishCampaign();
  }

  // -------------------------------------------------------------------------
  // Nueva partida
  // -------------------------------------------------------------------------

  private setupMode = false;
  private setupSel = 0;
  private options: NewGameOptions = { ...DEFAULT_OPTIONS };
  private code = '';
  private codeError = false;

  private static readonly ROWS: { id: ChoiceKey | 'code' | 'start' | 'back'; label: TextKey; note?: TextKey }[] = [
    { id: 'rules', label: 'optRules', note: 'noteRules' },
    { id: 'size', label: 'optSize', note: 'noteSize' },
    { id: 'theme', label: 'optTheme', note: 'noteTheme' },
    { id: 'fog', label: 'optFog', note: 'noteFog' },
    { id: 'funds', label: 'optFunds', note: 'noteFunds' },
    { id: 'income', label: 'optIncome', note: 'noteIncome' },
    { id: 'dayLimit', label: 'optDayLimit', note: 'noteDayLimit' },
    { id: 'code', label: 'optCode', note: 'noteCode' },
    { id: 'start', label: 'start' },
    { id: 'back', label: 'back' },
  ];

  private openSetup(): void {
    this.setupMode = true;
    this.setupSel = MenuScene.ROWS.findIndex((r) => r.id === 'start');
    this.code = '';
    this.codeError = false;
    ui.set({ screen: 'setup' });
    this.publishSetup();
  }

  private closeSetup(): void {
    this.setupMode = false;
    (document.activeElement as HTMLElement | null)?.blur?.();
    ui.set({ screen: 'menu' });
    this.publish();
  }

  private publishSetup(): void {
    const rows: SetupRowVM[] = MenuScene.ROWS.map((r) => ({
      id: r.id,
      label: t(r.label),
      kind: r.id === 'code' ? 'code' : r.id === 'start' ? 'start' : r.id === 'back' ? 'back' : 'choice',
      value: r.id in CHOICES ? choiceLabel(r.id as ChoiceKey, this.options[r.id as ChoiceKey]) : undefined,
      note: r.note ? t(r.note) : undefined,
    }));
    if (this.codeError) rows[MenuScene.ROWS.findIndex((r) => r.id === 'code')]!.note = t('badCode');
    ui.set({ newGame: { rows, selected: this.setupSel, code: this.code, codeError: this.codeError } });
  }

  private changeOption(dir: 1 | -1): void {
    const row = MenuScene.ROWS[this.setupSel];
    if (!row || !(row.id in CHOICES)) return this.publishSetup();
    const k = row.id as ChoiceKey;
    const list = CHOICES[k] as readonly unknown[];
    const i = list.indexOf(this.options[k]);
    (this.options as unknown as Record<string, unknown>)[k] = list[(i + dir + list.length) % list.length];
    saveOptions(this.options);
    this.publishSetup();
  }

  private pickSetup(): void {
    const row = MenuScene.ROWS[this.setupSel];
    if (!row) return;
    if (row.id === 'back') return this.closeSetup();
    if (row.id === 'start') return this.startNew();
    if (row.id === 'code') {
      (document.querySelector('.ng-code') as HTMLInputElement | null)?.focus();
      return;
    }
    this.changeOption(1);
  }

  private startNew(): void {
    if (this.leaving) return;
    let seed = randomSeed();
    if (this.code) {
      const s = codeToSeed(this.code);
      if (s === null) {
        this.codeError = true;
        return this.publishSetup();
      }
      seed = s;
    }
    this.leaving = true;
    (document.activeElement as HTMLElement | null)?.blur?.();
    const o = this.options;
    this.scene.start('Game', { mode: 'new', rules: rulesFor(o), setup: { seed, size: o.size, theme: o.theme } });
  }

  private setupKey(e: KeyboardEvent): void {
    const typing = (document.activeElement as HTMLElement | null)?.tagName === 'INPUT';
    if (typing) {
      if (e.code === 'Enter' || e.code === 'NumpadEnter') this.startNew();
      else if (e.code === 'Escape' || e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        (document.activeElement as HTMLElement).blur();
        if (e.code !== 'Escape') this.moveSetup(e.code === 'ArrowUp' ? -1 : 1);
      }
      return;
    }
    if (['ArrowUp', 'KeyW', 'Numpad8'].includes(e.code)) this.moveSetup(-1);
    else if (['ArrowDown', 'KeyS', 'Numpad2'].includes(e.code)) this.moveSetup(1);
    else if (['ArrowLeft', 'KeyA', 'Numpad4'].includes(e.code)) this.changeOption(-1);
    else if (['ArrowRight', 'KeyD', 'Numpad6'].includes(e.code)) this.changeOption(1);
    else if (['Enter', 'NumpadEnter', 'Space'].includes(e.code) && !e.repeat) this.pickSetup();
    else if (e.code === 'Escape' || e.code === 'Backspace') this.closeSetup();
  }

  private moveSetup(dir: 1 | -1): void {
    const n = MenuScene.ROWS.length;
    this.setupSel = (this.setupSel + dir + n) % n;
    this.publishSetup();
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
