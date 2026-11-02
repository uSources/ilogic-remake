import Phaser from 'phaser';
import { ATLAS } from '../atlas';
import { useRules, GENERALS } from '../core/data';
import { seededRng } from '../core/geom';
import { generateGame } from '../core/mapgen';
import { buildMission, MISSIONS, missionRules } from '../core/missions';
import { deserialize } from '../core/save';
import type { GameState } from '../core/types';
import { bestDays, completedMissions, missionUnlocked, objectiveText } from '../campaign';
import { resetActions, ui, type CampaignItemVM, type MarkVM, type OptionRowVM, type PresetVM } from '../hud/store';
import { WEB_URL } from '../layout';
import { navGrid } from '../menu/nav';
import { listStep, menuKeyCommand, type MenuCommand, type MenuContext } from '../controls/menu';
import { OptionsPanel } from '../menu/optionsPanel';
import { keepMapSize, mapThumb } from '../menu/thumb';
import { playMusic } from '../music';
import { checkNotes, closeNotes, notesCommand, notesOpen, openNotes } from '../patchNotes';
import { settings, t, type TextKey } from '../settings';
import {
  applyPreset,
  CHOICES,
  choiceLabel,
  codeToSeed,
  loadOptions,
  PRESET_IDS,
  randomSeed,
  rulesFor,
  saveOptions,
  seedToCode,
  type ChoiceKey,
  type NewGameOptions,
  type PresetId,
} from '../setup';
import { readSave } from '../storage';
import { LiveBackground } from '../menu/liveBackground';
import { terrainPalette } from '../ui/terrainColors';

type Mode = 'home' | 'setup' | 'campaign';

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

const OBJECTIVE_KEY: Record<string, TextKey> = {
  hq: 'objHq',
  survive: 'objSurvive',
  capture: 'objCapture',
  destroy: 'objDestroy',
  escort: 'objEscort',
};

/**
 * Menu principal con tarjetas (Continuar, Nueva partida, Campaña), la pantalla de nueva partida con
 * vista previa del mapa y la campaña. Detras, una partida IA contra IA o la imagen original.
 */
export class MenuScene extends Phaser.Scene {
  private mode: Mode = 'home';
  private leaving = false;
  private save: GameState | null = null;
  private homeFocus = 'quick';
  private optionsPanel!: OptionsPanel;
  private palette: number[] = [];

  constructor() {
    super('Menu');
  }

  create(data?: { open?: 'setup' }): void {
    this.leaving = false;
    this.mode = 'home';
    this.palette = terrainPalette(this.textures);
    this.createBackground();

    const raw = readSave();
    this.save = raw ? keepMapSize(() => deserialize(raw)) : null;
    this.options = loadOptions();
    this.homeFocus = this.save ? 'continue' : 'quick';
    this.optionsPanel = new OptionsPanel(
      this,
      'menu',
      (key) => {
        if (key === 'lang') this.publishAll();
        if (key === 'menuBg' || key === 'terrainArt') this.scene.restart();
      },
      () => this.publishAll(),
    );

    Object.assign(ui.actions, {
      homeHover: (id: string) => {
        this.homeFocus = id;
        this.publishHome();
      },
      homePick: (id: string) => {
        this.homeFocus = id;
        this.pickHome();
      },
      setupHover: (id: string) => {
        this.setupFocus = id;
        this.publishSetup();
      },
      setupPick: (id: string) => {
        this.setupFocus = id;
        this.pickSetup();
      },
      setupSet: (id: string, index: number) => {
        this.setupFocus = id;
        this.setChoice(id, index);
      },
      setupCode: (text: string) => {
        this.code = text
          .toUpperCase()
          .replace(/[^0-9A-Z]/g, '')
          .slice(0, 7);
        this.codeError = false;
        const seed = this.code ? codeToSeed(this.code) : null;
        if (seed !== null) {
          this.seed = seed;
          this.refreshPreview();
        }
        this.publishSetup();
      },
      campaignHover: (i: number) => {
        this.campaignSel = i;
        this.publishCampaign();
      },
      campaignPick: (i: number) => {
        if (this.campaignSel !== i) {
          this.campaignSel = i;
          return this.publishCampaign();
        }
        this.startMission();
      },
      campaignBack: () => this.toHome(),
    });
    ui.set({ screen: 'menu', options: null, pause: null, toast: null, banner: null, report: null });
    this.publishHome();
    if (data?.open === 'setup') this.openSetup();

    // Las teclas que captura la partida (Retroceso, flechas...) siguen capturadas: liberarlas para el campo de texto.
    this.input.keyboard!.clearCaptures();
    this.input.keyboard!.addCapture('SPACE,UP,DOWN,LEFT,RIGHT');
    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => this.onKey(e));
    playMusic(this, 'menu');
    // Notas de parche nuevas en GitHub (marca en "Novedades"); sin conexion no pasa nada.
    void checkNotes();
  }

  /** Adaptador de teclado: la tecla, en el menu que tiene el foco, es una orden MenuCommand. */
  private onKey(e: KeyboardEvent): void {
    if (this.leaving) return;
    const cmd = menuKeyCommand(e, this.controlContext());
    if (cmd) this.menu(cmd);
  }

  /** El menu que tiene el foco (decide que teclas valen). Mismo orden que menu(). */
  controlContext(): MenuContext {
    if (ui.get().help) return 'help';
    if (notesOpen()) return 'notes';
    if (this.optionsPanel.isOpen) return 'options';
    if (this.mode === 'setup') return this.typing() ? 'typing' : 'setup';
    if (this.mode === 'campaign') return 'campaign';
    return 'home';
  }

  /** Cumplir una orden de menu, venga del mando que venga. */
  menu(cmd: MenuCommand): void {
    if (this.leaving) return;
    if (ui.get().help) {
      if (cmd.kind === 'back' || cmd.kind === 'ok' || cmd.kind === 'help') ui.set({ help: false });
      return;
    }
    if (notesOpen()) return notesCommand(cmd);
    if (this.optionsPanel.isOpen) return this.optionsPanel.command(cmd);
    if (this.mode === 'setup') return this.typing() ? this.typingCommand(cmd) : this.setupCommand(cmd);
    if (this.mode === 'campaign') return this.campaignCommand(cmd);
    this.homeCommand(cmd);
  }

  /** Escribiendo en el cuadro del codigo de mapa. */
  private typing(): boolean {
    return (document.activeElement as HTMLElement | null)?.tagName === 'INPUT';
  }

  private publishAll(): void {
    if (this.mode === 'home') this.publishHome();
    else if (this.mode === 'setup') this.publishSetup();
    else this.publishCampaign();
  }

  private toHome(): void {
    this.mode = 'home';
    (document.activeElement as HTMLElement | null)?.blur?.();
    ui.set({ screen: 'menu' });
    this.publishHome();
  }

  // -------------------------------------------------------------------------
  // Fondo: partida IA contra IA en directo, o la imagen de 2013
  // -------------------------------------------------------------------------

  private live: LiveBackground | null = null;

  private createBackground(): void {
    this.live?.destroy();
    this.live = null;
    let bg: Phaser.GameObjects.Image | null = null;
    // La partida en directo sale aunque el sistema pida menos movimiento (entonces la camara salta en vez de deslizarse).
    if (settings.menuBg === 'live') {
      this.live = new LiveBackground(this);
      this.live.start();
    } else {
      bg = this.add.image(0, 0, ATLAS, 'menubackground').setScrollFactor(0);
    }
    const layout = () => {
      const { width, height } = this.scale;
      if (bg) {
        bg.setPosition(width / 2, height / 2);
        bg.setScale(Math.max(width / bg.width, height / bg.height));
      }
      this.live?.resize(width, height);
    };
    layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, layout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, layout);
      this.live?.destroy();
      this.live = null;
      resetActions();
      closeNotes();
    });
  }

  override update(time: number): void {
    this.live?.tick(time);
  }

  // -------------------------------------------------------------------------
  // Inicio: tarjetas
  // -------------------------------------------------------------------------

  private homeRows(): string[][] {
    const foot = ['news', 'help', 'options', 'credits', 'web'];
    return this.save
      ? [['continue', 'quick', 'campaign'], ['continue', 'custom', 'campaign'], foot]
      : [['quick', 'campaign'], ['custom', 'campaign'], foot];
  }

  private publishHome(): void {
    const s = this.save;
    const lang = settings.lang;
    let save = null;
    if (s) {
      const mission = s.mission ? (MISSIONS.find((m) => m.id === s.mission!.id)?.title[lang] ?? null) : null;
      save = {
        thumb: mapThumb(s, this.palette, { units: 'own' }),
        day: s.day,
        funds: s.funds[0],
        size: s.map.length,
        mission,
        limit: s.rules?.dayLimit ?? null,
      };
    }
    const done = completedMissions();
    const marks: MarkVM[] = MISSIONS.map((m, i) => (done.has(m.id) ? 'done' : missionUnlocked(i, done) ? 'open' : 'locked'));
    const nextIdx = MISSIONS.findIndex((m, i) => !done.has(m.id) && missionUnlocked(i, done));
    const next = nextIdx >= 0 ? MISSIONS[nextIdx]! : null;
    const o = this.options;
    const presetName = t(`preset${o.preset[0]!.toUpperCase()}${o.preset.slice(1)}` as TextKey);
    ui.set({
      home: {
        focus: this.homeFocus,
        save,
        quick: `${presetName} · ${o.size}×${o.size}${o.dayLimit ? ` · ${o.dayLimit} ${t('days')}` : ''}`,
        campaign: {
          done: marks.filter((m) => m === 'done').length,
          total: MISSIONS.length,
          next: next ? `${nextIdx + 1}. ${next.title[lang]}` : null,
          thumb: next ? this.missionThumb(nextIdx) : null,
          marks,
        },
        credits: ui.get().home.credits,
      },
    });
  }

  private homeCommand(cmd: MenuCommand): void {
    const rows = this.homeRows();
    if (ui.get().home.credits && (cmd.kind === 'back' || cmd.kind === 'ok')) return this.setCredits(false);
    if (cmd.kind === 'move') this.homeFocus = navGrid(rows, this.homeFocus, cmd.dx, cmd.dy);
    else if (cmd.kind === 'ok' && !cmd.repeat) return this.pickHome();
    else if (cmd.kind === 'options') return this.optionsPanel.open();
    else return;
    this.publishHome();
  }

  private setCredits(on: boolean): void {
    ui.set({ home: { ...ui.get().home, credits: on } });
  }

  private pickHome(): void {
    if (this.leaving) return;
    switch (this.homeFocus) {
      case 'continue':
        if (!this.save) return;
        this.leaving = true;
        this.scene.start('Game', { mode: 'load' });
        return;
      case 'quick':
        return this.startNew(randomSeed());
      case 'custom':
        return this.openSetup();
      case 'campaign':
        return this.openCampaign();
      case 'news':
        return openNotes();
      case 'help':
        return ui.set({ help: true });
      case 'options':
        return this.optionsPanel.open();
      case 'credits':
        return this.setCredits(!ui.get().home.credits);
      case 'web':
        window.open(WEB_URL, '_blank', 'noopener');
    }
  }

  // -------------------------------------------------------------------------
  // Nueva partida con vista previa
  // -------------------------------------------------------------------------

  private options!: NewGameOptions;
  private setupFocus = 'start';
  private code = '';
  private codeError = false;
  /** Semilla del mapa de la vista previa (la que se jugara). */
  private seed = 0;
  private thumb = '';
  private mapInfo = '';

  private openSetup(): void {
    this.mode = 'setup';
    this.setupFocus = 'start';
    this.code = '';
    this.codeError = false;
    this.seed = randomSeed();
    this.refreshPreview();
    ui.set({ screen: 'setup' });
    this.publishSetup();
  }

  private refreshPreview(): void {
    const o = this.options;
    const s = keepMapSize(() => generateGame(seededRng(this.seed), { size: o.size, theme: o.theme }));
    this.thumb = mapThumb(s, this.palette, { px: o.size <= 20 ? 10 : o.size <= 32 ? 7 : 6 });
    const themes =
      settings.lang === 'es' ? ['Llanura', 'Desierto', 'Bosque', 'Pantano', 'Nieve'] : ['Plains', 'Desert', 'Forest', 'Swamp', 'Snow'];
    this.mapInfo = `${o.size}×${o.size} · ${themes[s.theme] ?? ''} · ${s.buildings.length} ${settings.lang === 'es' ? 'edificios' : 'buildings'}`;
  }

  private setupRows(): string[][] {
    const rows: string[][] = [[...PRESET_IDS.map((p) => `preset-${p}`)]];
    if (GENERALS.length) rows.push(['opt-general'], ['opt-enemyGeneral']);
    if (this.options.preset === 'custom') for (const g of CUSTOM_GROUPS) for (const k of g.keys) rows.push([`opt-${k.k}`]);
    rows.push(['code', 'reroll']);
    rows.push(['back', 'start']);
    return rows;
  }

  private publishSetup(): void {
    const o = this.options;
    const presets: PresetVM[] = PRESET_IDS.map((p) => {
      const cap = `${p[0]!.toUpperCase()}${p.slice(1)}`;
      return { id: p, label: t(`preset${cap}` as TextKey), note: t(`preset${cap}Note` as TextKey) };
    });
    const groups = CUSTOM_GROUPS.map((g) => ({
      title: t(g.title),
      rows: g.keys.map(({ k, label }): OptionRowVM => {
        const list = CHOICES[k] as readonly unknown[];
        return {
          id: `opt-${k}`,
          group: t(g.title),
          label: t(label),
          choices: list.map((v) => choiceLabel(k, v)),
          index: Math.max(0, list.indexOf(o[k])),
        };
      }),
    }));
    ui.set({
      setup: {
        focus: this.setupFocus,
        preset: o.preset,
        presets,
        groups,
        general: GENERALS.length
          ? {
              id: 'opt-general',
              group: t('optGeneral'),
              label: t('optGeneral'),
              choices: CHOICES.general.map((v) => choiceLabel('general', v)),
              index: Math.max(0, CHOICES.general.indexOf(o.general)),
            }
          : null,
        enemyGeneral: GENERALS.length
          ? {
              id: 'opt-enemyGeneral',
              group: t('optEnemyGeneral'),
              label: t('optEnemyGeneral'),
              choices: CHOICES.enemyGeneral.map((v) => choiceLabel('enemyGeneral', v)),
              index: Math.max(0, CHOICES.enemyGeneral.indexOf(o.enemyGeneral)),
            }
          : null,
        generalNote: GENERALS.find((g) => g.id === o.general)?.description[settings.lang] ?? '',
        code: this.code,
        codeError: this.codeError,
        mapCode: seedToCode(this.seed),
        thumb: this.thumb,
        mapInfo: this.mapInfo,
      },
    });
  }

  /** Cambia una opcion de "Personalizada" (id "opt-xxx"). */
  private setChoice(id: string, index: number): void {
    const k = id.replace(/^opt-/, '') as ChoiceKey;
    if (!(k in CHOICES)) return this.publishSetup();
    const list = CHOICES[k] as readonly unknown[];
    (this.options as unknown as Record<string, unknown>)[k] = list[(index + list.length) % list.length];
    saveOptions(this.options);
    if (k === 'size' || k === 'theme') this.refreshPreview();
    this.publishSetup();
  }

  private pickPreset(p: PresetId): void {
    const before = this.options.size;
    this.options = applyPreset(this.options, p);
    saveOptions(this.options);
    if (this.options.size !== before) this.refreshPreview();
    // En "Personalizada", el foco baja a la primera opcion.
    if (p === 'custom') this.setupFocus = `opt-${CUSTOM_GROUPS[0]!.keys[0]!.k}`;
  }

  private pickSetup(): void {
    const f = this.setupFocus;
    if (f.startsWith('preset-')) this.pickPreset(f.slice(7) as PresetId);
    else if (f.startsWith('opt-')) {
      const k = f.slice(4) as ChoiceKey;
      const list = CHOICES[k] as readonly unknown[];
      return this.setChoice(f, list.indexOf(this.options[k]) + 1);
    } else if (f === 'reroll') {
      this.code = '';
      this.codeError = false;
      this.seed = randomSeed();
      this.refreshPreview();
    } else if (f === 'code') {
      document.querySelector<HTMLInputElement>('.ng-code')?.focus();
    } else if (f === 'back') return this.toHome();
    else if (f === 'start') return this.startFromSetup();
    this.publishSetup();
  }

  private startFromSetup(): void {
    if (this.code) {
      const s = codeToSeed(this.code);
      if (s === null) {
        this.codeError = true;
        return this.publishSetup();
      }
      this.seed = s;
    }
    this.startNew(this.seed);
  }

  private startNew(seed: number): void {
    if (this.leaving) return;
    this.leaving = true;
    (document.activeElement as HTMLElement | null)?.blur?.();
    const o = this.options;
    this.scene.start('Game', {
      mode: 'new',
      rules: rulesFor(o),
      setup: { seed, size: o.size, theme: o.theme },
      general: o.general,
      enemyGeneral: o.enemyGeneral,
    });
  }

  /** Escribiendo el codigo: Enter empieza; Esc o arriba/abajo salen del cuadro (MENU_BINDINGS.typing). */
  private typingCommand(cmd: MenuCommand): void {
    if (cmd.kind === 'ok') return this.startFromSetup();
    if (cmd.kind !== 'back' && !(cmd.kind === 'move' && cmd.dy)) return;
    (document.activeElement as HTMLElement).blur();
    if (cmd.kind === 'move') this.moveSetup(0, cmd.dy);
  }

  private setupCommand(cmd: MenuCommand): void {
    const f = this.setupFocus;
    const dx = cmd.kind === 'move' ? cmd.dx : 0;
    if (dx && f.startsWith('opt-')) {
      const k = f.slice(4) as ChoiceKey;
      return this.setChoice(f, (CHOICES[k] as readonly unknown[]).indexOf(this.options[k]) + dx);
    }
    if (cmd.kind === 'move') return this.moveSetup(cmd.dx, cmd.dy);
    if (cmd.kind === 'ok' && !cmd.repeat) return this.pickSetup();
    if (cmd.kind === 'reroll') {
      this.setupFocus = 'reroll';
      return this.pickSetup();
    }
    if (cmd.kind === 'back') this.toHome();
  }

  private moveSetup(dx: number, dy: number): void {
    const rows = this.setupRows();
    // Desde los ajustes, bajar va al que esta elegido.
    this.setupFocus = navGrid(rows, this.setupFocus, dx, dy);
    this.publishSetup();
  }

  // -------------------------------------------------------------------------
  // Campaña
  // -------------------------------------------------------------------------

  private campaignSel = 0;
  private thumbs = new Map<number, string>();

  private missionThumb(i: number): string {
    let th = this.thumbs.get(i);
    if (!th) {
      const m = MISSIONS[i]!;
      const s = keepMapSize(() => buildMission(m));
      th = mapThumb(s, this.palette, { units: true, px: 6 });
      this.thumbs.set(i, th);
    }
    return th;
  }

  private openCampaign(): void {
    this.mode = 'campaign';
    const done = completedMissions();
    const next = MISSIONS.findIndex((m, i) => !done.has(m.id) && missionUnlocked(i, done));
    this.campaignSel = next >= 0 ? next : 0;
    ui.set({ screen: 'campaign' });
    this.publishCampaign();
  }

  private publishCampaign(): void {
    const done = completedMissions();
    const lang = settings.lang;
    const items: CampaignItemVM[] = MISSIONS.map((m, i) => ({
      id: m.id,
      title: m.title[lang],
      status: done.has(m.id) ? 'done' : missionUnlocked(i, done) ? 'open' : 'locked',
      thumb: this.missionThumb(i),
      kind: t(OBJECTIVE_KEY[m.objective.kind] ?? 'objHq'),
      best: bestDays(m.id),
    }));
    const m = MISSIONS[this.campaignSel]!;
    ui.set({ campaign: { items, selected: this.campaignSel, brief: m.brief[lang], objective: objectiveText(m) } });
  }

  private startMission(): void {
    if (this.leaving || !missionUnlocked(this.campaignSel)) return this.publishCampaign();
    this.leaving = true;
    const m = MISSIONS[this.campaignSel]!;
    useRules(missionRules(m));
    this.scene.start('Game', { mode: 'mission', mission: m.id });
  }

  private campaignCommand(cmd: MenuCommand): void {
    const n = MISSIONS.length;
    const step = listStep(cmd);
    if (step) this.campaignSel = (this.campaignSel + step + n) % n;
    else if (cmd.kind === 'ok' && !cmd.repeat) return this.startMission();
    else if (cmd.kind === 'back') return this.toHome();
    else return;
    this.publishCampaign();
  }
}
