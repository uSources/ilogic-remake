import Phaser from 'phaser';
import { aiTurn } from '../core/ai';
import { DEFAULT_RULES, useRules } from '../core/data';
import { seededRng } from '../core/geom';
import { generateGame } from '../core/mapgen';
import { buildMission, MISSIONS, missionRules } from '../core/missions';
import { endRound, outcome } from '../core/rules';
import { deserialize } from '../core/save';
import type { GameEvent, GameState, Pos, Team } from '../core/types';
import { bestDays, completedMissions, missionUnlocked, objectiveText } from '../campaign';
import { ui, type CampaignItemVM, type MarkVM, type OptionRowVM, type PresetVM } from '../hud/store';
import { WEB_URL } from '../layout';
import { KEY_BACK, KEY_DOWN, KEY_LEFT, KEY_OK, KEY_RIGHT, KEY_UP, navGrid } from '../menu/nav';
import { OptionsPanel } from '../menu/optionsPanel';
import { keepMapSize, mapThumb } from '../menu/thumb';
import { playMusic } from '../music';
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
import { MapView } from '../ui/mapView';
import { burst, center, COLORS, floatText, lunge, reducedMotion, tileFlash } from '../ui/fx';
import { TILE } from '../layout';
import { terrainPalette } from '../ui/terrainColors';

type Mode = 'home' | 'setup' | 'campaign';

/** Grupos de opciones de "Personalizada". */
const CUSTOM_GROUPS: { title: TextKey; keys: { k: ChoiceKey; label: TextKey }[] }[] = [
  { title: 'optGroupGame', keys: [{ k: 'fog', label: 'optFog' }, { k: 'dayLimit', label: 'optDayLimit' }] },
  { title: 'optSize', keys: [{ k: 'size', label: 'optSize' }, { k: 'theme', label: 'optTheme' }] },
  { title: 'optFunds', keys: [{ k: 'funds', label: 'optFunds' }, { k: 'income', label: 'optIncome' }] },
];

const OBJECTIVE_KEY: Record<string, TextKey> = { hq: 'objHq', survive: 'objSurvive', capture: 'objCapture', destroy: 'objDestroy', escort: 'objEscort' };

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
        if (key === 'menuBg') this.scene.restart();
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
        this.code = text.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 7);
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
  }

  private onKey(e: KeyboardEvent): void {
    if (this.leaving) return;
    if (ui.get().help) {
      if ([...KEY_BACK, ...KEY_OK, 'KeyH'].includes(e.code)) ui.set({ help: false });
      return;
    }
    if (this.optionsPanel.isOpen) return this.optionsPanel.key(e);
    if (this.mode === 'setup') return this.setupKey(e);
    if (this.mode === 'campaign') return this.campaignKey(e);
    this.homeKey(e);
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

  private bgGame: GameState | null = null;
  private bgView: MapView | null = null;
  private bgEvents: Generator<GameEvent> | null = null;
  private bgTeam: Team = 0;
  private bgRng = seededRng(1);

  private createBackground(): void {
    this.bgGame = null;
    this.bgView = null;
    let bg: Phaser.GameObjects.Image | null = null;
    // La partida en directo sale aunque el sistema pida menos movimiento (entonces la camara salta en vez de deslizarse).
    if (settings.menuBg === 'live') {
      this.startBgGame();
    } else {
      bg = this.add.image(0, 0, 'menubackground').setScrollFactor(0);
    }
    const layout = () => {
      const { width, height } = this.scale;
      if (bg) {
        bg.setPosition(width / 2, height / 2);
        bg.setScale(Math.max(width / bg.width, height / bg.height));
      }
      this.bgView?.resize(width, height);
      this.tightBounds();
    };
    layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, layout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, layout);
      this.bgGame = null;
      this.bgView = null;
      this.bgEvents = null;
      this.bgToken++;
    });
  }

  private startBgGame(): void {
    useRules({ ...DEFAULT_RULES, fog: false });
    const seed = randomSeed();
    this.bgRng = seededRng(seed ^ 0x5bd1e995);
    this.bgGame = generateGame(seededRng(seed), { size: 32 });
    if (!this.bgView) this.bgView = new MapView(this);
    this.bgView.buildTerrain(this.bgGame);
    const hq = this.bgGame.buildings.find((b) => b.owner === 0) ?? { x: 16, y: 16 };
    this.bgView.centerOn(hq, true);
    this.tightBounds();
    this.bgView.placeCursor(false);
    this.bgTeam = 0;
    this.bgEvents = aiTurn(this.bgGame, this.bgRng, 0);
    this.renderBg();
    void this.bgLoop();
  }

  /** Que la camara del fondo no salga del mapa (sin los margenes de la partida). */
  private tightBounds(): void {
    const s = this.bgGame;
    if (!s) return;
    const cam = this.cameras.main;
    const mw = s.map.length * TILE,
      mh = s.map[0]!.length * TILE;
    const vw = cam.width / cam.zoom,
      vh = cam.height / cam.zoom;
    cam.setBounds(Math.min(0, (mw - vw) / 2), Math.min(0, (mh - vh) / 2), Math.max(mw, vw), Math.max(mh, vh));
  }

  private renderBg(): void {
    const s = this.bgGame;
    if (!s || !this.bgView) return;
    const vis = Array.from({ length: s.map.length }, () => Array<boolean>(s.map.length).fill(true));
    this.bgView.render(s, { vis, highlights: new Map(), hidden: new Set() });
    this.bgView.placeCursor(false);
  }

  /** Bucle de la partida de fondo: cada accion de la IA se anima y la camara la sigue. */
  private async bgLoop(): Promise<void> {
    const token = ++this.bgToken;
    const alive = () => token === this.bgToken && !!this.bgGame && this.scene.isActive();
    await this.pause(600);
    while (alive()) {
      const s = this.bgGame!;
      const r = this.bgEvents!.next();
      if (r.done) {
        if (this.bgTeam === 0) this.bgTeam = 1;
        else {
          endRound(s);
          this.bgTeam = 0;
        }
        if (outcome(s) !== 'playing' || s.day > 45) {
          this.startBgGame();
          continue;
        }
        this.bgEvents = aiTurn(s, this.bgRng, this.bgTeam);
        await this.pause(400);
        continue;
      }
      await this.animateBg(r.value);
      if (!alive()) return;
      this.renderBg();
      await this.pause(r.value.kind === 'wait' ? 30 : 220);
    }
  }

  private bgToken = 0;

  private pause(ms: number): Promise<void> {
    return new Promise((res) => this.time.delayedCall(ms, res));
  }

  /**
   * Lleva la camara (despacio) para que la accion se vea en un lateral de la pantalla: el centro lo
   * tapan las tarjetas del menu.
   */
  private async follow(p: Pos): Promise<void> {
    const cam = this.cameras.main;
    const c = center(p);
    const z = cam.zoom;
    const W = cam.width,
      H = cam.height;
    const sx = (c.x - cam.worldView.x) * z,
      sy = (c.y - cam.worldView.y) * z;
    const side = W < 900 ? 0.5 : 0.16;
    const inBand = sy > H * 0.12 && sy < H * 0.88 && (W < 900 ? sx > W * 0.1 && sx < W * 0.9 : sx < W * 0.3 || sx > W * 0.7) && sx > 0 && sx < W;
    if (inBand) return;
    const tx = sx < W / 2 ? W * side : W * (1 - side);
    const midX = c.x + (W / 2 - tx) / z;
    const ms = 1100;
    if (reducedMotion()) {
      cam.centerOn(midX, c.y);
      return;
    }
    cam.pan(midX, c.y, ms, 'Sine.easeInOut', true);
    await this.pause(ms);
  }

  private async animateBg(ev: GameEvent): Promise<void> {
    const view = this.bgView!;
    switch (ev.kind) {
      case 'move':
      case 'merge':
      case 'load': {
        const sp = view.unitSprite(ev.uid);
        if (!sp || ev.path.length < 2) return;
        await this.follow(ev.path[ev.path.length - 1]!);
        for (const p of ev.path.slice(1)) {
          await new Promise<void>((res) => this.tweens.add({ targets: sp, x: p.x * TILE, y: p.y * TILE, duration: 90, onComplete: () => res() }));
        }
        return;
      }
      case 'attack': {
        await this.follow(ev.target);
        const sp = view.unitSprite(ev.attacker);
        const s = this.bgGame!;
        const atk = s.units.find((u) => u.uid === ev.attacker);
        if (sp && atk) await lunge(this, sp, { dx: Math.sign(ev.target.x - atk.x), dy: Math.sign(ev.target.y - atk.y) });
        const c = center(ev.target);
        void burst(this, view, c, { colors: ev.killed ? COLORS.smoke : COLORS.fire, count: ev.killed ? 16 : 10, radius: ev.killed ? 26 : 18 });
        await floatText(this, view, { x: c.x, y: c.y - 6 }, `-${ev.damage}`, '#ff7a73');
        return;
      }
      case 'capture':
        await this.follow(ev.at);
        void burst(this, view, center(ev.at), { colors: COLORS.gold, count: 12, radius: 22 });
        await tileFlash(this, view, ev.at, 0xffd447);
        return;
      case 'spawn':
        await this.follow(ev.at);
        this.renderBg();
        await tileFlash(this, view, ev.at, 0xffffff);
        return;
    }
  }

  override update(time: number, delta: number): void {
    if (!this.bgView || !this.bgGame) return;
    this.bgView.tick(time, delta);
  }

  // -------------------------------------------------------------------------
  // Inicio: tarjetas
  // -------------------------------------------------------------------------

  private homeRows(): string[][] {
    const foot = ['help', 'options', 'credits', 'web'];
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

  private homeKey(e: KeyboardEvent): void {
    const rows = this.homeRows();
    if (ui.get().home.credits && (KEY_BACK.includes(e.code) || KEY_OK.includes(e.code))) return this.setCredits(false);
    if (KEY_LEFT.includes(e.code)) this.homeFocus = navGrid(rows, this.homeFocus, -1, 0);
    else if (KEY_RIGHT.includes(e.code)) this.homeFocus = navGrid(rows, this.homeFocus, 1, 0);
    else if (KEY_UP.includes(e.code)) this.homeFocus = navGrid(rows, this.homeFocus, 0, -1);
    else if (KEY_DOWN.includes(e.code)) this.homeFocus = navGrid(rows, this.homeFocus, 0, 1);
    else if (KEY_OK.includes(e.code) && !e.repeat) return this.pickHome();
    else if (e.code === 'KeyO') return this.optionsPanel.open();
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
    const themes = settings.lang === 'es' ? ['Llanura', 'Desierto', 'Bosque', 'Pantano', 'Nieve'] : ['Plains', 'Desert', 'Forest', 'Swamp', 'Snow'];
    this.mapInfo = `${o.size}×${o.size} · ${themes[s.theme] ?? ''} · ${s.buildings.length} ${settings.lang === 'es' ? 'edificios' : 'buildings'}`;
  }

  private setupRows(): string[][] {
    const rows: string[][] = [[...PRESET_IDS.map((p) => `preset-${p}`)]];
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
        return { id: `opt-${k}`, group: t(g.title), label: t(label), choices: list.map((v) => choiceLabel(k, v)), index: Math.max(0, list.indexOf(o[k])) };
      }),
    }));
    ui.set({
      setup: {
        focus: this.setupFocus,
        preset: o.preset,
        presets,
        groups,
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
      (document.querySelector('.ng-code') as HTMLInputElement | null)?.focus();
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
    this.scene.start('Game', { mode: 'new', rules: rulesFor(o), setup: { seed, size: o.size, theme: o.theme } });
  }

  private setupKey(e: KeyboardEvent): void {
    const typing = (document.activeElement as HTMLElement | null)?.tagName === 'INPUT';
    if (typing) {
      if (e.code === 'Enter' || e.code === 'NumpadEnter') this.startFromSetup();
      else if (e.code === 'Escape' || e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        (document.activeElement as HTMLElement).blur();
        if (e.code !== 'Escape') this.moveSetup(0, e.code === 'ArrowUp' ? -1 : 1);
      }
      return;
    }
    const f = this.setupFocus;
    const dx = KEY_LEFT.includes(e.code) ? -1 : KEY_RIGHT.includes(e.code) ? 1 : 0;
    if (dx && f.startsWith('opt-')) {
      const k = f.slice(4) as ChoiceKey;
      return this.setChoice(f, (CHOICES[k] as readonly unknown[]).indexOf(this.options[k]) + dx);
    }
    if (dx) return this.moveSetup(dx, 0);
    if (KEY_UP.includes(e.code)) return this.moveSetup(0, -1);
    if (KEY_DOWN.includes(e.code)) return this.moveSetup(0, 1);
    if (KEY_OK.includes(e.code) && !e.repeat) return this.pickSetup();
    if (e.code === 'KeyR') {
      this.setupFocus = 'reroll';
      return this.pickSetup();
    }
    if (KEY_BACK.includes(e.code)) this.toHome();
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

  private campaignKey(e: KeyboardEvent): void {
    const n = MISSIONS.length;
    if ([...KEY_LEFT, ...KEY_UP].includes(e.code)) this.campaignSel = (this.campaignSel - 1 + n) % n;
    else if ([...KEY_RIGHT, ...KEY_DOWN].includes(e.code)) this.campaignSel = (this.campaignSel + 1) % n;
    else if (KEY_OK.includes(e.code) && !e.repeat) return this.startMission();
    else if (KEY_BACK.includes(e.code)) return this.toHome();
    else return;
    this.publishCampaign();
  }
}
