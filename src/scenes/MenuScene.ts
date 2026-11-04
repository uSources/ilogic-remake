/**
 * Menu principal: reparte las ordenes entre sus pantallas (inicio, partida nueva y campaña, cada una
 * en `src/menu/` con su `...Host`), las opciones, las notas y la ayuda. Detras, una partida IA contra
 * IA o la imagen original.
 */
import { defaultContent } from '../core/content/default';
import { rulesWith } from '../core/rulesConfig';
import Phaser from 'phaser';
import { ATLAS } from '../atlas';
import type { MissionDef } from '../core/missions';
import { loadGame } from '../core/defaultGames';
import type { GameState } from '../core/model';
import { resetActions, ui } from '../hud/store';
import { menuKeyCommand, type MenuCommand, type MenuContext } from '../controls/menu';
import { CampaignScreen, type CampaignHost } from '../menu/campaignScreen';
import { HomeScreen, type HomeHost } from '../menu/homeScreen';
import { LiveBackground } from '../menu/liveBackground';
import { OptionsPanel } from '../menu/optionsPanel';
import { isTypingCode, SetupScreen, type SetupHost } from '../menu/setupScreen';
import { playMusic } from '../music';
import { checkNotes, closeNotes, notesCommand, notesOpen } from '../patchNotes';
import { ruleChangesFor } from '../setup';
import { settings } from '../settings';
import { readSave } from '../storage';
import { terrainPalette } from '../ui/terrainColors';
import { live } from './game/host';

type Mode = 'home' | 'setup' | 'campaign';

/** Ajustes que cambian el fondo del menu: hay que volver a crear la escena. */
const isBackgroundSetting = (key: string) => key === 'menuBg' || key === 'terrainArt';

const blurFocusedElement = () => (document.activeElement as HTMLElement | null)?.blur?.();

export class MenuScene extends Phaser.Scene {
  private mode: Mode = 'home';
  private leaving = false;
  private save: GameState | null = null;
  private optionsPanel!: OptionsPanel;
  private palette: number[] = [];
  private liveBackground: LiveBackground | null = null;

  private readonly home = new HomeScreen(
    live<HomeHost>({
      save: { get: () => this.save },
      palette: { get: () => this.palette },
      options: { get: () => this.setup.options },
      leaving: { get: () => this.leaving },
      missionThumb: (index: number) => this.campaign.missionThumb(index),
      continueGame: () => this.continueGame(),
      startNew: (seed: number) => this.startNew(seed),
      openSetup: () => this.openSetup(),
      openCampaign: () => this.openCampaign(),
      openOptions: () => this.optionsPanel.open(),
    }),
  );

  private readonly setup: SetupScreen = new SetupScreen(
    live<SetupHost>({
      palette: { get: () => this.palette },
      toHome: () => this.toHome(),
      startNew: (seed: number) => this.startNew(seed),
    }),
  );

  // Se crea una vez con la escena: las miniaturas de las misiones se guardan entre visitas al menu.
  private readonly campaign: CampaignScreen = new CampaignScreen(
    live<CampaignHost>({
      palette: { get: () => this.palette },
      leaving: { get: () => this.leaving },
      toHome: () => this.toHome(),
      startMission: (mission: MissionDef) => this.startMission(mission),
    }),
  );

  constructor() {
    super('Menu');
  }

  create(data?: { open?: 'setup' }): void {
    this.leaving = false;
    this.mode = 'home';
    this.palette = terrainPalette(this.textures);
    this.createBackground();

    const raw = readSave();
    this.save = raw ? loadGame(raw) : null;
    this.setup.loadOptions();
    this.home.focus = this.save ? 'continue' : 'quick';
    this.optionsPanel = new OptionsPanel(
      this,
      'menu',
      (key) => {
        if (key === 'lang') this.publishAll();
        if (isBackgroundSetting(key)) this.scene.restart();
      },
      () => this.publishAll(),
    );

    Object.assign(ui.actions, this.home.actions(), this.setup.actions(), this.campaign.actions());
    // La ayuda del menu cuenta las reglas de una partida nueva de las de siempre.
    ui.set({ screen: 'menu', options: null, pause: null, toast: null, banner: null, report: null, helpRules: rulesWith(defaultContent()) });
    this.home.publish();
    if (data?.open === 'setup') this.openSetup();

    this.listenToKeyboard();
    playMusic(this, 'menu');
    // Notas de parche nuevas en GitHub (marca en "Novedades"); sin conexion no pasa nada.
    void checkNotes();
  }

  override update(time: number): void {
    this.liveBackground?.tick(time);
  }

  /** El menu que tiene el foco (decide que teclas valen). Mismo orden que menu(). */
  controlContext(): MenuContext {
    if (ui.get().help) return 'help';
    if (notesOpen()) return 'notes';
    if (this.optionsPanel.isOpen) return 'options';
    if (this.mode === 'setup') return isTypingCode() ? 'typing' : 'setup';
    if (this.mode === 'campaign') return 'campaign';
    return 'home';
  }

  /** Cumplir una orden de menu, venga del mando que venga. */
  menu(cmd: MenuCommand): void {
    if (this.leaving) return;
    if (ui.get().help) return this.helpCommand(cmd);
    if (notesOpen()) return notesCommand(cmd);
    if (this.optionsPanel.isOpen) return this.optionsPanel.command(cmd);
    if (this.mode === 'setup') return isTypingCode() ? this.setup.typingCommand(cmd) : this.setup.command(cmd);
    if (this.mode === 'campaign') return this.campaign.command(cmd);
    this.home.command(cmd);
  }

  private helpCommand(cmd: MenuCommand): void {
    if (cmd.kind === 'back' || cmd.kind === 'ok' || cmd.kind === 'help') ui.set({ help: false });
  }

  /** Adaptador de teclado: la tecla, en el menu que tiene el foco, es una orden MenuCommand. */
  private listenToKeyboard(): void {
    const keyboard = this.input.keyboard!;
    // Las teclas que captura la partida (Retroceso, flechas...) siguen capturadas: liberarlas para el campo de texto.
    keyboard.clearCaptures();
    keyboard.addCapture('SPACE,UP,DOWN,LEFT,RIGHT');
    keyboard.on('keydown', (event: KeyboardEvent) => this.onKey(event));
  }

  private onKey(event: KeyboardEvent): void {
    if (this.leaving) return;
    const cmd = menuKeyCommand(event, this.controlContext());
    if (cmd) this.menu(cmd);
  }

  private publishAll(): void {
    if (this.mode === 'home') this.home.publish();
    else if (this.mode === 'setup') this.setup.publish();
    else this.campaign.publish();
  }

  // --- Cambiar de pantalla o salir del menu ----------------------------------------------------

  private toHome(): void {
    this.mode = 'home';
    blurFocusedElement();
    ui.set({ screen: 'menu' });
    this.home.publish();
  }

  private openSetup(): void {
    this.mode = 'setup';
    this.setup.open();
  }

  private openCampaign(): void {
    this.mode = 'campaign';
    this.campaign.open();
  }

  private continueGame(): void {
    this.leaving = true;
    this.scene.start('Game', { mode: 'load' });
  }

  private startNew(seed: number): void {
    if (this.leaving) return;
    this.leaving = true;
    blurFocusedElement();
    const options = this.setup.options;
    this.scene.start('Game', {
      mode: 'new',
      rules: ruleChangesFor(options),
      setup: { seed, size: options.size, theme: options.theme },
      general: options.general,
      enemyGeneral: options.enemyGeneral,
    });
  }

  private startMission(mission: MissionDef): void {
    this.leaving = true;
    this.scene.start('Game', { mode: 'mission', mission: mission.id });
  }

  // --- Fondo: partida IA contra IA en directo, o la imagen de 2013 -----------------------------

  private createBackground(): void {
    this.liveBackground?.destroy();
    this.liveBackground = null;
    // La partida en directo sale aunque el sistema pida menos movimiento (entonces la camara salta en vez de deslizarse).
    const image = settings.menuBg === 'live' ? null : this.add.image(0, 0, ATLAS, 'menubackground').setScrollFactor(0);
    if (!image) {
      this.liveBackground = new LiveBackground(this);
      this.liveBackground.start();
    }
    const layout = () => this.layoutBackground(image);
    layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, layout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, layout);
      this.liveBackground?.destroy();
      this.liveBackground = null;
      resetActions();
      closeNotes();
    });
  }

  /** La imagen cubre la pantalla entera, centrada; la partida en directo se ajusta al tamaño. */
  private layoutBackground(image: Phaser.GameObjects.Image | null): void {
    const { width, height } = this.scale;
    if (image) {
      image.setPosition(width / 2, height / 2);
      image.setScale(Math.max(width / image.width, height / image.height));
    }
    this.liveBackground?.resize(width, height);
  }
}
