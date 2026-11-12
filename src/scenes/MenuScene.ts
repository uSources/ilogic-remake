/**
 * Menu principal: reparte las ordenes entre sus pantallas (inicio, partida nueva y campaña, cada una
 * en `src/menu/` con su `...Host`), las opciones, las notas y la ayuda. Detras, una partida IA contra
 * IA o la imagen original.
 */
import { defaultContent } from '../core/content/default';
import { settingsWith } from '../core/matchSettings';
import Phaser from 'phaser';
import { ATLAS } from '../atlas';
import type { Mission } from '../core/missions';
import { loadGame } from '../core/defaultGames';
import type { GameState } from '../core/model';
import { resetActions, ui } from '../hud/store';
import { helpRulesForSettingsOnly } from '../hud/helpText';
import { onceEachKey } from '../controls/browserKeys';
import { menuKeyCommand, type MenuCommand, type MenuContext } from '../controls/menu';
import { CampaignScreen, type CampaignHost } from '../menu/campaignScreen';
import { HomeScreen, type HomeHost } from '../menu/homeScreen';
import { LiveBackground } from '../menu/liveBackground';
import { OptionsPanel } from '../menu/optionsPanel';
import { isTypingInvite, OnlineScreen, type OnlineHost } from '../menu/onlineScreen';
import { isTypingCode, SetupScreen, type SetupHost } from '../menu/setupScreen';
import { parseInvite } from '../net/onlineRooms';
import type { OnlineMatch } from '../net/onlineMatch';
import { playMusic } from '../music';
import { checkNotes, closeNotes, notesCommand, notesOpen } from '../patchNotes';
import { matchConfigFor, randomSeed } from '../setup';
import { settings } from '../settings';
import { readSave } from '../storage';
import { terrainPalette, type TerrainPalette } from '../ui/terrainColors';
import { live } from './game/host';
import type { GameStartData } from './game/types';

type Mode = 'home' | 'setup' | 'campaign' | 'online';

/** Ajustes que cambian el fondo del menu: hay que volver a crear la escena. */
const isBackgroundSetting = (key: string) => key === 'menuBg' || key === 'terrainArt';

const blurFocusedElement = () => (document.activeElement as HTMLElement | null)?.blur?.();

export class MenuScene extends Phaser.Scene {
  private mode: Mode = 'home';
  private leaving = false;
  private save: GameState | null = null;
  private optionsPanel!: OptionsPanel;
  private palette: TerrainPalette = {};
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
      openOnline: () => this.openOnline(),
      openOptions: () => this.optionsPanel.open(),
    }),
  );

  private readonly online: OnlineScreen = new OnlineScreen(
    live<OnlineHost>({
      palette: { get: () => this.palette },
      toHome: () => this.toHome(),
      startOnline: (match: OnlineMatch) => this.startOnline(match),
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
      startMission: (mission: Mission) => this.startMission(mission),
    }),
  );

  constructor() {
    super('Menu');
  }

  create(data?: { open?: 'setup' | 'online' }): void {
    this.leaving = false;
    this.mode = 'home';
    this.palette = terrainPalette(this.textures);
    this.createBackground();

    const raw = readSave();
    const save = raw ? loadGame(raw) : null;
    this.save = save;
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

    Object.assign(ui.actions, this.home.actions(), this.setup.actions(), this.campaign.actions(), this.online.actions());
    // La ayuda del menu cuenta las reglas de una partida nueva de las de siempre.
    ui.set({
      screen: 'menu',
      options: null,
      pause: null,
      toast: null,
      banner: null,
      report: null,
      helpRules: helpRulesForSettingsOnly(settingsWith(defaultContent())),
    });
    this.home.publish();
    if (data?.open === 'setup') this.openSetup();
    if (data?.open === 'online') this.openOnline();
    this.openInviteFromHash();

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
    if (this.optionsPanel.isOpen) return this.optionsPanel.context();
    if (this.mode === 'setup') return isTypingCode() ? 'typing' : 'setup';
    if (this.mode === 'campaign') return 'campaign';
    if (this.mode === 'online') return isTypingInvite() ? 'typing' : 'online';
    return 'home';
  }

  /** Cumplir una orden de menu, venga del mando que venga. */
  menu(command: MenuCommand): void {
    if (this.leaving) return;
    if (ui.get().help) return this.helpCommand(command);
    if (notesOpen()) return notesCommand(command);
    if (this.optionsPanel.isOpen) return this.optionsPanel.command(command);
    if (this.mode === 'setup') return isTypingCode() ? this.setup.typingCommand(command) : this.setup.command(command);
    if (this.mode === 'campaign') return this.campaign.command(command);
    if (this.mode === 'online') return isTypingInvite() ? this.online.typingCommand(command) : this.online.command(command);
    this.home.command(command);
  }

  private helpCommand(command: MenuCommand): void {
    if (command.kind === 'back' || command.kind === 'ok' || command.kind === 'help') ui.set({ help: false });
  }

  /** Adaptador de teclado: la tecla, en el menu que tiene el foco, es una orden MenuCommand. */
  private listenToKeyboard(): void {
    const keyboard = this.input.keyboard!;
    // Las teclas que captura la partida (Retroceso, flechas...) siguen capturadas: liberarlas para el campo de texto.
    keyboard.clearCaptures();
    keyboard.addCapture('SPACE,UP,DOWN,LEFT,RIGHT');
    keyboard.on(
      'keydown',
      onceEachKey((event: KeyboardEvent) => this.onKey(event)),
    );
  }

  private onKey(event: KeyboardEvent): void {
    if (this.leaving) return;
    const command = menuKeyCommand(event, this.controlContext());
    if (!command) return;
    // La tecla que el jugador elige para una orden es para el juego, no para el navegador (Tab, F5...).
    if (command.kind === 'key') event.preventDefault();
    this.menu(command);
  }

  private publishAll(): void {
    if (this.mode === 'home') this.home.publish();
    else if (this.mode === 'setup') this.setup.publish();
    else if (this.mode === 'online') this.online.publish();
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

  private openOnline(): void {
    this.mode = 'online';
    this.online.open();
  }

  /** Un enlace de invitacion en la direccion (`#/sala/CODIGO/FICHA`): directo a esa sala. */
  private openInviteFromHash(): void {
    const invite = parseInvite(location.hash);
    if (!invite) return;
    history.replaceState(null, '', location.pathname + location.search);
    this.mode = 'online';
    this.online.openRoom(invite.code, invite.token);
  }

  /** La sala ya juega: la escena sigue la partida con su conexion. */
  private startOnline(match: OnlineMatch): void {
    if (this.leaving) return match.close();
    this.leaving = true;
    blurFocusedElement();
    this.scene.start('Game', { start: 'online', online: match } satisfies GameStartData);
  }

  private continueGame(): void {
    this.leaving = true;
    this.scene.start('Game', { start: 'load' } satisfies GameStartData);
  }

  private startNew(seed: number): void {
    if (this.leaving) return;
    this.leaving = true;
    blurFocusedElement();
    this.scene.start('Game', { start: 'new', match: matchConfigFor(this.setup.options, seed) } satisfies GameStartData);
  }

  private startMission(mission: Mission): void {
    this.leaving = true;
    this.scene.start('Game', {
      start: 'new',
      match: { mode: 'mission', mission: mission.id, seed: randomSeed() },
    } satisfies GameStartData);
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
      this.online.destroy();
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
