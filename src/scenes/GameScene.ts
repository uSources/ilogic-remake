/**
 * La partida: raiz de composicion. Tiene el ciclo de Phaser (init, create, update, SHUTDOWN), el estado
 * de la partida y la entrada de los mandos, y lo reparte a los modulos de src/scenes/game: que hace
 * cada fase del turno (phases/), mover (unitMoves), acciones y ordenes (orders), seleccion, arrastrar,
 * animar, turno enemigo, final... Cada modulo ve solo lo que pide su `...Host` (al final del fichero).
 */
import Phaser from 'phaser';
import { effectiveStandingOrder } from '../core/squads';
import { unitTypeOf, isHq } from '../core/gameContent';
import { samePos, posOf } from '../core/geom';
import { createLayer, isOnBoard } from '../core/mapGrid';
import { Grid } from '../core/util/grid';
import { commandUsed, matchResult, threatMap, unitAt, unitById, visibility, type BuyOption, canActNow } from '../core/rules';
import { serialize } from '../core/save';
import { recordEvent, sampleArmy } from '../core/stats';
import { dispatch } from '../core/actions';
import type { Building, GameAction, GameEvent, GameState, Pos, TeamId, Unit } from '../core/model';
import { enemiesOf, teamState } from '../core/teams';
import { generalOf } from '../core/generals';
import {
  resetActions,
  showBanner,
  showToast,
  ui,
  type ForecastVM,
  type IdleVM,
  type SelectionVM,
  type MenuItemVM,
  type MenuVM,
  type TileVM,
  type UIState,
  type MoveTipVM,
  type Anchor,
} from '../hud/store';
import { TILE } from '../layout';
import { playMusic } from '../music';
import { OptionsPanel } from '../menu/optionsPanel';
import { settings, t, nameOf } from '../settings';
import { deleteSave, writeSave } from '../storage';
import { MapView, type HighlightKind, type ViewOptions } from '../ui/mapView';
import { WeatherFx } from '../ui/weatherFx';
import { unitKey } from '../ui/sprites';
import { terrainPalette } from '../ui/terrainColors';
import { sideOf } from '../ui/sides';
import { PointerGestures } from '../controls/pointer';
import { CLOSES_HELP, type InputCommand } from '../controls/inputCommands';
import type { ControlContext, MenuCommand } from '../controls/menu';
import { squadsVM, minimapVM, tileVM, weatherVM, dayInfoVM, economyVM, generalVM } from '../ui/hudModels';
import type { LabAction, LabOptions } from '../lab';
import { GAME_MENU, KEEPS_UNDO, MENU_PHASES, type ActionHost, type ActionKey, type GameStartData, type Phase } from './game/types';
import { computeHighlights } from './game/highlights';
import { menuModel, stepMenuRow } from './game/menuModel';
import { forecastFor, hintText, labPanel, moveTipFor, selectionPanel, teamIncome } from './game/hudParts';
import { captureBars, controlPointMarks, escortMarks, intentLines, orderMarks } from './game/mapOverlays';
import { startMatch } from './game/matchSetup';
import { TutorialTracker } from './game/tutorial';
import { StandingOrderPreview } from './game/standingOrderPreview';
import { EventPlayer, type PlaybackHost } from './game/playback';
import { TurnFlow, type TurnHost } from './game/turns';
import { EndOfMatch, setEndFilter, type EndHost } from './game/endOfMatch';
import { GeneralPowers, type PowerHost } from './game/powers';
import { restartLab, startLab, type LabHost } from './game/labMode';
import { live, rw } from './game/host';
import { bindInput, pointerIn } from './game/input';
import { GroupSelection, type SelectionHost } from './game/groupSelection';
import { Carry, type CarryHost } from './game/carry';
import { pointerTarget, type PointerHost } from './game/pointerInput';
import { Orders, type OrderHost } from './game/orders';
import { UnitMoves, type MoveHost } from './game/unitMoves';
import { acceptMapTile, captureNow, GameMenuChoices, PHASES, type GameMenuHost, type PhaseHost } from './game/phases';

export type { GameStartData } from './game/types';

/** Sin casillas marcadas (sin unidad elegida). */
const NO_TILES: ReadonlyMap<string, number> = new Map();
/** Casillas de margen al llevar la camara a una unidad. */
const FOLLOW_MARGIN = 3;
/** Antes de empezar la partida no se ve nada (la vision de verdad la pone `refresh`). */
const NOTHING_SEEN: Grid<boolean> = Grid.filled({ width: 0, height: 0 }, false);
/** Fases con el panel de lo elegido (varias unidades) a la vista. */
const SELECTION_PANEL_PHASES: Phase[] = ['map', 'groupMenu', 'orderMenu', 'target'];
/** Bocadillos que van junto a una casilla (y se recolocan al mover la camara). */
type BubbleKind = 'menu' | 'forecast' | 'moveTip';

export class GameScene extends Phaser.Scene {
  // --- La partida -----------------------------------------------------------
  private s!: GameState;
  /** El equipo que juega la persona en esta pantalla: el que mira (niebla, colores, mandos). */
  private viewer!: TeamId;
  private view!: MapView;
  private phase: Phase = 'map';
  /** Partida en curso: cambia en cada init() y al cerrar la escena; las esperas asincronas la comprueban. */
  private match = 0;
  /** Laboratorio de animaciones (null en una partida normal). */
  private lab: LabOptions | null = null;
  private fromSave = false;
  private savedThisGame = false;
  private corruptSave = false;
  private ended = false;
  /** Ignorar Enter/clic hasta este instante (tras el turno enemigo). */
  private inputLockUntil = 0;
  private fastForward = false;
  /** Ultima casilla con un combate o una captura (para enfocar el final). */
  private lastAt: Pos | null = null;

  // --- Lo que se ve -----------------------------------------------------------
  private vis: Grid<boolean> = NOTHING_SEEN;
  /** Unidades que no se dibujan (la que se esta arrastrando o animando). */
  private hidden = new Set<number>();
  /** Lluvia, nieve... sobre el mapa. */
  private weatherFx: WeatherFx | null = null;
  /** Zona de amenaza enemiga visible (tecla T). */
  private threat = false;
  /** [CAMBIO] Ver lo que hara cada unidad con orden al terminar el turno (todas, tecla V). */
  private intents = false;
  /** Unidad cuyo alcance se esta mostrando (Enter o clic derecho sobre ella). */
  private inspectUid: number | null = null;
  /** Prevision de las ordenes (previewStandingOrders), recalculada solo si cambia la partida. */
  private standingOrderPreview = new StandingOrderPreview();
  private lastScroll = { x: NaN, y: NaN, zoom: NaN };
  /** Casilla junto a la que va cada bocadillo (para recolocarlos al mover la camara sin rehacerlos). */
  private anchorAt: Partial<Record<BubbleKind, Pos>> = {};

  // --- Menus de bocadillo -----------------------------------------------------
  private menuSel = 0;
  private menuItems: MenuItemVM[] = [];
  /** Opciones del menu de la unidad, ya ordenadas. */
  private unitOptions: ActionKey[] = [];
  /** «Eliminar» pulsado una vez en el menu de la unidad: la segunda lo confirma. */
  private deleteArmed = false;
  /** Fabrica de la compra y lo que se puede comprar en ella. */
  private buyAt: Building | null = null;
  private buyOptions: BuyOption[] = [];
  /** Pantalla de opciones (la misma que en el menu principal), encima del menu de pausa. */
  private optionsPanel!: OptionsPanel;

  // --- Modulos (src/scenes/game) ------------------------------------------------
  /** Lo que hace cada fase del turno del jugador (game/phases). */
  private phaseHost = this.makePhaseHost();
  /** La unidad elegida y como moverla (game/unitMoves.ts, game/moveSession.ts). */
  private moves = new UnitMoves(this.moveHost());
  /** [CAMBIO] Lo elegido: grupo, «Elegir varias», escuadras y teclas de grupo (game/groupSelection.ts). */
  private selection = new GroupSelection(this.selectionHost());
  /** [CAMBIO] Acciones y ordenes sobre lo elegido, puntero del raton (game/orders.ts). */
  private orders = new Orders(this.orderHost());
  /** Unidad cogida para arrastrar y soltar (game/carry.ts). */
  private carry = new Carry(this.carryHost());
  /** Lo que hace cada opcion del menu de pausa (game/phases/gameMenu.ts). */
  private gameMenu = new GameMenuChoices(this.gameMenuHost());
  /** Poderes del general del jugador (game/powers.ts). */
  private powers = new GeneralPowers(this.powerHost());
  /** Animar los eventos de las reglas (game/playback.ts). */
  private player = new EventPlayer(this.playbackHost());
  /** Fin de turno, turno de la IA y su repeticion (game/turns.ts). */
  private turns = new TurnFlow(this.turnHost());
  /** Final de la partida (game/endOfMatch.ts). */
  private endScreen = new EndOfMatch(this.endHost());
  /** Panel de la mision y pasos del tutorial. */
  private tutorial = new TutorialTracker();
  /** Raton y dedos (src/controls/pointer.ts). */
  private gestures = new PointerGestures(pointerTarget(this.pointerHost()));

  constructor() {
    super('Game');
  }

  /** Estado para src/debug.ts (tests y agentes): copia, no se puede cambiar la partida con ella. */
  debugSnapshot(): { state: string; phase: string; busy: boolean; ended: boolean; day: number; cursor: Pos } {
    return {
      state: serialize(this.s),
      phase: this.phase,
      busy: this.phase === 'busy' || this.othersPlaying,
      ended: this.ended,
      day: this.s.day,
      cursor: { ...this.view.cursor },
    };
  }

  // =========================================================================
  // Ciclo de Phaser
  // =========================================================================

  /**
   * Phaser reutiliza el objeto escena al volver a entrar: los valores iniciales de los campos solo se
   * ponen una vez. Todo lo que es de una partida se reinicia aqui (lo llama init()).
   */
  private resetMatch(): void {
    this.match++;
    this.phase = 'map';
    this.vis = NOTHING_SEEN;
    this.hidden = new Set();
    this.moves.reset();
    this.buyAt = null;
    this.menuSel = 0;
    this.menuItems = [];
    this.unitOptions = [];
    this.buyOptions = [];
    this.carry.reset();
    this.selection.reset();
    this.fromSave = false;
    this.savedThisGame = false;
    this.gameMenu.reset();
    this.corruptSave = false;
    this.inputLockUntil = 0;
    this.deleteArmed = false;
    this.fastForward = false;
    this.ended = false;
    this.turns.reset();
    this.inspectUid = null;
    this.standingOrderPreview.reset();
    this.lastScroll = { x: NaN, y: NaN, zoom: NaN };
    this.gestures.reset();
    this.tutorial.reset();
    this.lastAt = null;
    this.anchorAt = {};
    this.endScreen.reset();
  }

  init(data: GameStartData): void {
    this.resetMatch();
    const start = startMatch(data);
    this.s = start.state;
    this.viewer = start.viewer;
    this.lab = start.lab;
    this.fromSave = start.fromSave;
    this.corruptSave = start.corruptSave;
  }

  create(): void {
    setEndFilter(null);
    sampleArmy(this.s);
    this.lastAt = null;
    this.view = new MapView(this);
    this.view.buildTerrain(this.s);
    this.weatherFx = new WeatherFx(this);
    this.centerOnHq();
    bindInput(this, this, this.gestures);
    this.bindHud();
    this.bindSceneEvents();
    playMusic(this, 'game');
    this.threat = settings.alwaysThreat;
    this.optionsPanel = new OptionsPanel(
      this,
      'game',
      (key) => this.optionChanged(key),
      () => this.refreshHud(),
    );
    ui.set({ screen: 'game', toast: null, banner: null, combat: null, threat: this.threat, intents: this.intents, options: null });
    this.refresh();
    if (this.lab) startLab(this.labHost(), this.lab);
    else showBanner(`${t('day')} ${this.s.day}`, t('yourTurn'), 'blue');
    if (this.corruptSave) showToast(t('badSave'));
  }

  /** Cursor y camara sobre la Base del jugador. */
  private centerOnHq(): void {
    const hq = this.s.buildings.find((building) => building.owner === this.viewer && isHq(this.s, building)) ?? { x: 0, y: 0 };
    this.view.cursor = posOf(hq);
    this.view.centerOn(hq, true);
  }

  /** Lluvia por fotograma, cambio de tamaño y limpieza al cerrar la escena. */
  private bindSceneEvents(): void {
    const onUpdate = (_time: number, delta: number) => this.weatherFx?.update(delta);
    const onResize = (size: Phaser.Structs.Size) => {
      this.view.resize(size.width, size.height);
      this.refreshHud();
    };
    this.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
    this.scale.on(Phaser.Scale.Events.RESIZE, onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      // Lo que quede pendiente de esta partida (esperas, turno enemigo) ya no debe seguir.
      this.match++;
      this.scale.off(Phaser.Scale.Events.RESIZE, onResize);
      this.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
      this.weatherFx?.destroy();
      this.weatherFx = null;
      this.view.destroy();
      setEndFilter(null);
      resetActions();
      ui.set({ menu: null, forecast: null, combat: null, tile: null, mission: null, weather: null });
    });
  }

  /** Una opcion cambiada en la pantalla de opciones durante la partida. */
  private optionChanged(key: string): void {
    if (key === 'terrainArt') {
      this.view.buildTerrain(this.s);
      this.refresh();
    }
    if (key !== 'alwaysThreat') return this.refreshHud();
    this.threat = settings.alwaysThreat;
    ui.set({ threat: this.threat });
    this.refresh();
  }

  override update(time: number, delta: number): void {
    this.view.cursorAttack = this.phase === 'attack' || this.phase === 'target';
    this.view.tick(time);
    // Desplazar el mapa con el puntero en el borde (el adaptador decide cuanto; ver PointerGestures.tick).
    this.gestures.tick(pointerIn(this.input.activePointer, false), this.scale.width, this.scale.height, delta);
    // Si la camara se ha movido (arrastre, borde, paneo animado), recolocar los bocadillos.
    const camera = this.cameras.main;
    const last = this.lastScroll;
    if (camera.scrollX !== last.x || camera.scrollY !== last.y || camera.zoom !== last.zoom) this.refreshCamera();
  }

  // =========================================================================
  // Entrada: interfaz HTML y mandos
  // =========================================================================

  /** Se acepta lo que pulse el jugador: ni animando, ni al terminar, ni justo al volver su turno. */
  private acceptsInput(): boolean {
    return !this.ended && this.phase !== 'busy' && this.time.now >= this.inputLockUntil;
  }

  private hasMenuOpen(): boolean {
    return MENU_PHASES.includes(this.phase);
  }

  /** Acciones que puede lanzar la interfaz HTML. */
  private bindHud(): void {
    const ready = () => this.acceptsInput();
    Object.assign(ui.actions, {
      menuHover: (row: number) => {
        // En la compra se pueden señalar las que no se pueden pagar (se ve por que); en el resto no.
        if (this.menuItems[row]?.disabled && this.phase !== 'buy') return;
        if (ready() && this.hasMenuOpen()) this.selectMenu(row);
      },
      menuPick: (row: number) => {
        if (!ready() || !this.hasMenuOpen()) return;
        this.selectMenu(row);
        this.accept();
      },
      menuClose: () => {
        if (ready() && this.hasMenuOpen()) this.back();
      },
      endTurn: () => {
        if (ready()) this.turns.requestEndTurn();
      },
      labPlay: (action: LabAction) => {
        if (this.lab && this.phase !== 'busy') restartLab(this, { ...this.lab, play: action });
      },
      labSet: (patch: Partial<LabOptions>) => {
        if (this.lab && this.phase !== 'busy') restartLab(this, { ...this.lab, ...patch, play: null });
      },
      labExit: () => {
        this.scene.start('Menu');
      },
      multiSelect: () => {
        if (ready() && this.phase === 'map') this.toggleMultiSelect();
      },
      selectSquad: (id: number) => {
        if (ready()) this.selection.pickSquad(id);
      },
      renameSquad: (id: number, name: string) => {
        this.act({ kind: 'renameSquad', squad: id, name });
        ui.set({ rename: null });
        this.refresh();
      },
      usePower: (id: string) => {
        if (ready() && (this.phase === 'map' || this.phase === 'target')) void this.powers.start(id);
      },
      cancelPower: () => {
        if (this.phase === 'target') this.toMap();
      },
      openGameMenu: () => {
        if (ready()) this.openGameMenu();
      },
      minimapJump: (at: Pos) => {
        if (this.ended) return;
        this.cameras.main.centerOn(at.x * TILE, at.y * TILE);
        this.refreshHud();
      },
      toggleMinimap: () => ui.set({ minimapOn: !ui.get().minimapOn }),
      toggleThreat: () => {
        if (!this.ended) this.toggleThreat();
      },
      toggleIntents: () => {
        if (!this.ended) this.toggleIntents();
      },
      pickInSelection: (uid: number, shift: boolean, ctrl: boolean) => {
        if (ready()) this.selection.pickInSelection(uid, shift, ctrl);
      },
      focusUnit: (uid: number) => {
        if (ready()) this.focusUnit(uid);
      },
    });
  }

  /** Boton «Elegir varias»: con unidades elegidas abre sus ordenes; sin ninguna, entra o sale del modo. */
  private toggleMultiSelect(): void {
    const picks = this.selection;
    if (picks.group.size) return this.openGroupMenu();
    picks.multi = !picks.multi;
    if (!picks.multi) picks.group.clear();
    else showToast(t('multiHint'));
    this.refresh();
  }

  /** Retrato de la bandeja: elegir esa unidad (deshaciendo lo que hubiera a medio decidir). */
  private focusUnit(uid: number): void {
    const unit = unitById(this.s, uid);
    if (!unit) return;
    this.abandonSelection();
    this.view.cursor = posOf(unit);
    this.view.ensureVisible(unit, FOLLOW_MARGIN);
    this.moves.select(unit);
  }

  /** Donde va lo que pulse un mando: al mapa (command) o a un menu propio (menu). */
  controlContext(): ControlContext {
    if (this.ended) return 'end';
    if (this.optionsPanel.isOpen) return 'options';
    return 'map';
  }

  /** Cumplir una orden de menu (pantalla final u opciones), venga del mando que venga. */
  menu(command: MenuCommand): void {
    if (this.ended) return this.endScreen.command(command);
    if (this.optionsPanel.isOpen) this.optionsPanel.command(command);
  }

  /**
   * Cumplir una orden del jugador, venga del teclado o de otro mando (ver src/controls). Es lo unico
   * que un mando necesita de la escena.
   */
  command(command: InputCommand): void {
    // Escribiendo el nombre de una escuadra: el teclado es del cuadro de texto.
    if (ui.get().rename) return;
    if (ui.get().help) {
      if (CLOSES_HELP.includes(command.kind)) ui.set({ help: false });
      return;
    }
    if (command.kind === 'help') return ui.set({ help: true });
    if (command.kind === 'options') return this.openOptions();
    if (this.phase === 'busy') {
      // Durante el turno enemigo, aceptar acelera las animaciones.
      if (command.kind === 'accept') this.fastForward = true;
      return;
    }
    this.mapCommand(command);
  }

  /** Una orden en el mapa o en un menu de bocadillo (ni animando ni con la ayuda abierta). */
  private mapCommand(command: InputCommand): void {
    switch (command.kind) {
      case 'cursor':
        return this.direction(command.dx, command.dy);
      case 'accept':
        if (this.time.now < this.inputLockUntil) return;
        if (this.phase === 'move') return void this.moves.commit(this.view.cursor, { wait: command.wait });
        return this.accept();
      case 'stepBack':
        return this.stepBack();
      case 'cancel':
        return this.cancel();
      case 'undo':
        if (this.phase === 'map') this.moves.undoLast();
        return;
      case 'endTurn':
        if (this.phase === 'map' || this.phase === 'gameMenu') this.turns.requestEndTurn();
        return;
      case 'threat':
        return this.toggleThreat();
      case 'intents':
        return this.toggleIntents();
      case 'minimap':
        return ui.actions.toggleMinimap();
      case 'nextUnit':
        return this.nextUnit();
      case 'order':
        return this.orders.orderKey(command.order);
      case 'group':
        // [CAMBIO] 1-9 elige el grupo (dos veces: la camara va alli); Ctrl lo hace; Mayusculas añade.
        return this.selection.groupKey(command.n, command.mode);
      case 'orderHere':
        return this.orderHere();
      case 'zoom':
        this.zoomKey(command.dir);
        return this.refreshHud();
      default:
        return;
    }
  }

  /** O: las opciones, encima del menu de pausa (que se abre si no lo estaba). */
  private openOptions(): void {
    if (this.phase !== 'map' && this.phase !== 'gameMenu') return;
    if (this.phase === 'map') this.openGameMenu();
    this.menuSel = GAME_MENU.indexOf('options');
    this.refreshHud();
    this.optionsPanel.open();
  }

  /** Retroceso: al trazar un camino, quitar la ultima casilla; si no, atras. */
  private stepBack(): void {
    const trailEnd = this.phase === 'move' ? this.moves.session?.stepBack() : null;
    if (!trailEnd) return this.back();
    this.view.cursor = { ...trailEnd };
    this.view.ensureVisible(this.view.cursor, FOLLOW_MARGIN);
    this.refresh();
  }

  /** Esc: soltar lo que se arrastra, cerrar el menu de ordenes o soltar el grupo; si no, atras. */
  private cancel(): void {
    const picks = this.selection;
    if (this.carry.active) return this.carry.cancel();
    if (this.phase === 'orderMenu') return this.back();
    if (!picks.group.size && !picks.multi) return this.back();
    picks.group.clear();
    picks.multi = false;
    // Con el menu de grupo abierto, cerrarlo tambien (no dejarlo abierto sin unidades).
    if (this.phase === 'groupMenu') return this.toMap();
    this.refresh();
  }

  /** [CAMBIO] Tab: con varias elegidas, va pasando por ellas (panel de lo elegido); si no, la siguiente sin mover. */
  private nextUnit(): void {
    if (this.phase !== 'map') return;
    if (this.selection.group.size > 1) return this.selection.nextPicked();
    this.nextIdle();
  }

  /** [CAMBIO] F: menu de ordenes en la casilla del cursor, con la unidad o el grupo elegido. */
  private orderHere(): void {
    const opened = this.orders.openMenu(this.view.cursor);
    if (!opened && (this.phase === 'map' || this.phase === 'move')) showToast(t('orderHereNone'));
  }

  /** Zoom con teclado: alrededor del cursor, y que siga a la vista. */
  private zoomKey(direction: 1 | -1): void {
    const cursorOnScreen = this.view.screenOf(this.view.cursor);
    this.view.zoomStep(direction, cursorOnScreen.x, cursorOnScreen.y);
    this.view.ensureVisible(this.view.cursor, 2, true);
  }

  /** Flechas: en un menu, arriba y abajo cambian de opcion; en el mapa, mueven el cursor. */
  private direction(dx: number, dy: number): void {
    if (!this.hasMenuOpen()) return this.moveCursorTo({ x: this.view.cursor.x + dx, y: this.view.cursor.y + dy }, true);
    if (!dy) return;
    this.selectMenu(stepMenuRow(this.menuItems, this.menuSel, dy, this.phase === 'buy'));
  }

  private selectMenu(row: number): void {
    if (row === this.menuSel) return;
    this.menuSel = row;
    this.deleteArmed = false;
    this.refreshHud();
  }

  private moveCursorTo(pos: Pos, follow: boolean): void {
    if (!isOnBoard(this.s, pos) || samePos(pos, this.view.cursor)) return;
    this.view.cursor = { ...pos };
    if (follow) this.view.ensureVisible(pos, FOLLOW_MARGIN);
    this.cursorMoved();
  }

  /** Tab: llevar el cursor a la siguiente unidad sin mover. */
  private nextIdle(): void {
    const idle = this.idleUnits();
    if (!idle.length) return;
    const here = unitAt(this.s, this.view.cursor);
    const hereIndex = here ? idle.findIndex((unit) => unit.uid === here.uid) : -1;
    const next = idle[(hereIndex + 1) % idle.length]!;
    this.view.cursor = posOf(next);
    this.view.ensureVisible(next, FOLLOW_MARGIN);
    this.cursorMoved();
  }

  private toggleThreat(): void {
    this.threat = !this.threat;
    ui.set({ threat: this.threat });
    this.refresh();
  }

  private toggleIntents(): void {
    this.intents = !this.intents;
    ui.set({ intents: this.intents });
    this.refresh();
  }

  // =========================================================================
  // Fases del turno del jugador (game/phases)
  // =========================================================================

  private accept(): void {
    PHASES[this.phase].accept(this.phaseHost);
  }

  private back(): void {
    this.deleteArmed = false;
    PHASES[this.phase].back(this.phaseHost);
  }

  /** Entrar en una fase que prepara algo al entrar (abrir su menu); las demas, solo se ponen. */
  private enterPhase(phase: Phase): void {
    const handler = PHASES[phase];
    if (handler.enter) return handler.enter(this.phaseHost);
    this.phase = phase;
    this.refresh();
  }

  private openGameMenu(): void {
    this.enterPhase('gameMenu');
  }

  private openUnitMenu(): void {
    this.enterPhase('unitMenu');
  }

  /** [CAMBIO] Menu de grupo, al elegir varias con Mayusculas + recuadro (tambien lo abre tests/visual/keys.mjs). */
  private openGroupMenu(): void {
    this.enterPhase('groupMenu');
  }

  /** Vuelta al mapa: sin unidad elegida, orden a medio dar ni menu abierto. */
  private toMap(): void {
    this.phase = 'map';
    this.powers.targeting = null;
    this.orders.ordering = null;
    this.orders.menu = null;
    this.inspectUid = null;
    this.moves.deselect();
    this.buyAt = null;
    this.refresh();
  }

  /** Si hay una unidad movida a medio decidir, deshacer su movimiento antes de salir. */
  private abandonSelection(): void {
    const isDecidingAfterMove = ['unitMenu', 'attack', 'unloadPick', 'unloadTile'].includes(this.phase);
    if (isDecidingAfterMove && this.moves.canUndoSelected()) this.moves.undoMove();
    if (this.phase !== 'map') this.toMap();
  }

  /** Muestra el alcance de una unidad (enemiga, o propia ya usada). */
  private inspect(unit: Unit): void {
    this.inspectUid = unit.uid;
    this.refresh();
  }

  /** Tras una accion que gasta la unidad: fin de la partida o vuelta al mapa. */
  private afterAction(): void {
    if (this.checkEnd()) return;
    this.toMap();
    // Opcion: el cursor salta a la siguiente unidad sin mover.
    if (settings.autoNext && this.idleUnits().length) this.nextIdle();
  }

  /** La partida se ha decidido (su modo dice como: el laboratorio nunca): true, y empieza el final. */
  private checkEnd(): boolean {
    const result = matchResult(this.s);
    if (result.status === 'playing') return false;
    void this.endScreen.finish(result);
    return true;
  }

  /** Rendirse: el equipo que mira deja la partida (si con eso acaba, empieza el final). */
  private surrender(): void {
    this.toMap();
    this.act({ kind: 'surrender' });
    this.checkEnd();
  }

  /** Da la partida por terminada (al ganar, perder o rendirse): sin entrada y sin zona de amenaza. */
  private closeMatch(): void {
    this.ended = true;
    this.phase = 'busy';
    // [CAMBIO] borrar el guardado de esta partida al terminarla (antes solo si se habia cargado).
    if (this.fromSave || this.savedThisGame) deleteSave();
    this.threat = false;
  }

  private quitToMenu(): void {
    this.ended = true;
    this.scene.start('Menu');
  }

  private saveGame(): boolean {
    if (!writeSave(serialize(this.s))) return false;
    this.savedThisGame = true;
    return true;
  }

  // =========================================================================
  // Unidades del jugador
  // =========================================================================

  /** La unidad es del equipo que mira. */
  private isOwn(unit: Unit): boolean {
    return unit.team === this.viewer;
  }

  /** La orden que cumple la unidad (la suya o la de su escuadra). */
  private standingOrderOf(unit: Unit) {
    return effectiveStandingOrder(this.s, unit);
  }

  /** Las que aun pueden hacer algo. Las que tienen orden no cuentan: la cumpliran solas al terminar el turno. */
  private idleUnits(): Unit[] {
    return this.s.units.filter((unit) => this.isOwn(unit) && canActNow(unit) && !this.standingOrderOf(unit));
  }

  /** [CAMBIO] Linea de la orden: de la unidad bajo el cursor (y su escuadra) o de las que se estan ordenando. */
  private showsOrderLine(unit: Unit): boolean {
    if (this.orders.ordering?.uids.includes(unit.uid) || this.selection.group.has(unit.uid)) return true;
    const here = unitAt(this.s, this.view.cursor);
    const isSameSquad = here?.squad !== undefined && here.squad === unit.squad;
    return !!here && (here.uid === unit.uid || isSameSquad);
  }

  /** El grupo elegido. Publico para tests/visual/keys.mjs, que lo cambia desde fuera. */
  get group(): Set<number> {
    return this.selection.group;
  }

  set group(uids: Set<number>) {
    this.selection.group = uids;
  }

  private get othersPlaying(): boolean {
    return this.turns.othersPlaying;
  }

  private visibleToPlayer(pos: Pos): boolean {
    return this.vis.contains(pos) && this.vis.at(pos);
  }

  /** Anima eventos (movimiento, ataque...) y vuelve a dibujar al terminar. */
  private playEvents(events: GameEvent[], ghostKey?: string | null): Promise<void> {
    return this.player.play(events, ghostKey);
  }

  /**
   * La persona de la pantalla hace una accion de su equipo (ver ActionHost): sus sucesos, o null si
   * no vale. Sus sucesos se apuntan aqui, se animen o no.
   */
  private act(action: GameAction): GameEvent[] | null {
    const result = dispatch(this.s, this.viewer, action);
    if (!result.ok) return null;
    this.record(result.events);
    return result.events;
  }

  /** La hace y anima sus sucesos (ver ActionHost). */
  private async perform(action: GameAction, ghostKey?: string | null): Promise<boolean> {
    const events = this.act(action);
    if (events) await this.playEvents(events, ghostKey);
    return !!events;
  }

  /** Apunta los sucesos de una accion ya hecha (ver ActionHost.record). */
  private record(events: readonly GameEvent[]): void {
    for (const event of events) this.noteEvent(event);
  }

  /** Un suceso ya hecho: estadisticas, tutorial, Ctrl+Z y donde ha pasado lo ultimo. */
  private noteEvent(event: GameEvent): void {
    const isOwnTurn = !this.othersPlaying;
    const replaying = this.turns.replaying;
    // Lo que tiene consecuencias (combates, capturas, compras...) ya no se puede deshacer con Ctrl+Z.
    if (isOwnTurn && !KEEPS_UNDO.has(event.kind)) this.moves.clearUndo();
    if (!replaying) recordEvent(this.s, event);
    if (!replaying && isOwnTurn) this.tutorial.record(event);
    if (event.kind === 'attack') this.lastAt = { ...event.at };
    else if (event.kind === 'capture') this.lastAt = { ...event.at };
  }

  // =========================================================================
  // Dibujar el mapa
  // =========================================================================

  private refresh(): void {
    // [CAMBIO] Puntero del raton segun lo que haria el clic derecho donde esta el cursor.
    if (this.gestures.inside) this.orders.updatePointer(this.phase === 'busy' ? null : this.view.cursor);
    // Al acabar se descubre todo el mapa.
    this.vis = this.ended ? createLayer(this.s, true) : visibility(this.s, this.viewer);
    this.view.pruneScorch(this.s.day);
    this.view.render(this.s, this.viewOptions());
    this.view.placeCursor(this.phase !== 'busy');
    this.publishMinimap();
    this.refreshHud();
  }

  private viewOptions(): ViewOptions {
    const isMoving = this.phase === 'move';
    const session = this.moves.session;
    const threat = this.threat && !this.othersPlaying ? threatMap(this.s, this.viewer) : null;
    return {
      viewer: this.viewer,
      vis: this.vis,
      highlights: this.highlights(),
      hidden: this.hidden,
      path: this.previewPath(),
      pathAttack: isMoving && this.moves.intentAt(this.view.cursor).kind === 'attack',
      threat,
      attackZone: isMoving ? (session?.attackZone ?? null) : null,
      orders: orderMarks(this.s, this.viewer, (unit) => this.showsOrderLine(unit)),
      danger: isMoving ? (session?.danger ?? null) : null,
      intents: this.intentsToDraw(),
      captures: captureBars(this.s, this.viewer, this.vis),
      controlPoints: controlPointMarks(this.s, this.viewer, (pos) => this.visibleToPlayer(pos)),
      ...escortMarks(this.s, this.hidden),
    };
  }

  private highlights(): Map<string, HighlightKind> {
    const session = this.moves.session;
    const marks = computeHighlights({
      s: this.s,
      viewer: this.viewer,
      phase: this.phase,
      cursor: this.view.cursor,
      range: session?.range ?? null,
      merge: session?.merge ?? NO_TILES,
      load: session?.load ?? NO_TILES,
      attack: session?.attackTargets ?? NO_TILES,
      unload: session?.unloadTiles ?? new Set(),
      orderMenuUids: this.orders.menu?.uids ?? null,
      orderingUids: this.orders.ordering?.uids ?? null,
      targetArea: (pos) => this.powers.area(pos),
      group: this.selection.group,
      inspectUid: this.inspectUid,
      othersPlaying: this.othersPlaying,
      visible: (pos) => this.visibleToPlayer(pos),
    });
    if (marks.inspectGone) this.inspectUid = null;
    return marks.tiles;
  }

  /** Camino previsto de la unidad seleccionada: el trazado hasta el cursor, o hasta la casilla desde la que atacaria. */
  private previewPath(): Pos[] | undefined {
    const session = this.moves.session;
    if (this.phase !== 'move' || !session?.range) return undefined;
    const intent = this.moves.intentAt(this.view.cursor);
    const dest = intent.kind === 'move' ? intent.to : intent.kind === 'attack' ? intent.from : null;
    // Sin destino valido (fuera del alcance, agua...): se sigue viendo el camino trazado hasta donde llega.
    if (!dest) return session.trail.length > 1 ? session.trail : undefined;
    if (samePos(dest, session.unit)) return undefined;
    return this.moves.trailTo(dest);
  }

  /** Intenciones que se dibujan: de la unidad señalada y su escuadra, o de todas con la tecla V. */
  private intentsToDraw(): ViewOptions['intents'] {
    if (this.phase !== 'map' || this.othersPlaying || this.ended || this.lab) return [];
    const withStandingOrder = this.s.units.filter((unit) => this.isOwn(unit) && this.standingOrderOf(unit) && canActNow(unit));
    const shown = withStandingOrder.filter((unit) => this.intents || this.showsOrderLine(unit));
    if (!shown.length) return [];
    return intentLines(shown, this.standingOrderPreview.get(this.s, this.viewer), this.vis);
  }

  private publishMinimap(): void {
    ui.set({ minimap: minimapVM(terrainPalette(this.textures), this.s, { viewer: this.viewer, vis: this.vis, hidden: this.hidden }) });
  }

  /** Solo cambia el cursor: no hace falta redibujar unidades, salvo el camino previsto. */
  private cursorMoved(): void {
    if (this.phase === 'move') {
      this.moves.followCursor(this.view.cursor);
      return this.refresh();
    }
    // En 'target' el area sigue al cursor.
    if (this.phase === 'map' || this.phase === 'target') return this.refresh();
    this.view.placeCursor(true);
    this.refreshHud();
  }

  // =========================================================================
  // Interfaz HTML (hud/store)
  // =========================================================================

  private refreshHud(): void {
    const s = this.s;
    const cursor = this.view.cursor;
    const busy = this.phase === 'busy';
    const weather = weatherVM(s);
    this.weatherFx?.set(weather?.id ?? null);
    const viewer = this.viewer;
    const enemyWithGeneral = enemiesOf(s, viewer).find((enemy) => generalOf(s, enemy));
    ui.set({
      funds: teamState(s, viewer).funds,
      income: teamIncome(s, viewer),
      commandPoints: s.rules.commandPoints === null ? null : { used: commandUsed(s, viewer), max: s.rules.commandPoints },
      economy: economyVM(s, viewer),
      dayInfo: dayInfoVM(s, viewer),
      lab: labPanel(this.s, this.lab),
      general: generalVM(s, viewer, viewer, this.phase === 'target' ? this.powers.targeting : null),
      enemyGeneral: enemyWithGeneral === undefined ? null : generalVM(s, viewer, enemyWithGeneral, null),
      buildings: s.buildings.filter((building) => building.owner === viewer).length,
      day: s.day,
      dayLimit: s.rules.dayLimit,
      helpRules: s.rules,
      weather,
      turn: sideOf(s, viewer, this.turns.acting),
      busy,
      tile: busy ? null : this.tileInfo(cursor),
      forecast: this.phase === 'attack' || this.phase === 'move' ? this.forecast(cursor) : null,
      moveTip: this.phase === 'move' ? this.moveTip(cursor) : null,
      menu: this.hasMenuOpen() ? this.buildMenu() : null,
      idle: this.idleList(),
      squads: squadsVM(s),
      multi: this.selection.multi || this.selection.group.size ? this.selection.group.size : null,
      selection: this.selectionVM(),
      endTurn: { pending: this.turns.pendingUnits().length, armed: this.turns.endArmed() },
      anyStandingOrder: s.units.some((unit) => this.isOwn(unit) && !!this.standingOrderOf(unit)),
      hint: this.hint(busy),
      mission: this.tutorial.panel(s, this.phase),
    });
    this.publishCameraView();
  }

  /** Bandeja de unidades sin mover. */
  private idleList(): IdleVM[] {
    return this.idleUnits().map((unit) => ({
      uid: unit.uid,
      icon: unitKey(this.textures, this.s, unit, this.viewer),
      name: nameOf(unitTypeOf(this.s, unit)),
    }));
  }

  private hint(busy: boolean): string {
    return hintText({
      busy,
      othersPlaying: this.othersPlaying,
      phase: this.phase,
      ordering: !!this.orders.ordering,
      inspecting: this.inspectUid !== null,
    });
  }

  private forecast(cursor: Pos): ForecastVM | null {
    return forecastFor(this.textures, this.s, {
      viewer: this.viewer,
      phase: this.phase,
      selected: this.moves.selected,
      c: cursor,
      intentAt: (pos) => this.moves.intentAt(pos),
      attackSet: this.moves.session?.attackTargets ?? NO_TILES,
      anchor: (pos) => this.anchor('forecast', pos),
    });
  }

  /** Bocadillo junto al cursor al mover (ver moveTipFor). */
  private moveTip(cursor: Pos): MoveTipVM | null {
    return moveTipFor(this.s, {
      selected: this.moves.selected,
      range: this.moves.session?.range ?? null,
      c: cursor,
      intentAt: (pos) => this.moves.intentAt(pos),
      trailTo: (dest) => this.moves.trailTo(dest),
      danger: this.moves.session?.danger ?? null,
      anchor: (pos) => this.anchor('moveTip', pos),
    });
  }

  private tileInfo(pos: Pos): TileVM {
    const selected = this.phase !== 'map' ? this.moves.selected : null;
    return tileVM(this.textures, this.s, pos, { viewer: this.viewer, vis: this.vis, hidden: this.hidden, selected });
  }

  /** Menu de bocadillo de la fase actual. */
  private buildMenu(): MenuVM {
    const { kind, title, subtitle, info, items, at } = menuModel({
      s: this.s,
      viewer: this.viewer,
      phase: this.phase,
      cursor: this.view.cursor,
      selected: this.moves.selected,
      actions: this.unitOptions,
      building: this.buyAt,
      buy: this.buyOptions,
      groupUnits: () => this.selection.groupUnits(),
      groupCtx: () => this.orders.ctx(null),
      orderMenu: this.orders.menu,
      canReplay: this.turns.canReplay,
    });
    this.menuItems = items;
    return { kind, title, subtitle, info, items, selected: this.menuSel, anchor: this.anchor('menu', at) };
  }

  /** [CAMBIO] Panel de lo elegido: con dos o mas unidades, en el mapa (o eligiendo que hacer con ellas). */
  private selectionVM(): SelectionVM | null {
    const picks = this.selection;
    if (picks.group.size < 2 || !SELECTION_PANEL_PHASES.includes(this.phase) || this.othersPlaying) return null;
    const list = picks.pickedInOrder();
    if (list.length < 2) return null;
    return selectionPanel(this.textures, this.s, this.viewer, list, this.view.cursor);
  }

  private anchor(kind: BubbleKind, pos: Pos): Anchor {
    this.anchorAt[kind] = posOf(pos);
    return this.view.tileRectCss(pos);
  }

  /**
   * La camara se ha movido: solo se recolocan los bocadillos que se ven y el recuadro del minimapa.
   * (Rehacer todo el HUD en cada fotograma de un desplazamiento es caro y no cambia nada mas.)
   */
  private refreshCamera(): void {
    const shown = ui.get();
    const at = this.anchorAt;
    const patch: Partial<UIState> = {};
    if (shown.menu && at.menu) patch.menu = { ...shown.menu, anchor: this.view.tileRectCss(at.menu) };
    if (shown.forecast && at.forecast) patch.forecast = { ...shown.forecast, anchor: this.view.tileRectCss(at.forecast) };
    if (shown.moveTip && at.moveTip) patch.moveTip = { ...shown.moveTip, anchor: this.view.tileRectCss(at.moveTip) };
    ui.set(patch);
    this.publishCameraView();
  }

  private publishCameraView(): void {
    const camera = this.cameras.main;
    this.lastScroll = { x: camera.scrollX, y: camera.scrollY, zoom: camera.zoom };
    const world = camera.worldView;
    ui.set({ minimapView: { x: world.x / TILE, y: world.y / TILE, w: world.width / TILE, h: world.height / TILE } });
  }

  // =========================================================================
  // Lo que cada modulo de game/ ve de la escena
  // =========================================================================

  /** Hacer acciones y apuntar sucesos: lo mismo para todos los modulos que hacen acciones. */
  private actionHost(): ActionHost {
    return {
      act: (action) => this.act(action),
      perform: (action, ghostKey) => this.perform(action, ghostKey),
      record: (events) => this.record(events),
    };
  }

  private makePhaseHost(): PhaseHost {
    return live<PhaseHost>({
      state: { get: () => this.s },
      viewer: { get: () => this.viewer },
      view: { get: () => this.view },
      phase: rw(
        () => this.phase,
        (kind) => (this.phase = kind),
      ),
      menuSel: rw(
        () => this.menuSel,
        (value) => (this.menuSel = value),
      ),
      menuItems: { get: () => this.menuItems },
      inspectUid: rw(
        () => this.inspectUid,
        (value) => (this.inspectUid = value),
      ),
      unitOptions: rw(
        () => this.unitOptions,
        (value) => (this.unitOptions = value),
      ),
      deleteArmed: rw(
        () => this.deleteArmed,
        (flag) => (this.deleteArmed = flag),
      ),
      buyAt: rw(
        () => this.buyAt,
        (building) => (this.buyAt = building),
      ),
      buyOptions: rw(
        () => this.buyOptions,
        (value) => (this.buyOptions = value),
      ),
      moves: { get: () => this.moves },
      selection: { get: () => this.selection },
      orders: { get: () => this.orders },
      powers: { get: () => this.powers },
      gameMenu: { get: () => this.gameMenu },
      enter: (phase) => this.enterPhase(phase),
      toMap: () => this.toMap(),
      refresh: () => this.refresh(),
      afterAction: () => this.afterAction(),
      abandonSelection: () => this.abandonSelection(),
      inspect: (unit) => this.inspect(unit),
      visible: (pos) => this.visibleToPlayer(pos),
      play: (events) => this.playEvents(events),
      ...this.actionHost(),
    });
  }

  private moveHost(): MoveHost {
    return live<MoveHost>({
      scene: { get: () => this },
      view: { get: () => this.view },
      state: rw(
        () => this.s,
        (state) => (this.s = state),
      ),
      viewer: { get: () => this.viewer },
      phase: rw(
        () => this.phase,
        (kind) => (this.phase = kind),
      ),
      ended: { get: () => this.ended },
      selection: { get: () => this.selection },
      visible: (pos) => this.visibleToPlayer(pos),
      play: (events, ghostKey) => this.playEvents(events, ghostKey),
      toMap: () => this.toMap(),
      refresh: () => this.refresh(),
      afterAction: () => this.afterAction(),
      openUnitMenu: () => this.openUnitMenu(),
      captureNow: () => captureNow(this.phaseHost),
      ...this.actionHost(),
    });
  }

  private orderHost(): OrderHost {
    return live<OrderHost>({
      scene: { get: () => this },
      view: { get: () => this.view },
      state: { get: () => this.s },
      viewer: { get: () => this.viewer },
      phase: rw(
        () => this.phase,
        (kind) => (this.phase = kind),
      ),
      menuSel: rw(
        () => this.menuSel,
        (value) => (this.menuSel = value),
      ),
      match: { get: () => this.match },
      selected: { get: () => this.moves.selected },
      selection: { get: () => this.selection },
      menuPick: () => this.menuItems[this.menuSel]?.id,
      stopInspect: () => {
        this.inspectUid = null;
      },
      visible: (pos) => this.visibleToPlayer(pos),
      intentAt: (tile) => this.moves.intentAt(tile),
      toMap: () => this.toMap(),
      back: () => this.back(),
      refresh: () => this.refresh(),
      selectUnit: (unit) => this.moves.select(unit),
      moveCursorTo: (pos, follow) => this.moveCursorTo(pos, follow),
      commit: (tile, options) => this.moves.commit(tile, options),
      groupMove: (goal) => this.moves.groupMove(goal),
      giveTravel: (unit, goal) => this.moves.giveTravel(unit, goal),
      clearUndo: () => this.moves.clearUndo(),
      afterAction: () => this.afterAction(),
      checkEnd: () => this.checkEnd(),
      play: (events) => this.playEvents(events),
      ...this.actionHost(),
    });
  }

  private gameMenuHost(): GameMenuHost {
    return live<GameMenuHost>({
      now: { get: () => this.time.now },
      canReplay: { get: () => this.turns.canReplay },
      toMap: () => this.toMap(),
      openOptions: () => this.optionsPanel.open(),
      showHelp: () => ui.set({ help: true }),
      saveGame: () => this.saveGame(),
      endTurn: () => void this.turns.endOwnTurn(),
      replayOthers: () => void this.turns.replayOthers(),
      surrender: () => this.surrender(),
      quitToMenu: () => this.quitToMenu(),
    });
  }

  private selectionHost(): SelectionHost {
    return live<SelectionHost>({
      scene: { get: () => this },
      view: { get: () => this.view },
      state: { get: () => this.s },
      viewer: { get: () => this.viewer },
      phase: { get: () => this.phase },
      selected: { get: () => this.moves.selected },
      toMap: () => this.toMap(),
      selectUnit: (unit) => this.moves.select(unit),
      stopInspect: () => {
        this.inspectUid = null;
      },
      refresh: () => this.refresh(),
      cursorMoved: () => this.cursorMoved(),
      ...this.actionHost(),
    });
  }

  private carryHost(): CarryHost {
    return live<CarryHost>({
      scene: { get: () => this },
      view: { get: () => this.view },
      state: { get: () => this.s },
      viewer: { get: () => this.viewer },
      phase: { get: () => this.phase },
      selected: { get: () => this.moves.selected },
      hidden: { get: () => this.hidden },
      toMap: () => this.toMap(),
      selectUnit: (unit) => this.moves.select(unit),
      updateTrail: (tile) => this.moves.followCursor(tile),
      intentAt: (tile) => this.moves.intentAt(tile),
      refresh: () => this.refresh(),
      giveTravel: (unit, goal) => this.moves.giveTravel(unit, goal),
      commit: (tile, options) => this.moves.commit(tile, options),
    });
  }

  private pointerHost(): PointerHost {
    return live<PointerHost>({
      scene: { get: () => this },
      view: { get: () => this.view },
      state: { get: () => this.s },
      viewer: { get: () => this.viewer },
      phase: { get: () => this.phase },
      ended: { get: () => this.ended },
      selected: { get: () => this.moves.selected },
      inputLockUntil: { get: () => this.inputLockUntil },
      lastCommit: { get: () => this.moves.lastCommit },
      inspectUid: rw(
        () => this.inspectUid,
        (value) => (this.inspectUid = value),
      ),
      selection: { get: () => this.selection },
      carry: { get: () => this.carry },
      skipAnimations: () => {
        this.fastForward = true;
      },
      visible: (pos) => this.visibleToPlayer(pos),
      intentAt: (tile) => this.moves.intentAt(tile),
      actionCtx: (at) => this.orders.ctx(at),
      runAction: (id, at, options) => this.orders.run(id, at, options),
      openOrderMenu: (at) => this.orders.openMenu(at),
      inspect: (unit) => this.inspect(unit),
      accept: () => this.accept(),
      back: () => this.back(),
      toMap: () => this.toMap(),
      refresh: () => this.refresh(),
      refreshHud: () => this.refreshHud(),
      cursorMoved: () => this.cursorMoved(),
      moveCursorTo: (pos, follow) => this.moveCursorTo(pos, follow),
      setPointer: (kind) => this.orders.setPointer(kind),
      updatePointer: (tile) => this.orders.updatePointer(tile),
      commit: (tile, options) => this.moves.commit(tile, options),
      waitSelected: () => this.moves.waitSelected(),
      groupMove: (goal) => this.moves.groupMove(goal),
      selectUnit: (unit) => this.moves.select(unit),
      acceptMap: (tile) => acceptMapTile(this.phaseHost, tile),
    });
  }

  private powerHost(): PowerHost {
    return live<PowerHost>({
      state: { get: () => this.s },
      viewer: { get: () => this.viewer },
      phase: rw(
        () => this.phase,
        (kind) => (this.phase = kind),
      ),
      abandonSelection: () => this.abandonSelection(),
      toMap: () => this.toMap(),
      refresh: () => this.refresh(),
      play: (events) => this.playEvents(events),
      ...this.actionHost(),
    });
  }

  private playbackHost(): PlaybackHost {
    return live<PlaybackHost>({
      scene: { get: () => this },
      view: { get: () => this.view },
      state: { get: () => this.s },
      viewer: { get: () => this.viewer },
      acting: { get: () => this.turns.acting },
      phase: rw(
        () => this.phase,
        (kind) => (this.phase = kind),
      ),
      fastForward: rw(
        () => this.fastForward,
        (flag) => (this.fastForward = flag),
      ),
      othersPlaying: { get: () => this.othersPlaying },
      replaying: { get: () => this.turns.replaying },
      hidden: { get: () => this.hidden },
      visible: (pos) => this.visibleToPlayer(pos),
      refresh: () => this.refresh(),
      refreshHud: () => this.refreshHud(),
    });
  }

  private turnHost(): TurnHost {
    return live<TurnHost>({
      scene: { get: () => this },
      view: { get: () => this.view },
      state: rw(
        () => this.s,
        (state) => (this.s = state),
      ),
      viewer: { get: () => this.viewer },
      phase: rw(
        () => this.phase,
        (kind) => (this.phase = kind),
      ),
      match: { get: () => this.match },
      ended: { get: () => this.ended },
      lab: { get: () => !!this.lab },
      fastForward: rw(
        () => this.fastForward,
        (flag) => (this.fastForward = flag),
      ),
      inputLockUntil: rw(
        () => this.inputLockUntil,
        (value) => (this.inputLockUntil = value),
      ),
      play: (events) => this.playEvents(events),
      wait: (ms) => this.player.wait(ms),
      checkEnd: () => this.checkEnd(),
      clearUndo: () => this.moves.clearUndo(),
      abandonSelection: () => this.abandonSelection(),
      toMap: () => this.toMap(),
      refresh: () => this.refresh(),
      refreshHud: () => this.refreshHud(),
      visible: (pos) => this.visibleToPlayer(pos),
      idleUnits: () => this.idleUnits(),
      markSaved: () => {
        this.savedThisGame = true;
      },
      ...this.actionHost(),
    });
  }

  private endHost(): EndHost {
    return live<EndHost>({
      scene: { get: () => this },
      view: { get: () => this.view },
      state: { get: () => this.s },
      viewer: { get: () => this.viewer },
      match: { get: () => this.match },
      ended: { get: () => this.ended },
      lastAt: { get: () => this.lastAt },
      closeMatch: () => this.closeMatch(),
      refresh: () => this.refresh(),
      wait: (ms) => this.player.wait(ms),
    });
  }

  private labHost(): LabHost {
    return live<LabHost>({
      scene: { get: () => this },
      view: { get: () => this.view },
      state: { get: () => this.s },
      viewer: { get: () => this.viewer },
      refresh: () => this.refresh(),
      play: (events) => this.playEvents(events),
      ...this.actionHost(),
    });
  }
}
