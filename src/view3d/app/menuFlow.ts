/**
 * El menu principal del juego 3D: reparte las ordenes entre sus pantallas (inicio, partida nueva,
 * campaña y «Jugar en línea», cada una en `src/menu/` con su `...Host`), las opciones, las notas y la
 * ayuda, y empieza la partida elegida (gameStart.ts). Un enlace de sala en la direccion
 * (`#/sala/CODIGO`, o el de un asiento con su ficha) entra directo en esa sala. Detras, la imagen del
 * menu de siempre.
 */
import { defaultContent } from '../../core/content/default';
import { loadGame } from '../../core/defaultGames';
import { settingsWith } from '../../core/matchSettings';
import type { Mission } from '../../core/missions';
import type { GameState } from '../../core/model';
import { imgUrl } from '../../assets';
import { playMusic } from '../../audio/music';
import type { SoundPort } from '../../audio/sounds';
import { menuKeyCommand, type MenuCommand, type MenuContext } from '../../controls/menu';
import { helpRulesForSettingsOnly } from '../../hud/helpText';
import { ui } from '../../hud/store';
import { CampaignScreen } from '../../menu/campaignScreen';
import { helpPanel } from '../../menu/helpPanel';
import { HomeScreen } from '../../menu/homeScreen';
import { OptionsPanel } from '../../menu/optionsPanel';
import { isTypingRoomCode, OnlineScreen } from '../../menu/online/onlineScreen';
import { isTypingCode, SetupScreen } from '../../menu/setupScreen';
import type { OnlineMatch } from '../../net/onlineMatch';
import { parseRoomLink } from '../../net/onlineRooms';
import { checkNotes, notesCommand, notesOpen } from '../../patchNotes';
import { matchConfigFor, randomSeed } from '../../setup';
import { readSave } from '../../storage';
import { terrainPalette, type TerrainPalette } from '../../ui/terrainColors';
import { startGame } from './gameStart';
import { menuSound } from '../systems/sound/soundCues';

type Mode = 'home' | 'setup' | 'campaign' | 'online';

const blurFocusedElement = (): void => (document.activeElement as HTMLElement | null)?.blur?.();

export class MenuFlow {
  private mode: Mode = 'home';
  /** Ya se esta saliendo del menu (a una partida): no hacer caso de mas ordenes. */
  private readonly exit = { leaving: false };
  private readonly save: GameState | null;
  private readonly palette: TerrainPalette;
  private readonly options: OptionsPanel;
  private readonly home: HomeScreen;
  private readonly setup: SetupScreen;
  private readonly campaign: CampaignScreen;
  private readonly online: OnlineScreen;

  constructor(private readonly sounds: SoundPort) {
    const raw = readSave();
    this.save = raw ? loadGame(raw) : null;
    this.palette = terrainPalette();
    this.options = new OptionsPanel(
      'menu',
      (key) => key === 'lang' && this.publish(),
      () => this.publish(),
    );
    const exit = this.exit;
    this.setup = new SetupScreen({
      palette: this.palette,
      toHome: () => this.toHome(),
      startNew: (seed) => this.startNew(seed),
    });
    this.campaign = new CampaignScreen({
      palette: this.palette,
      get leaving() {
        return exit.leaving;
      },
      toHome: () => this.toHome(),
      startMission: (mission) => this.startMission(mission),
    });
    this.online = new OnlineScreen({
      palette: this.palette,
      toHome: () => this.toHome(),
      startOnline: (match) => this.startOnline(match),
    });
    const setup = this.setup;
    this.home = new HomeScreen({
      save: this.save,
      palette: this.palette,
      get options() {
        return setup.options;
      },
      get leaving() {
        return exit.leaving;
      },
      missionThumb: (index) => this.campaign.missionThumb(index),
      continueGame: () => this.leave({ start: 'load' }),
      startNew: (seed) => this.startNew(seed),
      openSetup: () => this.openSetup(),
      openCampaign: () => this.openCampaign(),
      openOnline: () => this.openOnline(),
      onlineRooms: this.online.rooms,
      openOptions: () => this.options.open(),
    });
  }

  /** Enseña el menu y empieza a atender teclas y botones. */
  open(): void {
    showMenuBackground();
    this.setup.loadOptions();
    this.home.focus = this.save ? 'continue' : 'quick';
    Object.assign(ui.actions, this.home.actions(), this.setup.actions(), this.campaign.actions(), this.online.actions());
    // La ayuda del menu cuenta las reglas de una partida nueva de las de siempre.
    ui.set({
      screen: 'menu',
      options: null,
      toast: null,
      banner: null,
      helpRules: helpRulesForSettingsOnly(settingsWith(defaultContent())),
    });
    this.home.open();
    this.openRoomFromHash();
    window.addEventListener('keydown', (event) => this.onKey(event));
    playMusic('menu');
    // Notas de parche nuevas en GitHub (marca en "Novedades"); sin conexion no pasa nada.
    void checkNotes();
  }

  /** El menu que tiene el foco (decide que teclas valen). */
  private context(): MenuContext {
    if (helpPanel.isOpen) return helpPanel.context();
    if (notesOpen()) return 'notes';
    if (this.options.isOpen) return this.options.context();
    if (this.mode === 'setup') return isTypingCode() ? 'typing' : 'setup';
    if (this.mode === 'campaign') return 'campaign';
    if (this.mode === 'online') return isTypingRoomCode() ? 'typing' : 'online';
    return 'home';
  }

  /** Cumplir una orden de menu, venga del mando que venga. */
  private command(command: MenuCommand): void {
    if (this.exit.leaving) return;
    const sound = menuSound(command);
    if (sound) this.sounds.play(sound);
    if (helpPanel.isOpen) return helpPanel.command(command);
    if (notesOpen()) return notesCommand(command);
    if (this.options.isOpen) return this.options.command(command);
    if (this.mode === 'setup') return isTypingCode() ? this.setup.typingCommand(command) : this.setup.command(command);
    if (this.mode === 'campaign') return this.campaign.command(command);
    if (this.mode === 'online') return isTypingRoomCode() ? this.online.typingCommand(command) : this.online.command(command);
    this.home.command(command);
  }

  private onKey(event: KeyboardEvent): void {
    if (this.exit.leaving) return;
    const command = menuKeyCommand(event, this.context());
    if (!command) return;
    // La tecla que el jugador elige para una orden es para el juego, no para el navegador (Tab, F5...).
    if (command.kind === 'key' || !this.isTyping()) event.preventDefault();
    this.command(command);
  }

  /** Se escribe en un cuadro de texto (el codigo del mapa, el codigo o el enlace de una sala): sus teclas son suyas. */
  private isTyping(): boolean {
    return isTypingCode() || isTypingRoomCode();
  }

  private publish(): void {
    if (this.mode === 'home') this.home.publish();
    else if (this.mode === 'setup') this.setup.publish();
    else if (this.mode === 'online') this.online.publish();
    else this.campaign.publish();
  }

  private toHome(): void {
    this.mode = 'home';
    blurFocusedElement();
    ui.set({ screen: 'menu' });
    this.home.open();
  }

  private openSetup(): void {
    this.home.close();
    this.mode = 'setup';
    this.setup.open();
  }

  private openCampaign(): void {
    this.home.close();
    this.mode = 'campaign';
    this.campaign.open();
  }

  private openOnline(): void {
    this.home.close();
    this.mode = 'online';
    this.online.open();
  }

  /**
   * Un enlace de sala en la direccion (`#/sala/CODIGO`, el que se reparte, o el de un asiento,
   * `#/sala/CODIGO/FICHA`): directo a esa sala (y se quita de la direccion: recargar no pide otro asiento).
   */
  private openRoomFromHash(): void {
    const link = parseRoomLink(location.hash);
    if (!link) return;
    history.replaceState(null, '', location.pathname + location.search);
    this.home.close();
    this.mode = 'online';
    this.online.openRoom(link.code, link.token);
  }

  /** La sala ya juega: la partida empieza en su carga de la pagina, que vuelve a entrar con el mismo codigo y ficha. */
  private startOnline(match: OnlineMatch): void {
    match.close();
    this.leave({ start: 'online', code: match.code, token: match.token });
  }

  private startNew(seed: number): void {
    this.leave({ start: 'new', match: matchConfigFor(this.setup.options, seed) });
  }

  private startMission(mission: Mission): void {
    this.leave({ start: 'new', match: { mode: 'mission', mission: mission.id, seed: randomSeed() } });
  }

  private leave(start: Parameters<typeof startGame>[0]): void {
    if (this.exit.leaving) return;
    this.exit.leaving = true;
    blurFocusedElement();
    ui.set({ screen: 'loading' });
    startGame(start);
  }
}

/** Detras del menu, la imagen de siempre cubriendo la pantalla. */
function showMenuBackground(): void {
  const stage = document.getElementById('game');
  const image = imgUrl('menubackground');
  if (!stage || !image) return;
  Object.assign(stage.style, {
    backgroundImage: `url(${image})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    imageRendering: 'pixelated',
  });
}
