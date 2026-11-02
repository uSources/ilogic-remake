import Phaser from 'phaser';
import { commandNow, commandOrder } from '../core/ai';
import {
  cancelCommand,
  commandBlock,
  disbandSquad,
  effectiveCommand,
  formSquad,
  giveCommand,
  keepCapturing,
  leaveSquad,
  pruneSquads,
  renameSquad,
  squadById,
  SQUAD_NAME_MAX,
} from '../core/squads';
import { HQ, MAP_H, MAP_W, DEFAULT_RULES, RULES, UNIT, useRules, Movement, UNIT_NAMES } from '../core/data';
import { grid, inBounds, manhattan, samePos, seededRng } from '../core/geom';
import { generateGame } from '../core/mapgen';
import { closestStep, extendTrail } from '../core/orders';
import {
  attackEvent,
  buildingIncome,
  commandUsed,
  attackTargets,
  buildingAt,
  buyOptions,
  canBuyAt,
  canCapture,
  inControlZone,
  canWalk,
  passMap,
  stepToward,
  capture,
  capturePointsOf,
  captureProgress,
  load,
  loadTargets,
  merge,
  mergeTargets,
  moveRange,
  moveUnit,
  outcome,
  endReason,
  removeUnit,
  spawn,
  supply,
  upkeepOf,
  threatMap,
  attackZone,
  captureEvent,
  moveEvent,
  unitActions,
  unitAt,
  unitById,
  unload,
  unloadTiles,
  visibility,
  wait,
  type BuyOption,
  type MoveRange,
} from '../core/rules';
import { deserialize, serialize } from '../core/save';
import { recordEvent, sampleArmy } from '../core/stats';
import type { Building, CommandKind, GameEvent, GameSetup, GameState, Pos, Unit } from '../core/types';
import { randomSeed } from '../setup';
import { buildMission, missionById, missionRules } from '../core/missions';
import { ensureWeather } from '../core/weather';
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
import { settings, t, unitLabel } from '../settings';
import { deleteSave, readSave, writeSave } from '../storage';
import { MapView, type HighlightKind, type ViewOptions } from '../ui/mapView';
import { WeatherFx } from '../ui/weatherFx';
import { unitKey } from '../ui/sprites';
import { terrainPalette } from '../ui/terrainColors';
import { PointerGestures } from '../controls/pointer';
import { clickSelect } from '../controls/selection';
import { actionById, cursorFor, exactSquad, menuActions, type ActionCtx, type ActionId, type CursorKind } from '../controls/actions';
import { cursorCss } from '../ui/cursors';
import { CLOSES_HELP, type GameCommand } from '../controls/commands';
import type { ControlContext, MenuCommand } from '../controls/menu';
import { squadsVM, commandLabel, buyBlockedText, minimapVM, tileVM, weatherVM, dayInfoVM, economyVM, generalVM } from '../ui/hudModels';
import { defaultLab, labState, type LabAction, type LabOptions } from '../lab';
import { newGeneral } from '../core/generals';
import {
  ACTION_ORDER,
  CMD_OF,
  CONFIRM_MS,
  GAME_MENU,
  key,
  MENU_PHASES,
  type ActionKey,
  type GameStartData,
  type Intent,
  type MoveUndo,
  type Phase,
} from './game/types';
import { intentAt, trailTo, type MovePlan } from './game/intent';
import { computeHighlights } from './game/highlights';
import { menuModel } from './game/menuModel';
import { forecastFor, hintText, moveTipFor, selectionPanel } from './game/hudParts';
import { TutorialTracker } from './game/tutorial';
import { CommandPreview } from './game/commandPreview';
import { EventPlayer, type PlaybackHost } from './game/playback';
import { TurnFlow, type TurnHost } from './game/turns';
import { EndOfMatch, setEndFilter, type EndHost } from './game/endOfMatch';
import { GeneralAbilities, type AbilityHost } from './game/abilities';
import { restartLab, startLab, type LabHost } from './game/labMode';
import { live } from './game/host';
import { bindInput, pointerIn } from './game/input';
import { GroupSelection, type SelectionHost } from './game/groupSelection';
import { Carry, type CarryHost } from './game/carry';
import { pointerTarget, type PointerHost } from './game/pointerInput';

export type { GameStartData } from './game/types';

export class GameScene extends Phaser.Scene {
  private s!: GameState;
  private view!: MapView;
  /** Lluvia, nieve... sobre el mapa. */
  private weatherFx: WeatherFx | null = null;
  private phase: Phase = 'map';
  /** Laboratorio de animaciones (null en una partida normal). */
  private lab: LabOptions | null = null;
  /** [CAMBIO] Orden con destino que se esta dando (fase 'target', eligiendo casilla). */
  private ordering: { kind: CommandKind; uids: number[]; single: boolean } | null = null;
  /**
   * [CAMBIO] Menu de ordenes en una casilla (fase 'orderMenu'): clic derecho, pulsacion larga o F en el
   * destino con una unidad o un grupo elegido. `from`: de donde se venia (adonde vuelve al cancelar).
   */
  private orderMenu: { at: Pos; uids: number[]; ids: ActionId[]; from: 'move' | 'unitMenu' | 'map' } | null = null;
  private vis: boolean[][] = [];
  private hidden = new Set<number>();

  // Seleccion
  private sel: Unit | null = null;
  private selBuilding: Building | null = null;
  private menuSel = 0;
  private menuItems: MenuItemVM[] = [];
  private actions: ActionKey[] = [];
  private buy: BuyOption[] = [];
  private range: MoveRange | null = null;
  private mergeSet = new Map<string, number>();
  private loadSet = new Map<string, number>();
  private attackSet = new Map<string, number>();
  private unloadSet = new Set<string>();
  private passenger: Unit | null = null;
  private undo: MoveUndo | null = null;

  // Movimiento: camino trazado, arrastrar y soltar, deshacer
  /** Camino que se esta trazando, de la unidad elegida al cursor (incluye la casilla de salida). */
  private trail: Pos[] = [];
  /** Casillas que bloquean el paso a la unidad elegida (enemigos que se ven). */
  private block: boolean[][] | null = null;
  /** Unidad cogida para arrastrar y soltar (game/carry.ts). */
  private carry = new Carry(this.carryHost());
  /** Casillas que el enemigo visible puede atacar el turno siguiente (al mover) y alcance de ataque de la elegida. */
  private dangerMap: boolean[][] | null = null;
  private attackZone: boolean[][] | null = null;
  /** Estados anteriores para deshacer movimientos sin consecuencias (Ctrl+Z). */
  private undoStack: string[] = [];
  /** [CAMBIO] Lo elegido: grupo, «Elegir varias», escuadras y teclas de grupo (game/groupSelection.ts). */
  private selection = new GroupSelection(this.selectionHost());
  /** Ultimo movimiento confirmado (para el doble clic: mover y esperar). */
  private lastCommit: { at: Pos; time: number } | null = null;

  // Partida
  private fromSave = false;
  private savedThisGame = false;
  private quitArmedAt = -1e9;
  private corruptSave = false;
  /** Ignorar Enter/clic hasta este instante (tras el turno enemigo). */
  private inputLockUntil = 0;
  private deleteArmed = false;
  private fastForward = false;
  private ended = false;
  /** Zona de amenaza enemiga visible (tecla T). */
  private threat = false;
  /** [CAMBIO] Ver lo que hara cada unidad con orden al terminar el turno (todas, tecla V). */
  private intents = false;
  /** Prevision de las ordenes (previewCommands), recalculada solo si cambia la partida. */
  private preview = new CommandPreview();
  /** Unidad cuyo alcance se esta mostrando (Enter o clic derecho sobre ella). */
  private inspectUid: number | null = null;
  private lastScroll = { x: NaN, y: NaN, zoom: NaN };

  /** Panel de la mision y pasos del tutorial. */
  private tutorial = new TutorialTracker();

  /** Animar los eventos de las reglas (game/playback.ts). */
  private player = new EventPlayer(this.playbackHost());
  /** Fin de turno, turno de la IA y su repeticion (game/turns.ts). */
  private turns = new TurnFlow(this.turnHost());
  /** Final de la partida (game/endOfMatch.ts). */
  private endScreen = new EndOfMatch(this.endHost());
  /** Habilidades del general del jugador (game/abilities.ts). */
  private abilities = new GeneralAbilities(this.abilityHost());

  // Raton y dedos (src/controls/pointer.ts)
  private gestures = new PointerGestures(pointerTarget(this.pointerHost()));

  constructor() {
    super('Game');
  }

  /** Estado para src/debug.ts (tests y agentes): copia, no se puede cambiar la partida con ella. */
  debugSnapshot(): { state: string; phase: string; busy: boolean; ended: boolean; day: number; cursor: Pos } {
    return {
      state: serialize(this.s),
      phase: this.phase,
      busy: this.phase === 'busy' || this.enemyPlaying,
      ended: this.ended,
      day: this.s.day,
      cursor: { ...this.view.cursor },
    };
  }

  /** Partida en curso: cambia en cada init() y al cerrar la escena; las esperas asincronas la comprueban. */
  private match = 0;

  /**
   * Phaser reutiliza el objeto escena al volver a entrar: los valores iniciales de los campos solo se
   * ponen una vez. Todo lo que es de una partida se reinicia aqui (lo llama init()).
   */
  private resetMatch(): void {
    this.match++;
    this.phase = 'map';
    this.vis = [];
    this.hidden = new Set();
    this.sel = null;
    this.selBuilding = null;
    this.menuSel = 0;
    this.menuItems = [];
    this.actions = [];
    this.buy = [];
    this.range = null;
    this.mergeSet = new Map();
    this.loadSet = new Map();
    this.attackSet = new Map();
    this.unloadSet = new Set();
    this.passenger = null;
    this.undo = null;
    this.trail = [];
    this.block = null;
    this.carry.reset();
    this.dangerMap = null;
    this.attackZone = null;
    this.undoStack = [];
    this.selection.reset();
    this.lastCommit = null;
    this.fromSave = false;
    this.savedThisGame = false;
    this.quitArmedAt = -1e9;
    this.surrenderArmedAt = -1e9;
    this.corruptSave = false;
    this.inputLockUntil = 0;
    this.deleteArmed = false;
    this.fastForward = false;
    this.ended = false;
    this.turns.reset();
    this.inspectUid = null;
    this.preview.reset();
    this.lastScroll = { x: NaN, y: NaN, zoom: NaN };
    this.gestures.reset();
    this.tutorial.reset();
    this.lastAt = null;
    this.anchorAt = {};
    this.endScreen.reset();
  }

  init(data: GameStartData): void {
    this.resetMatch();
    this.lab = data.mode === 'lab' ? (data.lab ?? defaultLab()) : null;
    let state: GameState | null = null;
    if (data.mode === 'load') {
      const raw = readSave();
      state = raw ? deserialize(raw) : null;
      this.fromSave = !!state;
    } else if (data.mode === 'state' && data.state) {
      // Partida preparada desde fuera (tests y src/debug.ts): no viene del guardado.
      state = deserialize(data.state);
    }
    this.corruptSave = (data.mode === 'load' || data.mode === 'state') && !state;
    if (this.corruptSave) deleteSave();
    if (this.lab) {
      // Contraataque solo en la accion que lo enseña (en 'attack', el defensor no responde).
      useRules({ ...DEFAULT_RULES, fog: false, weather: false, counterattack: this.lab.play !== 'attack' });
      this.s = labState(this.lab, this.lab.play);
    } else if (state) {
      // Solo se guardan los ajustes de la partida; las reglas son siempre las actuales
      // (las partidas antiguas con las reglas de 2013 pasan a jugarse con estas).
      const r = state.rules;
      state.rules = {
        ...DEFAULT_RULES,
        ...(r
          ? {
              initialFunds: r.initialFunds,
              maxUnits: r.maxUnits,
              incomeScale: r.incomeScale,
              fog: r.fog,
              dayLimit: r.dayLimit,
              commandPoints: r.commandPoints,
              upkeep: r.upkeep,
              weather: r.weather ?? DEFAULT_RULES.weather,
            }
          : {}),
      };
      useRules(state.rules);
      this.s = state;
    } else if (data.mode === 'mission' && data.mission && missionById(data.mission)) {
      const m = missionById(data.mission)!;
      useRules(missionRules(m));
      this.s = buildMission(m);
    } else {
      useRules(data.rules ?? DEFAULT_RULES);
      const setup: GameSetup = data.setup ?? { seed: randomSeed(), size: 32, theme: null };
      this.s = generateGame(seededRng(setup.seed), { size: setup.size, theme: setup.theme });
      this.s.setup = setup;
      const g = newGeneral(data.general);
      const e = newGeneral(data.enemyGeneral);
      if (g || e) this.s.generals = [g, e];
    }
    ensureWeather(this.s);
  }

  create(): void {
    setEndFilter(null);
    sampleArmy(this.s);
    this.lastAt = null;
    this.view = new MapView(this);
    this.view.buildTerrain(this.s);
    this.weatherFx = new WeatherFx(this);
    const onUpdate = (_time: number, delta: number) => this.weatherFx?.update(delta);
    this.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);

    // Cursor y camara sobre la Base del jugador.
    const hq = this.s.buildings.find((b) => b.owner === 0 && b.type === HQ) ?? { x: 0, y: 0 };
    this.view.cursor = { x: hq.x, y: hq.y };
    this.view.centerOn(hq, true);

    bindInput(this, this, this.gestures);
    this.bindHud();
    const onResize = (size: Phaser.Structs.Size) => {
      this.view.resize(size.width, size.height);
      this.refreshHud();
    };
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
    playMusic(this, 'game');
    this.threat = settings.alwaysThreat;
    this.optionsPanel = new OptionsPanel(
      this,
      'game',
      (key) => {
        if (key === 'terrainArt') {
          this.view.buildTerrain(this.s);
          this.refresh();
        }
        if (key === 'alwaysThreat') {
          this.threat = settings.alwaysThreat;
          ui.set({ threat: this.threat });
          this.refresh();
        } else this.refreshHud();
      },
      () => this.refreshHud(),
    );
    ui.set({ screen: 'game', toast: null, banner: null, combat: null, threat: this.threat, intents: this.intents, options: null });
    this.refresh();
    if (this.lab) startLab(this.labHost(), this.lab);
    else showBanner(`${t('day')} ${this.s.day}`, t('yourTurn'), 'blue');
    if (this.corruptSave) showToast(t('badSave'));
  }

  /** Acciones que puede lanzar la interfaz HTML. */
  private bindHud(): void {
    const ready = () => !this.ended && this.phase !== 'busy' && this.time.now >= this.inputLockUntil;
    Object.assign(ui.actions, {
      menuHover: (i: number) => {
        // En la compra se pueden señalar las que no se pueden pagar (se ve por que); en el resto no.
        if (this.menuItems[i]?.disabled && this.phase !== 'buy') return;
        if (ready() && MENU_PHASES.includes(this.phase)) this.selectMenu(i);
      },
      menuPick: (i: number) => {
        if (!ready() || !MENU_PHASES.includes(this.phase)) return;
        this.selectMenu(i);
        this.accept();
      },
      menuClose: () => {
        if (ready() && MENU_PHASES.includes(this.phase)) this.back();
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
        if (!ready() || this.phase !== 'map') return;
        // Con unidades elegidas, el boton abre sus ordenes; sin ninguna, entra o sale del modo.
        if (this.group.size) return this.openGroupMenu();
        this.multi = !this.multi;
        if (!this.multi) this.group.clear();
        else showToast(t('multiHint'));
        this.refresh();
      },
      selectSquad: (id: number) => {
        if (ready()) this.selection.pickSquad(id);
      },
      renameSquad: (id: number, name: string) => {
        renameSquad(this.s, id, name);
        ui.set({ rename: null });
        this.refresh();
      },
      useAbility: (id: string) => {
        if (ready() && (this.phase === 'map' || this.phase === 'target')) void this.abilities.start(id);
      },
      cancelAbility: () => {
        if (this.phase === 'target') this.toMap();
      },
      openGameMenu: () => {
        if (ready()) this.openGameMenu();
      },
      minimapJump: (x: number, y: number) => {
        if (this.ended) return;
        this.cameras.main.centerOn(x * TILE, y * TILE);
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
        if (!ready()) return;
        const u = unitById(this.s, uid);
        if (!u) return;
        this.abandonSelection();
        this.view.cursor = { x: u.x, y: u.y };
        this.view.ensureVisible(u, 3);
        this.selectUnit(u);
      },
    });
  }

  private toggleIntents(): void {
    this.intents = !this.intents;
    ui.set({ intents: this.intents });
    this.refresh();
  }

  /** Intenciones que se dibujan: de la unidad señalada y su escuadra, o de todas con la tecla V. */
  private intentsToDraw(): { path: Pos[]; attack?: Pos; capture?: Pos }[] {
    if (this.phase !== 'map' || this.enemyPlaying || this.ended || this.lab) return [];
    const mine = this.s.units.filter((u) => u.team === 0 && this.cmdOf(u) && u.active && u.carrier === null);
    const shown = mine.filter((u) => this.intents || this.showsOrderLine(u));
    if (!shown.length) return [];
    const all = this.preview.get(this.s);
    const out: { path: Pos[]; attack?: Pos; capture?: Pos }[] = [];
    for (const u of shown) {
      const i = all.get(u.uid);
      if (!i) continue;
      // Por si acaso: nunca se marca un objetivo que el jugador no ve.
      const attack = i.attack && this.vis[i.attack.x]![i.attack.y] ? i.attack : undefined;
      if (i.path.length > 1 || attack || i.capture) out.push({ path: i.path, attack, capture: i.capture });
    }
    return out;
  }

  private toggleThreat(): void {
    this.threat = !this.threat;
    ui.set({ threat: this.threat });
    this.refresh();
  }

  /** Tab: llevar el cursor a la siguiente unidad sin mover. */
  private nextIdle(): void {
    const idle = this.idleUnits();
    if (!idle.length) return;
    const here = unitAt(this.s, this.view.cursor.x, this.view.cursor.y);
    const i = here ? idle.findIndex((u) => u.uid === here.uid) : -1;
    const u = idle[(i + 1) % idle.length]!;
    this.view.cursor = { x: u.x, y: u.y };
    this.view.ensureVisible(u, 3);
    this.cursorMoved();
  }

  /** [CAMBIO] Linea de la orden: de la unidad bajo el cursor (y su escuadra) o de las que se estan ordenando. */
  private showsOrderLine(u: Unit): boolean {
    if (this.ordering?.uids.includes(u.uid) || this.group.has(u.uid)) return true;
    const here = unitAt(this.s, this.view.cursor.x, this.view.cursor.y);
    return !!here && (here.uid === u.uid || (here.squad !== undefined && here.squad === u.squad));
  }

  /** La orden que cumple la unidad (la suya o la de su escuadra). */
  private cmdOf(u: Unit) {
    return effectiveCommand(this.s, u);
  }

  private idleUnits(): Unit[] {
    // Las que tienen orden no cuentan: la cumpliran solas al terminar el turno.
    return this.s.units.filter((u) => u.team === 0 && u.active && u.carrier === null && !this.cmdOf(u));
  }

  // -------------------------------------------------------------------------
  // Dibujado
  // -------------------------------------------------------------------------

  private highlights(): Map<string, HighlightKind> {
    const h = computeHighlights({
      s: this.s,
      phase: this.phase,
      cursor: this.view.cursor,
      range: this.range,
      merge: this.mergeSet,
      load: this.loadSet,
      attack: this.attackSet,
      unload: this.unloadSet,
      orderMenuUids: this.orderMenu?.uids ?? null,
      orderingUids: this.ordering?.uids ?? null,
      targetArea: (c) => this.abilities.area(c),
      group: this.group,
      inspectUid: this.inspectUid,
      enemyPlaying: this.enemyPlaying,
      visible: (p) => this.visibleToPlayer(p),
    });
    if (h.inspectGone) this.inspectUid = null;
    return h.tiles;
  }

  /** Camino previsto de la unidad seleccionada: el trazado hasta el cursor, o hasta la casilla desde la que atacaria. */
  private previewPath(): Pos[] | undefined {
    if (this.phase !== 'move' || !this.sel || !this.range) return undefined;
    const it = this.intentAt(this.view.cursor);
    const dest = it.kind === 'move' ? it.to : it.kind === 'attack' ? it.from : null;
    // Sin destino valido (fuera del alcance, agua...): se sigue viendo el camino trazado hasta donde llega.
    if (!dest) return this.trail.length > 1 ? this.trail : undefined;
    if (samePos(dest, this.sel)) return undefined;
    return this.trailTo(dest);
  }

  private refresh(): void {
    // [CAMBIO] Puntero del raton segun lo que haria el clic derecho donde esta el cursor.
    if (this.gestures.inside) this.updatePointer(this.phase === 'busy' ? null : this.view.cursor);
    // Al acabar se descubre todo el mapa.
    this.vis = this.ended ? grid(true) : visibility(this.s, 0);
    const threat = this.threat && !this.enemyPlaying ? threatMap(this.s, 1, 0) : null;
    const captures = this.s.buildings
      .map((b) => ({ b, c: captureProgress(this.s, b) }))
      .filter(({ b, c }) => c && (this.vis[b.x]![b.y] || b.owner === 0))
      .map(({ b, c }) => ({ x: b.x, y: b.y, left: c!.left, total: capturePointsOf(b), team: c!.team }));
    const obj = this.s.mission?.objective;
    const vipUnit = obj?.kind === 'escort' ? unitById(this.s, obj.uid) : undefined;
    const vipAt = vipUnit ? (vipUnit.carrier !== null ? (unitById(this.s, vipUnit.carrier) ?? vipUnit) : vipUnit) : undefined;
    this.view.pruneScorch(this.s.day);
    this.view.render(this.s, {
      vis: this.vis,
      highlights: this.highlights(),
      hidden: this.hidden,
      path: this.previewPath(),
      pathAttack: this.phase === 'move' && this.intentAt(this.view.cursor).kind === 'attack',
      threat,
      attackZone: this.phase === 'move' ? this.attackZone : null,
      orders: [
        ...this.s.units
          .filter((u) => u.team === 0 && u.order && u.carrier === null)
          .map((u) => ({ from: { x: u.x, y: u.y }, to: u.order! })),
        // [CAMBIO] Ordenes con destino: bandera siempre; linea para la unidad señalada y su escuadra.
        ...this.s.units.flatMap((u) => {
          const c = u.team === 0 && u.carrier === null ? this.cmdOf(u) : undefined;
          return c ? [{ from: { x: u.x, y: u.y }, to: c.at, kind: c.kind, line: this.showsOrderLine(u) }] : [];
        }),
      ],
      danger: this.phase === 'move' ? this.dangerMap : null,
      intents: this.intentsToDraw(),
      captures,
      controlPoints: this.controlPointsView(),
      goal: obj?.kind === 'escort' ? obj.to : null,
      vip: vipAt && !this.hidden.has(vipAt.uid) ? { x: vipAt.x, y: vipAt.y } : null,
    });
    this.view.placeCursor(this.phase !== 'busy');
    this.publishMinimap();
    this.refreshHud();
  }

  private publishMinimap(): void {
    ui.set({ minimap: minimapVM(terrainPalette(this.textures), this.s, this.vis, this.hidden) });
  }

  /** Solo cambia el cursor: no hace falta redibujar unidades, salvo el camino previsto. */
  private cursorMoved(): void {
    if (this.phase === 'move') {
      this.updateTrail(this.view.cursor);
      this.refresh();
    } else if (this.phase === 'map' || this.phase === 'target')
      this.refresh(); // en 'target' el area sigue al cursor
    else {
      this.view.placeCursor(true);
      this.refreshHud();
    }
  }

  private refreshHud(): void {
    const s = this.s;
    const c = this.view.cursor;
    const busy = this.phase === 'busy';
    const owned = s.buildings.filter((b) => b.owner === 0);
    const idle: IdleVM[] = this.idleUnits().map((u) => ({ uid: u.uid, icon: unitKey(this.textures, s, u), name: unitLabel(u.type) }));
    const weather = weatherVM(s);
    this.weatherFx?.set(weather?.id ?? null);
    ui.set({
      funds: s.funds[0],
      income: owned.reduce((sum, b) => sum + buildingIncome(b.type), 0) - upkeepOf(s, 0),
      command: RULES.commandPoints === null ? null : { used: commandUsed(s, 0), max: RULES.commandPoints },
      economy: economyVM(s, 0),
      dayInfo: dayInfoVM(s),
      lab: this.lab
        ? {
            units: UNIT_NAMES.map((_, i) => unitLabel(i)),
            attacker: this.lab.attacker,
            defender: this.lab.defender,
            slow: this.lab.slow,
            canAttack: !!UNIT.canfight[this.lab.attacker],
          }
        : null,
      general: generalVM(s, 0, this.phase === 'target' ? this.abilities.targeting : null),
      enemyGeneral: generalVM(s, 1, null),
      buildings: owned.length,
      day: s.day,
      dayLimit: RULES.dayLimit,
      weather,
      turn: this.enemyPlaying ? 'enemy' : 'player',
      busy,
      tile: busy ? null : this.tileInfo(c),
      forecast: this.phase === 'attack' || this.phase === 'move' ? this.forecast(c) : null,
      moveTip: this.phase === 'move' ? this.moveTip(c) : null,
      menu: MENU_PHASES.includes(this.phase) ? this.buildMenu() : null,
      idle,
      squads: squadsVM(this.s),
      multi: this.multi || this.group.size ? this.group.size : null,
      selection: this.selectionVM(),
      endTurn: { pending: this.turns.pendingUnits().length, armed: this.turns.endArmed() },
      anyCommand: this.s.units.some((u) => u.team === 0 && !!this.cmdOf(u)),
      hint: hintText({
        busy,
        enemyPlaying: this.enemyPlaying,
        phase: this.phase,
        ordering: !!this.ordering,
        inspecting: this.inspectUid !== null,
      }),
      mission: this.tutorial.panel(this.s, this.phase),
    });
    this.publishCameraView();
  }

  private forecast(c: Pos): ForecastVM | null {
    return forecastFor(this.textures, this.s, {
      phase: this.phase,
      sel: this.sel,
      c,
      intentAt: (p) => this.intentAt(p),
      attackSet: this.attackSet,
      anchor: (p) => this.anchor('forecast', p),
    });
  }

  /** Bocadillo junto al cursor al mover (ver moveTipFor). */
  private moveTip(c: Pos): MoveTipVM | null {
    return moveTipFor(this.s, {
      sel: this.sel,
      range: this.range,
      c,
      intentAt: (p) => this.intentAt(p),
      trailTo: (d) => this.trailTo(d),
      danger: this.dangerMap,
      anchor: (p) => this.anchor('moveTip', p),
    });
  }

  private tileInfo(p: Pos): TileVM {
    const selected = this.phase !== 'map' ? this.sel : null;
    return tileVM(this.textures, this.s, p, { vis: this.vis, hidden: this.hidden, selected });
  }

  /** Menu emergente de la fase actual. */
  private buildMenu(): MenuVM {
    const { kind, title, subtitle, info, items, at } = menuModel({
      s: this.s,
      phase: this.phase,
      cursor: this.view.cursor,
      sel: this.sel,
      actions: this.actions,
      building: this.selBuilding,
      buy: this.buy,
      groupUnits: () => this.selection.groupUnits(),
      groupCtx: () => this.actionCtx(null),
      orderMenu: this.orderMenu,
      canReplay: this.turns.canReplay,
    });
    this.menuItems = items;
    return { kind, title, subtitle, info, items, selected: this.menuSel, anchor: this.anchor('menu', at) };
  }

  // -------------------------------------------------------------------------
  // Entrada
  // -------------------------------------------------------------------------

  /** Donde va lo que pulse un mando: al mapa (command) o a un menu propio (menu). */
  controlContext(): ControlContext {
    if (this.ended) return 'end';
    if (this.optionsPanel.isOpen) return 'options';
    return 'map';
  }

  /** Cumplir una orden de menu (pantalla final u opciones), venga del mando que venga. */
  menu(cmd: MenuCommand): void {
    if (this.ended) return this.endScreen.command(cmd);
    if (this.optionsPanel.isOpen) this.optionsPanel.command(cmd);
  }

  /**
   * Cumplir una orden del jugador, venga del teclado o de otro mando (ver src/controls). Es lo unico
   * que un mando necesita de la escena.
   */
  command(cmd: GameCommand): void {
    // Escribiendo el nombre de una escuadra: el teclado es del cuadro de texto.
    if (ui.get().rename) return;
    if (ui.get().help) {
      if (CLOSES_HELP.includes(cmd.kind)) ui.set({ help: false });
      return;
    }
    if (cmd.kind === 'help') return ui.set({ help: true });
    if (cmd.kind === 'options') {
      if (this.phase !== 'map' && this.phase !== 'gameMenu') return;
      if (this.phase === 'map') this.openGameMenu();
      this.menuSel = GAME_MENU.indexOf('options');
      this.refreshHud();
      return this.optionsPanel.open();
    }
    if (this.phase === 'busy') {
      // Durante el turno enemigo, aceptar acelera las animaciones.
      if (cmd.kind === 'accept') this.fastForward = true;
      return;
    }
    switch (cmd.kind) {
      case 'cursor':
        return this.direction(cmd.dx, cmd.dy);
      case 'accept':
        if (this.time.now < this.inputLockUntil) return;
        if (this.phase === 'move') return void this.commit(this.view.cursor, { wait: cmd.wait });
        return this.accept();
      case 'stepBack':
        // Al trazar un camino, quitar la ultima casilla.
        if (this.phase === 'move' && this.trail.length > 1) {
          this.trail = this.trail.slice(0, -1);
          this.view.cursor = { ...this.trail[this.trail.length - 1]! };
          this.view.ensureVisible(this.view.cursor, 3);
          return this.refresh();
        }
        return this.back();
      case 'cancel':
        if (this.carry.active) return this.carry.cancel();
        if (this.phase === 'orderMenu') return this.back();
        if (this.group.size || this.multi) {
          this.group.clear();
          this.multi = false;
          // Con el menu de grupo abierto, cerrarlo tambien (no dejarlo abierto sin unidades).
          if (this.phase === 'groupMenu') return this.toMap();
          return this.refresh();
        }
        return this.back();
      case 'undo':
        if (this.phase === 'map') this.undoLast();
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
        // [CAMBIO] Con varias elegidas, Tab va pasando por ellas (panel de lo elegido); si no, la siguiente sin mover.
        if (this.phase === 'map' && this.group.size > 1) return this.selection.nextPicked();
        if (this.phase === 'map') this.nextIdle();
        return;
      case 'order':
        return this.orderKey(cmd.order);
      case 'group':
        // [CAMBIO] 1-9 elige el grupo (dos veces: la camara va alli); Ctrl lo hace; Mayusculas añade.
        return this.selection.groupKey(cmd.n, cmd.mode);
      case 'orderHere':
        // [CAMBIO] F: menu de ordenes en la casilla del cursor, con la unidad o el grupo elegido.
        if (!this.openOrderMenu(this.view.cursor) && (this.phase === 'map' || this.phase === 'move')) showToast(t('orderHereNone'));
        return;
      case 'zoom':
        this.zoomKey(cmd.dir);
        return this.refreshHud();
      default:
        return;
    }
  }

  /** Zoom con teclado: alrededor del cursor, y que siga a la vista. */
  private zoomKey(dir: 1 | -1): void {
    const c = this.view.screenOf(this.view.cursor);
    this.view.zoomStep(dir, c.x, c.y);
    this.view.ensureVisible(this.view.cursor, 2, true);
  }

  private direction(dx: number, dy: number): void {
    if (MENU_PHASES.includes(this.phase)) {
      if (!dy) return;
      const n = this.menuItems.length;
      let i = this.menuSel;
      // Saltar elementos desactivados salvo en la compra (alli se ven, aunque no se puedan pagar).
      for (let k = 0; k < n; k++) {
        i = (i + dy + n) % n;
        if (!this.menuItems[i]?.disabled || this.phase === 'buy') break;
      }
      return this.selectMenu(i);
    }
    this.moveCursorTo({ x: this.view.cursor.x + dx, y: this.view.cursor.y + dy }, true);
  }

  private selectMenu(i: number): void {
    if (i === this.menuSel) return;
    this.menuSel = i;
    this.deleteArmed = false;
    this.refreshHud();
  }

  private moveCursorTo(p: Pos, follow: boolean): void {
    if (p.x < 0 || p.y < 0 || p.x >= MAP_W || p.y >= MAP_H || samePos(p, this.view.cursor)) return;
    this.view.cursor = { ...p };
    if (follow) this.view.ensureVisible(p, 3);
    this.cursorMoved();
  }

  override update(time: number, delta: number): void {
    this.view.cursorAttack = this.phase === 'attack' || this.phase === 'target';
    this.view.tick(time);
    // Desplazar el mapa con el puntero en el borde (el adaptador decide cuanto; ver PointerGestures.tick).
    this.gestures.tick(pointerIn(this.input.activePointer, false), this.scale.width, this.scale.height, delta);
    // Si la camara se ha movido (arrastre, borde, paneo animado), recolocar los bocadillos.
    const cam = this.cameras.main;
    const l = this.lastScroll;
    if (cam.scrollX !== l.x || cam.scrollY !== l.y || cam.zoom !== l.zoom) this.refreshCamera();
  }

  /** Casilla junto a la que va cada bocadillo (para recolocarlos al mover la camara sin rehacerlos). */
  private anchorAt: Partial<Record<'menu' | 'forecast' | 'moveTip', Pos>> = {};

  private anchor(kind: 'menu' | 'forecast' | 'moveTip', p: Pos): Anchor {
    this.anchorAt[kind] = { x: p.x, y: p.y };
    return this.view.tileRectCss(p);
  }

  /**
   * La camara se ha movido: solo se recolocan los bocadillos que se ven y el recuadro del minimapa.
   * (Rehacer todo el HUD en cada fotograma de un desplazamiento es caro y no cambia nada mas.)
   */
  private refreshCamera(): void {
    const st = ui.get();
    const at = this.anchorAt;
    const patch: Partial<UIState> = {};
    if (st.menu && at.menu) patch.menu = { ...st.menu, anchor: this.view.tileRectCss(at.menu) };
    if (st.forecast && at.forecast) patch.forecast = { ...st.forecast, anchor: this.view.tileRectCss(at.forecast) };
    if (st.moveTip && at.moveTip) patch.moveTip = { ...st.moveTip, anchor: this.view.tileRectCss(at.moveTip) };
    ui.set(patch);
    this.publishCameraView();
  }

  private publishCameraView(): void {
    const cam = this.cameras.main;
    this.lastScroll = { x: cam.scrollX, y: cam.scrollY, zoom: cam.zoom };
    const wv = cam.worldView;
    ui.set({ minimapView: { x: wv.x / TILE, y: wv.y / TILE, w: wv.width / TILE, h: wv.height / TILE } });
  }

  // -------------------------------------------------------------------------
  // Aceptar / atras
  // -------------------------------------------------------------------------

  private accept(): void {
    const c = this.view.cursor;
    switch (this.phase) {
      case 'map': {
        const own = unitAt(this.s, c.x, c.y);
        // [CAMBIO] "Elegir varias" con el teclado: Enter sobre una unidad propia la añade o la quita.
        const picks = this.selection;
        if (this.multi && own && picks.selectable(own))
          return picks.apply(clickSelect(picks.selection(), own, { shift: true, ctrl: false, count: 1 }, () => []));
        // [CAMBIO] Con un grupo elegido: Enter sobre una de sus unidades abre sus ordenes (escuadra,
        // atacar, capturar...); sobre otra propia, la elige a ella; en otra casilla, mueve el grupo.
        if (this.group.size && !this.multi) {
          if (own && this.group.has(own.uid)) return this.openGroupMenu();
          if (own && picks.selectable(own)) return picks.apply(new Set([own.uid]));
          return void this.groupMove(c);
        }
        return this.acceptMap(c);
      }
      case 'groupMenu':
        return this.acceptGroupMenu();
      case 'orderMenu':
        return void this.acceptOrderMenu();
      case 'gameMenu':
        return this.acceptGameMenu();
      case 'unitMenu':
        return this.acceptUnitMenu();
      case 'buy':
        return this.acceptBuy();
      case 'move':
        return void this.acceptMove(c);
      case 'attack':
        return void this.acceptAttack(c);
      case 'unloadPick':
        return this.acceptUnloadPick();
      case 'unloadTile':
        return this.acceptUnloadTile(c);
      case 'target':
        if (this.ordering) return void this.placeOrder(c);
        return void this.abilities.fire(c);
      default:
        break;
    }
  }

  private back(): void {
    this.deleteArmed = false;
    switch (this.phase) {
      case 'map':
        if (this.inspectUid !== null) {
          this.inspectUid = null;
          return this.refresh();
        }
        return this.openGameMenu();
      case 'gameMenu':
        return this.toMap();
      case 'groupMenu':
        // Atras deja el grupo elegido: el siguiente clic en el mapa lo mueve.
        return this.toMap();
      case 'orderMenu': {
        // Vuelve a donde estaba: la unidad elegida (moviendo o en su menu) o el grupo.
        const from = this.orderMenu?.from;
        this.orderMenu = null;
        if (from === 'move' && this.sel) return this.selectUnit(this.sel);
        if (from === 'unitMenu' && this.sel) return this.openUnitMenu();
        return this.toMap();
      }
      case 'buy':
      case 'move':
        return this.toMap();
      case 'unitMenu':
        return this.undoMove();
      case 'attack':
      case 'unloadPick':
        return this.openUnitMenu();
      case 'unloadTile':
        this.phase = 'unloadPick';
        this.menuSel = 0;
        return this.refresh();
      case 'target':
        if (this.ordering?.single) {
          // Desde el menu de la unidad: vuelve a el (su movimiento sigue a medio decidir).
          this.ordering = null;
          return this.openUnitMenu();
        }
        this.ordering = null;
        return this.toMap();
      default:
        break;
    }
  }

  private toMap(): void {
    this.phase = 'map';
    this.abilities.targeting = null;
    this.ordering = null;
    this.orderMenu = null;
    this.inspectUid = null;
    this.trail = [];
    this.block = null;
    this.dangerMap = null;
    this.attackZone = null;
    this.sel = null;
    this.selBuilding = null;
    this.range = null;
    this.undo = null;
    this.passenger = null;
    this.mergeSet.clear();
    this.loadSet.clear();
    this.attackSet.clear();
    this.unloadSet.clear();
    this.refresh();
  }

  /** Si hay una unidad movida a medio decidir, deshacer su movimiento antes de salir. */
  private abandonSelection(): void {
    if ((this.phase === 'unitMenu' || this.phase === 'attack' || this.phase === 'unloadPick' || this.phase === 'unloadTile') && this.undo) {
      this.undoMove();
    }
    if (this.phase !== 'map') this.toMap();
  }

  private openGameMenu(): void {
    if (this.phase !== 'map' && this.phase !== 'gameMenu') this.abandonSelection();
    this.menuSel = 0;
    this.phase = 'gameMenu';
    this.refresh();
  }

  private acceptMap(c: Pos): void {
    const u = unitAt(this.s, c.x, c.y);
    if (this.inspectUid !== null) {
      // Segunda pulsacion: cerrar el alcance (o señalar otra unidad).
      const same = u?.uid === this.inspectUid;
      this.inspectUid = null;
      if (same || !u) return this.refresh();
    }
    if (u && u.team === 0 && u.active) return this.selectUnit(u);
    const b = buildingAt(this.s, c.x, c.y);
    if (b && b.owner === 0 && canBuyAt(this.s, b)) {
      this.selBuilding = b;
      this.buy = buyOptions(this.s, b);
      const firstAffordable = this.buy.findIndex((o) => o.affordable);
      this.menuSel = firstAffordable >= 0 ? firstAffordable + 1 : 0;
      this.phase = 'buy';
      return this.refresh();
    }
    if (u && u.carrier === null && (u.team === 0 || this.visibleToPlayer(u))) return this.inspect(u);
    this.openGameMenu();
  }

  /** Muestra el alcance de una unidad (enemiga, o propia ya usada). */
  private inspect(u: Unit): void {
    this.inspectUid = u.uid;
    this.refresh();
  }

  private selectUnit(u: Unit): void {
    if (!u.canMove) {
      // Ya se ha movido este turno: directamente a sus acciones.
      this.sel = u;
      return this.openUnitMenu();
    }
    this.sel = u;
    this.undo = null;
    this.range = moveRange(this.s, u);
    this.mergeSet = new Map(mergeTargets(this.s, u, this.range).map((o) => [key(o), o.uid]));
    this.loadSet = new Map(loadTargets(this.s, u, this.range).map((o) => [key(o), o.uid]));
    this.trail = [{ x: u.x, y: u.y }];
    this.block = passMap(this.s, u).block;
    this.dangerMap = threatMap(this.s, 1, 0);
    this.attackZone = attackZone(this.s, u, this.range);
    this.phase = 'move';
    this.updateTrail(this.view.cursor);
    this.refresh();
  }

  // -------------------------------------------------------------------------
  // Mover: camino trazado, intencion al soltar, arrastrar y soltar, deshacer
  // -------------------------------------------------------------------------

  /** Alarga, recorta o rehace el camino trazado al pasar el cursor por una casilla. */
  private updateTrail(t: Pos): void {
    const u = this.sel,
      r = this.range;
    if (!u || !r || !this.block) return;
    this.trail = extendTrail(this.s, u, r, this.block, this.trail, t);
  }

  /** La unidad elegida y lo calculado al elegirla (null si no se esta moviendo ninguna). */
  private plan(): MovePlan | null {
    const unit = this.sel,
      range = this.range;
    return unit && range ? { unit, range, merge: this.mergeSet, load: this.loadSet, trail: this.trail } : null;
  }

  /** Camino hasta `dest`: el trazado si acaba ahi, si no el mas corto. */
  private trailTo(dest: Pos): Pos[] {
    return trailTo(this.plan()!, dest);
  }

  /** Que pasaria al soltar (o pulsar) la unidad elegida en una casilla. */
  private intentAt(t: Pos): Intent {
    return intentAt(this.s, this.plan(), t, (p) => this.visibleToPlayer(p));
  }

  /**
   * Confirmar el movimiento en una casilla (soltar, clic o Enter). `drop`: se ha soltado arrastrando,
   * y entonces se hace directamente lo logico (capturar, esperar si no hay nada mas...). `wait`: mover y esperar.
   */
  private async commit(t: Pos, opts: { drop?: boolean; wait?: boolean } = {}): Promise<void> {
    const u = this.sel,
      r = this.range;
    if (!u || !r || this.phase !== 'move') return;
    const it = this.intentAt(t);
    const ghost = unitKey(this.textures, this.s, u);
    // Moverla a mano cancela su orden de varios turnos.
    if (it.kind !== 'none' && it.kind !== 'stay') delete u.order;
    switch (it.kind) {
      case 'none':
        return this.toMap();
      case 'stay':
        if (opts.wait) return this.waitSelected();
        if (opts.drop && canCapture(this.s, u)) {
          this.actions = ['capture'];
          this.menuSel = 0;
          this.phase = 'unitMenu';
          return this.acceptUnitMenu();
        }
        return this.openUnitMenu();
      case 'merge': {
        this.clearUndo();
        const path = merge(this.s, u, it.target);
        if (path)
          await this.playEvents([path.ambush ? moveEvent(u.uid, path) : { kind: 'merge', uid: u.uid, into: it.target.uid, path }], ghost);
        return this.afterAction();
      }
      case 'load': {
        this.clearUndo();
        const path = load(this.s, u, it.target);
        if (path)
          await this.playEvents([path.ambush ? moveEvent(u.uid, path) : { kind: 'load', uid: u.uid, into: it.target.uid, path }], ghost);
        return this.afterAction();
      }
      case 'attack': {
        this.clearUndo();
        if (!samePos(it.from, u)) {
          const path = moveUnit(this.s, u, it.from, r, this.trailTo(it.from));
          if (!path) return this.toMap();
          this.range = null;
          await this.playEvents([moveEvent(u.uid, path)], ghost);
          if (path.ambush) return this.afterAction();
        }
        const target = unitById(this.s, it.target.uid);
        if (!target) return this.afterAction();
        await this.playEvents([attackEvent(this.s, u, target, Math.random)]);
        return this.afterAction();
      }
      case 'move': {
        const before = serialize(this.s);
        const seenBefore = this.visibleEnemies();
        const snapshot: MoveUndo = { uid: u.uid, x: u.x, y: u.y, canFire: u.canFire };
        const path = moveUnit(this.s, u, it.to, r, this.trailTo(it.to));
        if (!path) return;
        this.range = null;
        await this.playEvents([moveEvent(u.uid, path)], ghost);
        if (path.ambush) {
          this.clearUndo();
          return this.afterAction();
        }
        // Se puede deshacer si no ha descubierto a nadie.
        if (this.visibleEnemies() === seenBefore) this.undoStack.push(before);
        else this.clearUndo();
        this.lastCommit = { at: { ...it.to }, time: this.time.now };
        if (opts.wait) return this.waitSelected();
        if (opts.drop && it.capture && canCapture(this.s, u)) {
          this.actions = ['capture'];
          this.menuSel = 0;
          this.phase = 'unitMenu';
          return this.acceptUnitMenu();
        }
        if (opts.drop && settings.autoWait) {
          const av = unitActions(this.s, u);
          if (!av.attack && !av.capture && !av.unload && !av.supply) return this.waitSelected();
        }
        this.undo = snapshot;
        return this.openUnitMenu();
      }
    }
  }

  /** Orden de varios turnos: la unidad avanza ya este turno y, en los siguientes, sola al empezar. */
  private async giveOrder(u: Unit, goal: Pos): Promise<void> {
    delete u.command;
    const r = this.range ?? moveRange(this.s, u);
    const dest = stepToward(this.s, u, goal, r);
    if (!dest) {
      showToast(t('orderUnreachable'));
      return this.toMap();
    }
    this.clearUndo();
    u.order = { ...goal };
    showToast(t('orderSet'));
    const ghost = unitKey(this.textures, this.s, u);
    const path = moveUnit(this.s, u, dest, r);
    this.range = null;
    if (path) await this.playEvents([moveEvent(u.uid, path)], ghost);
    if (samePos(u, goal) || path?.ambush) delete u.order;
    this.toMap();
  }

  /** Mover en grupo: cada unidad elegida va lo mas cerca posible del destino, sin pisarse. */
  private async groupMove(goal: Pos): Promise<void> {
    this.multi = false;
    const units = [...this.group]
      .map((uid) => unitById(this.s, uid))
      .filter((u): u is Unit => !!u && u.active && u.canMove && u.carrier === null)
      .sort((a, b) => manhattan(a, goal) - manhattan(b, goal));
    // [CAMBIO] El grupo sigue elegido despues de moverlo (como en los juegos de estrategia en tiempo real).
    this.clearUndo();
    for (const u of units) {
      const r = moveRange(this.s, u);
      const best = closestStep(u, goal, r);
      if (!best) continue;
      delete u.order;
      const path = moveUnit(this.s, u, best, r);
      if (path) await this.playEvents([moveEvent(u.uid, path)]);
      if (this.ended) return;
    }
    this.toMap();
  }

  /** Uids de las unidades enemigas que se ven ahora (para saber si un movimiento ha descubierto a alguien). */
  private visibleEnemies(): string {
    const vis = visibility(this.s, 0);
    return this.s.units
      .filter((o) => o.team === 1 && o.carrier === null && vis[o.x]![o.y])
      .map((o) => o.uid)
      .sort((a, b) => a - b)
      .join(',');
  }

  private waitSelected(): void {
    if (this.sel) wait(this.sel);
    this.afterAction();
  }

  private clearUndo(): void {
    this.undoStack = [];
  }

  /** Ctrl+Z: volver al estado de antes del ultimo movimiento (si no descubrio nada ni tuvo consecuencias). */
  private undoLast(): void {
    const prev = this.undoStack.pop();
    if (!prev) return showToast(t('nothingToUndo'));
    const st = deserialize(prev);
    if (!st) return;
    this.s = st;
    this.toMap();
    showToast(t('undone'));
  }

  /** Pantalla de opciones (la misma que en el menu principal), encima del menu de pausa. */
  private optionsPanel!: OptionsPanel;

  private acceptGameMenu(): void {
    switch (GAME_MENU[this.menuSel]) {
      case 'options':
        return this.optionsPanel.open();
      case 'resume':
        return this.toMap();
      case 'help':
        this.toMap();
        return ui.set({ help: true });
      case 'save':
        if (writeSave(serialize(this.s))) {
          this.savedThisGame = true;
          showToast(t('saved'));
        }
        return this.toMap();
      case 'endTurn':
        return void this.turns.enemyTurn();
      case 'replay':
        if (!this.turns.canReplay) return showToast(t('noReplay'));
        return void this.turns.replayEnemyTurn();
      case 'surrender':
        if (this.time.now - this.surrenderArmedAt < CONFIRM_MS) return this.surrender();
        this.surrenderArmedAt = this.time.now;
        return showToast(t('confirmSurrender'));
      case 'quit':
        // [CAMBIO] en el original Esc abandonaba la partida al instante, sin confirmar.
        if (this.time.now - this.quitArmedAt < CONFIRM_MS) return this.quitToMenu();
        this.quitArmedAt = this.time.now;
        return showToast(t('confirmQuit'));
      default:
        break;
    }
  }

  private openUnitMenu(): void {
    if (!this.sel) return this.toMap();
    const av = unitActions(this.s, this.sel);
    // [CAMBIO] "Atras" siempre: deshace el movimiento (en el original no se podia).
    av.back = true;
    this.actions = ACTION_ORDER.filter((a) => av[a]);
    // Encima de un edificio que se puede capturar, lo normal es capturar.
    this.menuSel = Math.max(0, this.actions.indexOf('capture'));
    this.deleteArmed = false;
    this.phase = 'unitMenu';
    this.view.cursor = { x: this.sel.x, y: this.sel.y };
    this.refresh();
  }

  private undoMove(): void {
    const u = this.sel;
    if (!u) return this.toMap();
    if (this.undo && this.undo.uid === u.uid) {
      this.undoStack.pop();
      u.x = this.undo.x;
      u.y = this.undo.y;
      u.canFire = this.undo.canFire;
      u.canMove = true;
      this.view.cursor = { x: u.x, y: u.y };
      return this.selectUnit(u);
    }
    this.toMap();
  }

  private async acceptMove(c: Pos): Promise<void> {
    return this.commit(c);
  }

  private acceptUnitMenu(): void {
    const u = this.sel;
    const action = this.actions[this.menuSel];
    if (!u || !action) return;
    switch (action) {
      case 'attack': {
        const targets = attackTargets(this.s, u);
        this.attackSet = new Map(targets.map((o) => [key(o), o.uid]));
        this.phase = 'attack';
        const first = targets[0];
        if (first) {
          this.view.cursor = { x: first.x, y: first.y };
          this.view.ensureVisible(first, 3);
        }
        return this.refresh();
      }
      case 'capture': {
        const b = buildingAt(this.s, u.x, u.y);
        const r = capture(this.s, u);
        // [CAMBIO] Si a mitad de captura, que la acabe aunque tuviera otra orden (destacada).
        keepCapturing(this.s, u);
        if (b && r) void this.playEvents([captureEvent(u, b, r)]).then(() => this.afterAction());
        else this.afterAction();
        return;
      }
      case 'unload':
        this.menuSel = 1;
        this.phase = 'unloadPick';
        return this.refresh();
      case 'supply':
        this.clearUndo();
        supply(this.s, u);
        return this.afterAction();
      case 'wait':
        wait(u);
        return this.afterAction();
      case 'cmdAttack':
      case 'cmdCapture':
      case 'cmdDefend':
        return this.startOrder(CMD_OF[action]!, [u], true);
      case 'cmdCancel':
        cancelCommand(this.s, [u]);
        showToast(t('orderCancelled'));
        return this.openUnitMenu();
      case 'back':
        return this.undoMove();
      case 'delete':
        // [CAMBIO] pedir confirmacion (en el original se borraba al instante).
        if (!this.deleteArmed) {
          this.deleteArmed = true;
          return showToast(t('confirmDelete'));
        }
        this.clearUndo();
        removeUnit(this.s, u.uid);
        return this.afterAction();
    }
  }

  // -------------------------------------------------------------------------
  // [CAMBIO] Seleccion (game/groupSelection.ts): una unidad elegida (sel, al moverla) o un grupo
  // -------------------------------------------------------------------------

  private get group(): Set<number> {
    return this.selection.group;
  }

  /** (Tambien la cambian las pruebas de tests/visual/keys.mjs.) */
  private set group(v: Set<number>) {
    this.selection.group = v;
  }

  private get multi(): boolean {
    return this.selection.multi;
  }

  private set multi(v: boolean) {
    this.selection.multi = v;
  }

  /** [CAMBIO] Panel de lo elegido: con dos o mas unidades, en el mapa (o eligiendo que hacer con ellas). */
  private selectionVM(): SelectionVM | null {
    if (this.group.size < 2 || !['map', 'groupMenu', 'orderMenu', 'target'].includes(this.phase) || this.enemyPlaying) return null;
    const list = this.selection.pickedInOrder();
    if (list.length < 2) return null;
    return selectionPanel(this.textures, this.s, list, this.view.cursor);
  }

  /**
   * [CAMBIO] Teclas de orden con lo elegido (Q atacar, C capturar, G defender, X quitar): las tres
   * primeras piden luego la casilla (clic o Enter), como "A + clic" en los juegos de estrategia.
   */
  private orderKey(order: 'attack' | 'capture' | 'defend' | 'cancel'): void {
    const who = this.orderSubjects();
    if (!who) return showToast(t('groupNone'));
    if (order === 'cancel') {
      cancelCommand(this.s, who.units);
      showToast(t('orderCancelled'));
      if (this.phase === 'groupMenu') this.toMap();
      return this.refresh();
    }
    if (order === 'capture' && !who.units.some((u) => UNIT.cancapt[u.type])) return showToast(t('orderNoCapturer'));
    if (this.phase === 'groupMenu') this.phase = 'map';
    this.startOrder(order, who.units, who.from !== 'map');
  }

  /** [CAMBIO] Menu de grupo, al elegir varias con Mayusculas + recuadro. */
  private openGroupMenu(): void {
    this.multi = false;
    this.menuSel = 0;
    this.phase = 'groupMenu';
    this.refresh();
  }

  private acceptGroupMenu(): void {
    const k = this.menuItems[this.menuSel]?.id;
    const units = this.selection.groupUnits();
    if (k === 'move') {
      // Sigue elegido: el clic derecho (o Enter) en el destino lo mueve.
      showToast(`${units.length} ${t('groupSelected')}`);
      return this.toMap();
    }
    if (!k || k === 'cancel' || !actionById(k)) return this.toMap();
    void this.runAction(k as ActionId, null, { queue: false, single: false });
  }

  // -------------------------------------------------------------------------
  // [CAMBIO] Ordenes con destino (estilo RTS)
  // -------------------------------------------------------------------------

  /**
   * Empieza a dar una orden a estas unidades: ahora se elige la casilla en el mapa (fase 'target').
   * `single` = una unidad desde su menu (su movimiento de este turno, si lo hay, se mantiene).
   */
  private startOrder(kind: CommandKind, units: Unit[], single: boolean): void {
    if (!units.length) return this.toMap();
    this.ordering = { kind, uids: units.map((u) => u.uid), single };
    this.phase = 'target';
    showToast(t('orderPick'));
    this.refresh();
  }

  /**
   * Unidades a las que iria una orden dada ahora con un gesto en el mapa: la elegida (moviendo o en su
   * menu) o el grupo elegido (recuadro, «Elegir varias» o una escuadra). null si no hay ninguna.
   */
  private orderSubjects(): { units: Unit[]; from: 'move' | 'unitMenu' | 'map' } | null {
    if ((this.phase === 'move' || this.phase === 'unitMenu') && this.sel && this.sel.team === 0)
      return { units: [this.sel], from: this.phase };
    if ((this.phase === 'map' || this.phase === 'groupMenu') && this.group.size) {
      const units = this.selection.groupUnits();
      return units.length ? { units, from: 'map' } : null;
    }
    return null;
  }

  /**
   * [CAMBIO] Menu de ordenes en una casilla (sin pasar por el menu de la unidad): solo las que tienen
   * sentido ahi (commandChoices). false si no hay unidad ni grupo elegido: el gesto hace lo de siempre.
   */
  private openOrderMenu(at: Pos): boolean {
    const who = this.orderSubjects();
    if (!who || !inBounds(at.x, at.y)) return false;
    const ctx = this.actionCtx(at);
    const ids = ctx ? menuActions(ctx).map((a) => a.id) : [];
    if (!ids.length) return false;
    this.orderMenu = { at: { x: at.x, y: at.y }, uids: who.units.map((u) => u.uid), ids, from: who.from };
    this.multi = false;
    this.inspectUid = null;
    this.view.cursor = { x: at.x, y: at.y };
    this.menuSel = 0;
    this.phase = 'orderMenu';
    this.refresh();
    return true;
  }

  /** Accion elegida en el menu de la casilla. */
  private async acceptOrderMenu(): Promise<void> {
    const o = this.orderMenu;
    const id = this.menuItems[this.menuSel]?.id as ActionId | undefined;
    if (!o || !id || !o.ids.includes(id)) return this.back();
    const from = o.from;
    this.orderMenu = null;
    // Vuelve a la fase de la que salio el menu, que es donde la accion tiene sentido.
    if (from === 'move' && this.sel) this.selectUnit(this.sel);
    else if (from === 'unitMenu' && this.sel) this.phase = 'unitMenu';
    else this.phase = 'map';
    return this.runAction(id, o.at, { queue: false, single: from !== 'map' });
  }

  // -------------------------------------------------------------------------
  // [CAMBIO] Acciones sobre lo elegido (controls/actions.ts): clic derecho, menu de casilla y bandeja
  // -------------------------------------------------------------------------

  /** Contexto de las acciones en `at` (null: menu sin casilla) con lo elegido ahora. */
  private actionCtx(at: Pos | null): ActionCtx | null {
    const units = this.orderSubjects()?.units ?? this.selection.units();
    if (!units.length) return null;
    const e = at ? unitAt(this.s, at.x, at.y) : undefined;
    const enemyHere = !!e && e.team !== 0 && e.carrier === null && this.visibleToPlayer(e);
    const ctx: ActionCtx = { s: this.s, units, at: at ? { x: at.x, y: at.y } : null, enemyHere };
    if (at && this.phase === 'move' && this.sel && units.length === 1 && units[0]!.uid === this.sel.uid) {
      const it = this.intentAt(at);
      ctx.intent = it.kind;
      ctx.intentCapture = it.kind === 'move' && it.capture;
      ctx.farOk = it.kind === 'none' && !unitAt(this.s, at.x, at.y) && canWalk(this.s, at.x, at.y, Movement.of(this.sel.type));
    }
    return ctx;
  }

  /**
   * Cumplir una accion del registro. `queue` (Mayusculas + clic derecho): atacar, capturar o mover
   * quedan como orden (se cumplen al terminar el turno) sin mover nada ahora. `single`: viene del
   * menu de una unidad elegida (la orden respeta lo ya movido, ver placeOrder).
   */
  private async runAction(id: ActionId, at: Pos | null, opts: { queue: boolean; single?: boolean } = { queue: false }): Promise<void> {
    const units = this.orderSubjects()?.units ?? this.selection.units();
    if (!units.length) return;
    const one = this.phase === 'move' && this.sel && units.length === 1 ? this.sel : null;
    if (opts.queue && at && (id === 'attack' || id === 'capture' || id === 'move' || id === 'go')) {
      // Orden sin gastar el turno: atacar/capturar alli, o ir y quedarse (defender).
      const kind = id === 'attack' ? 'attack' : id === 'capture' ? 'capture' : 'defend';
      if (commandBlock(this.s, kind, at, units)) return;
      giveCommand(this.s, units, kind, at);
      showToast(`${commandLabel(kind)} · ${units.length}`);
      if (one) this.toMap();
      return this.refresh();
    }
    switch (id) {
      case 'attack':
      case 'capture':
      case 'merge':
      case 'load':
      case 'move':
        if (!at) return;
        if (one) {
          this.moveCursorTo(at, false);
          return this.commit(at, { drop: id === 'capture' });
        }
        if (id === 'move') {
          this.moveCursorTo(at, false);
          return this.groupMove(at);
        }
        // Grupo: atacar o capturar alli es una orden que empiezan ya las que pueden.
        this.ordering = { kind: id === 'attack' ? 'attack' : 'capture', uids: units.map((u) => u.uid), single: false };
        return this.placeOrder(at);
      case 'go':
        if (at && one) return this.giveOrder(one, at);
        return;
      case 'cmdAttack':
      case 'cmdCapture':
      case 'cmdDefend': {
        const kind = CMD_OF[id]!;
        const single = opts.single ?? !!one;
        if (!at) return this.startOrder(kind, units, single);
        this.ordering = { kind, uids: units.map((u) => u.uid), single };
        return this.placeOrder(at);
      }
      case 'cmdCancel':
        cancelCommand(this.s, units);
        showToast(t('orderCancelled'));
        break;
      case 'squadForm': {
        const q = formSquad(this.s, units);
        if (q) showToast(`${t('squadFormed')}: ${q.name}${q.key ? ` · ${t('squadKeyHint')} ${q.key}` : ''}`);
        break;
      }
      case 'squadLeave':
        for (const u of units) leaveSquad(this.s, u);
        pruneSquads(this.s);
        break;
      case 'squadRename': {
        const q = exactSquad(this.s, units);
        if (q !== null) ui.set({ rename: { id: q, name: squadById(this.s, q)?.name ?? '', max: SQUAD_NAME_MAX } });
        break;
      }
      case 'squadDisband': {
        const q = exactSquad(this.s, units);
        if (q !== null) disbandSquad(this.s, q);
        break;
      }
      default:
        break;
    }
    if (this.phase === 'groupMenu' || this.phase === 'orderMenu') this.toMap();
    this.refresh();
  }

  /** [CAMBIO] Puntero del raton segun lo que haria el clic derecho en esa casilla. */
  private updatePointer(tile: Pos | null): void {
    if (!tile || (this.phase !== 'map' && this.phase !== 'move')) return this.setPointer('default');
    const ctx = this.selection.units().length ? this.actionCtx(tile) : null;
    this.setPointer(ctx ? cursorFor(ctx) : 'default');
  }

  private pointerKind: CursorKind = 'default';
  private setPointer(kind: CursorKind): void {
    if (kind === this.pointerKind) return;
    this.pointerKind = kind;
    this.game.canvas.style.cursor = cursorCss(kind);
  }

  /** Casilla elegida para la orden: se da, y las que aun no se han movido la empiezan ya. */
  private async placeOrder(c: Pos): Promise<void> {
    const o = this.ordering;
    if (!o) return this.toMap();
    const units = o.uids.map((uid) => unitById(this.s, uid)).filter((u): u is Unit => !!u);
    const block = commandBlock(this.s, o.kind, c, units);
    if (block) return showToast(t(block === 'noBuilding' ? 'orderNoBuilding' : 'orderNoCapturer'));
    this.ordering = null;
    giveCommand(this.s, units, o.kind, c);
    // Una unidad movida este turno: lo movido cuenta y espera; la orden empieza el turno que viene.
    const sel = o.single ? units[0] : undefined;
    const moved = !!sel && !!this.undo && this.undo.uid === sel.uid && (this.undo.x !== sel.x || this.undo.y !== sel.y);
    if (sel && this.undo && this.undo.uid === sel.uid && !moved) {
      sel.canMove = true;
      sel.canFire = this.undo.canFire;
    }
    if (moved) wait(sel);
    this.clearUndo();
    // [CAMBIO] El grupo sigue elegido (como en los juegos de estrategia en tiempo real).
    this.toMap();
    showToast(t('orderGiven'));
    const now = units.filter((u) => u.active && u.canMove && u.carrier === null);
    if (now.length) await this.playCommands(now);
    else this.afterAction();
  }

  /** Las unidades empiezan ya su orden (animado); luego esperan. */
  private async playCommands(units: Unit[]): Promise<void> {
    const m = this.match;
    this.phase = 'busy';
    this.refresh();
    // [CAMBIO] En formacion: primero las mas retrasadas, y las demas se colocan con ellas.
    for (const u of commandOrder(this.s, units)) {
      for (const ev of commandNow(this.s, u.uid, Math.random)) {
        await this.playEvents([ev]);
        if (m !== this.match || this.checkEnd()) return;
      }
      if (unitById(this.s, u.uid)) wait(u);
    }
    pruneSquads(this.s);
    this.afterAction();
  }

  private async acceptAttack(c: Pos): Promise<void> {
    const u = this.sel;
    const targetUid = this.attackSet.get(key(c));
    if (!u || targetUid === undefined) return this.openUnitMenu();
    const target = unitById(this.s, targetUid)!;
    await this.playEvents([attackEvent(this.s, u, target, Math.random)]);
    this.afterAction();
  }

  private acceptUnloadPick(): void {
    if (this.menuSel === 0) return this.openUnitMenu();
    const u = this.sel;
    if (!u) return;
    const p = unitById(this.s, u.cargo[this.menuSel - 1] ?? null);
    if (!p) return;
    const tiles = unloadTiles(this.s, u, p);
    if (!tiles.length) return;
    this.passenger = p;
    this.unloadSet = new Set(tiles.map(key));
    this.phase = 'unloadTile';
    this.view.cursor = { ...tiles[0]! };
    this.refresh();
  }

  private acceptUnloadTile(c: Pos): void {
    if (!this.sel || !this.passenger) return;
    if (!this.unloadSet.has(key(c))) {
      this.phase = 'unloadPick';
      return this.refresh();
    }
    if (unload(this.s, this.sel, this.passenger, c)) {
      this.clearUndo();
      this.afterAction();
    }
  }

  private acceptBuy(): void {
    if (this.menuSel === 0 || !this.selBuilding) return this.toMap();
    const opt = this.buy[this.menuSel - 1];
    if (!opt) return;
    if (opt.blocked) return showToast(buyBlockedText(opt.blocked));
    const b = this.selBuilding;
    const u = spawn(this.s, b, opt.type);
    if (u) void this.playEvents([{ kind: 'spawn', uid: u.uid, at: { x: b.x, y: b.y } }]).then(() => this.afterAction());
  }

  private afterAction(): void {
    if (this.checkEnd()) return;
    this.toMap();
    // Opcion: el cursor salta a la siguiente unidad sin mover.
    if (settings.autoNext && this.idleUnits().length) this.nextIdle();
  }

  private checkEnd(): boolean {
    if (this.lab) return false;
    const result = outcome(this.s);
    if (result === 'playing') return false;
    void this.endScreen.finish(result === 'won', endReason(this.s));
    return true;
  }

  /** Rendirse: la partida termina como derrota. */
  private surrender(): void {
    this.toMap();
    void this.endScreen.finish(false, 'surrender');
  }

  /** Ultima casilla con un combate o una captura (para enfocar el final). */
  private lastAt: Pos | null = null;
  private surrenderArmedAt = -1e9;

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

  // -------------------------------------------------------------------------
  // Turno de la IA y animaciones (game/turns.ts, game/playback.ts)
  // -------------------------------------------------------------------------

  /** [CAMBIO] Puntos de control para dibujar: disputado solo si se ven unidades de los dos bandos dentro. */
  private controlPointsView(): ViewOptions['controlPoints'] {
    return this.s.controlPoints?.map((c) => {
      const inside = this.s.units.filter((u) => u.carrier === null && inControlZone(c, u) && (u.team === 0 || this.visibleToPlayer(u)));
      return { ...c, r: RULES.controlRadius, contested: inside.some((u) => u.team === 0) && inside.some((u) => u.team === 1) };
    });
  }

  private wait(ms: number): Promise<void> {
    return this.player.wait(ms);
  }

  private visibleToPlayer(p: Pos): boolean {
    return !!this.vis[p.x]?.[p.y];
  }

  /** Anima eventos (movimiento, ataque...) y vuelve a dibujar al terminar. */
  private playEvents(events: GameEvent[], ghostKey?: string | null): Promise<void> {
    return this.player.play(events, ghostKey);
  }

  /** Cada evento, antes de animarlo. */
  private noteEvent(ev: GameEvent): void {
    // Lo que tiene consecuencias (combates, capturas, compras...) ya no se puede deshacer con Ctrl+Z.
    if (!this.enemyPlaying && ev.kind !== 'move') this.clearUndo();
    if (!this.replaying) recordEvent(this.s, ev, this.enemyPlaying ? 1 : 0);
    if (!this.replaying && !this.enemyPlaying) this.tutorial.record(ev);
    if (ev.kind === 'attack') this.lastAt = { ...ev.target };
    else if (ev.kind === 'capture') this.lastAt = { ...ev.at };
  }

  private get enemyPlaying(): boolean {
    return this.turns.enemyPlaying;
  }

  private get replaying(): boolean {
    return this.turns.replaying;
  }

  // -------------------------------------------------------------------------
  // Lo que cada modulo de game/ ve de la escena
  // -------------------------------------------------------------------------

  private playbackHost(): PlaybackHost {
    return live<PlaybackHost>({
      scene: { get: () => this },
      view: { get: () => this.view },
      state: { get: () => this.s },
      phase: {
        get: () => this.phase,
        set: (v) => {
          this.phase = v;
        },
      },
      fastForward: {
        get: () => this.fastForward,
        set: (v) => {
          this.fastForward = v;
        },
      },
      enemyPlaying: { get: () => this.enemyPlaying },
      replaying: { get: () => this.replaying },
      hidden: { get: () => this.hidden },
      visible: (p) => this.visibleToPlayer(p),
      refresh: () => this.refresh(),
      refreshHud: () => this.refreshHud(),
      noteEvent: (ev) => this.noteEvent(ev),
    });
  }

  private turnHost(): TurnHost {
    return live<TurnHost>({
      scene: { get: () => this },
      view: { get: () => this.view },
      state: {
        get: () => this.s,
        set: (v) => {
          this.s = v;
        },
      },
      phase: {
        get: () => this.phase,
        set: (v) => {
          this.phase = v;
        },
      },
      match: { get: () => this.match },
      ended: { get: () => this.ended },
      lab: { get: () => !!this.lab },
      fastForward: {
        get: () => this.fastForward,
        set: (v) => {
          this.fastForward = v;
        },
      },
      inputLockUntil: {
        get: () => this.inputLockUntil,
        set: (v) => {
          this.inputLockUntil = v;
        },
      },
      play: (events) => this.playEvents(events),
      wait: (ms) => this.wait(ms),
      checkEnd: () => this.checkEnd(),
      clearUndo: () => this.clearUndo(),
      abandonSelection: () => this.abandonSelection(),
      toMap: () => this.toMap(),
      refresh: () => this.refresh(),
      refreshHud: () => this.refreshHud(),
      visible: (p) => this.visibleToPlayer(p),
      idleUnits: () => this.idleUnits(),
      markSaved: () => {
        this.savedThisGame = true;
      },
    });
  }

  private endHost(): EndHost {
    return live<EndHost>({
      scene: { get: () => this },
      view: { get: () => this.view },
      state: { get: () => this.s },
      match: { get: () => this.match },
      ended: { get: () => this.ended },
      lastAt: { get: () => this.lastAt },
      closeMatch: () => this.closeMatch(),
      refresh: () => this.refresh(),
      wait: (ms) => this.wait(ms),
    });
  }

  private abilityHost(): AbilityHost {
    return live<AbilityHost>({
      state: { get: () => this.s },
      phase: {
        get: () => this.phase,
        set: (v) => {
          this.phase = v;
        },
      },
      abandonSelection: () => this.abandonSelection(),
      toMap: () => this.toMap(),
      refresh: () => this.refresh(),
      play: (events) => this.playEvents(events),
    });
  }

  private labHost(): LabHost {
    return live<LabHost>({
      scene: { get: () => this },
      view: { get: () => this.view },
      state: { get: () => this.s },
      refresh: () => this.refresh(),
      play: (events) => this.playEvents(events),
    });
  }

  private selectionHost(): SelectionHost {
    return live<SelectionHost>({
      scene: { get: () => this },
      view: { get: () => this.view },
      state: { get: () => this.s },
      phase: { get: () => this.phase },
      sel: { get: () => this.sel },
      toMap: () => this.toMap(),
      selectUnit: (u) => this.selectUnit(u),
      stopInspect: () => {
        this.inspectUid = null;
      },
      refresh: () => this.refresh(),
      cursorMoved: () => this.cursorMoved(),
    });
  }

  private carryHost(): CarryHost {
    return live<CarryHost>({
      scene: { get: () => this },
      view: { get: () => this.view },
      state: { get: () => this.s },
      phase: { get: () => this.phase },
      sel: { get: () => this.sel },
      hidden: { get: () => this.hidden },
      toMap: () => this.toMap(),
      selectUnit: (u) => this.selectUnit(u),
      updateTrail: (t) => this.updateTrail(t),
      intentAt: (t) => this.intentAt(t),
      refresh: () => this.refresh(),
      giveOrder: (u, goal) => this.giveOrder(u, goal),
      commit: (t, opts) => this.commit(t, opts),
    });
  }

  private pointerHost(): PointerHost {
    return live<PointerHost>({
      scene: { get: () => this },
      view: { get: () => this.view },
      state: { get: () => this.s },
      phase: { get: () => this.phase },
      ended: { get: () => this.ended },
      sel: { get: () => this.sel },
      inputLockUntil: { get: () => this.inputLockUntil },
      lastCommit: { get: () => this.lastCommit },
      inspectUid: {
        get: () => this.inspectUid,
        set: (v) => {
          this.inspectUid = v;
        },
      },
      selection: { get: () => this.selection },
      carry: { get: () => this.carry },
      skipAnimations: () => {
        this.fastForward = true;
      },
      visible: (p) => this.visibleToPlayer(p),
      intentAt: (t) => this.intentAt(t),
      actionCtx: (at) => this.actionCtx(at),
      runAction: (id, at, opts) => this.runAction(id, at, opts),
      openOrderMenu: (at) => this.openOrderMenu(at),
      inspect: (u) => this.inspect(u),
      accept: () => this.accept(),
      back: () => this.back(),
      toMap: () => this.toMap(),
      refresh: () => this.refresh(),
      refreshHud: () => this.refreshHud(),
      cursorMoved: () => this.cursorMoved(),
      moveCursorTo: (p, follow) => this.moveCursorTo(p, follow),
      setPointer: (kind) => this.setPointer(kind),
      updatePointer: (tile) => this.updatePointer(tile),
      commit: (t, opts) => this.commit(t, opts),
      waitSelected: () => this.waitSelected(),
      groupMove: (goal) => this.groupMove(goal),
      selectUnit: (u) => this.selectUnit(u),
      acceptMap: (c) => this.acceptMap(c),
    });
  }
}
