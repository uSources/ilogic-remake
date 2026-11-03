import Phaser from 'phaser';
import { effectiveCommand, renameSquad } from '../core/squads';
import { HQ, MAP_H, MAP_W, DEFAULT_RULES, RULES, UNIT, useRules, UNIT_NAMES } from '../core/data';
import { grid, samePos, seededRng } from '../core/geom';
import { generateGame } from '../core/mapgen';
import {
  buildingIncome,
  commandUsed,
  inControlZone,
  capturePointsOf,
  captureProgress,
  outcome,
  endReason,
  upkeepOf,
  threatMap,
  unitAt,
  unitById,
  visibility,
  type BuyOption,
} from '../core/rules';
import { deserialize, serialize } from '../core/save';
import { recordEvent, sampleArmy } from '../core/stats';
import type { Building, GameEvent, GameSetup, GameState, Pos, Unit } from '../core/types';
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
import { CLOSES_HELP, type GameCommand } from '../controls/commands';
import type { ControlContext, MenuCommand } from '../controls/menu';
import { squadsVM, minimapVM, tileVM, weatherVM, dayInfoVM, economyVM, generalVM } from '../ui/hudModels';
import { defaultLab, labState, type LabAction, type LabOptions } from '../lab';
import { newGeneral } from '../core/generals';
import { GAME_MENU, MENU_PHASES, type ActionKey, type GameStartData, type Intent, type Phase } from './game/types';
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
import { Orders, type OrderHost, type OrderMenu, type Ordering } from './game/orders';
import { UnitMoves, type MoveHost } from './game/unitMoves';
import { acceptMapTile, captureNow, GameMenuChoices, PHASES, type GameMenuHost, type PhaseHost } from './game/phases';

/** Sin casillas marcadas (sin unidad elegida). */
const NO_TILES: ReadonlyMap<string, number> = new Map();

export type { GameStartData } from './game/types';

export class GameScene extends Phaser.Scene {
  private s!: GameState;
  private view!: MapView;
  /** Lluvia, nieve... sobre el mapa. */
  private weatherFx: WeatherFx | null = null;
  private phase: Phase = 'map';
  /** Laboratorio de animaciones (null en una partida normal). */
  private lab: LabOptions | null = null;
  /** [CAMBIO] Acciones y ordenes sobre lo elegido, puntero del raton (game/orders.ts). */
  private orders = new Orders(this.orderHost());
  private vis: boolean[][] = [];
  private hidden = new Set<number>();

  // Seleccion
  /** La unidad elegida y como moverla (game/unitMoves.ts, game/moveSession.ts). */
  private moves = new UnitMoves(this.moveHost());
  /** La unidad elegida para moverla (o en su menu). */
  private get sel(): Unit | null {
    return this.moves.selected;
  }
  private menuSel = 0;
  private menuItems: MenuItemVM[] = [];
  /** Opciones del menu de la unidad, ya ordenadas. */
  private unitOptions: ActionKey[] = [];
  /** Fabrica de la compra y lo que se puede comprar en ella. */
  private buyAt: Building | null = null;
  private buyOptions: BuyOption[] = [];
  /** Lo que hace cada opcion del menu de pausa (game/phases/gameMenu.ts). */
  private gameMenu = new GameMenuChoices(this.gameMenuHost());
  /** Lo que ven las fases del turno del jugador (game/phases). */
  private phaseHost = this.makePhaseHost();
  /** Unidad cogida para arrastrar y soltar (game/carry.ts). */
  private carry = new Carry(this.carryHost());
  /** [CAMBIO] Lo elegido: grupo, «Elegir varias», escuadras y teclas de grupo (game/groupSelection.ts). */
  private selection = new GroupSelection(this.selectionHost());

  // Partida
  private fromSave = false;
  private savedThisGame = false;
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
    const session = this.moves.session;
    const h = computeHighlights({
      s: this.s,
      phase: this.phase,
      cursor: this.view.cursor,
      range: session?.range ?? null,
      merge: session?.merge ?? NO_TILES,
      load: session?.load ?? NO_TILES,
      attack: session?.attackTargets ?? NO_TILES,
      unload: session?.unloadTiles ?? new Set(),
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
    const session = this.moves.session;
    if (this.phase !== 'move' || !session?.range) return undefined;
    const it = this.intentAt(this.view.cursor);
    const dest = it.kind === 'move' ? it.to : it.kind === 'attack' ? it.from : null;
    // Sin destino valido (fuera del alcance, agua...): se sigue viendo el camino trazado hasta donde llega.
    if (!dest) return session.trail.length > 1 ? session.trail : undefined;
    if (samePos(dest, session.unit)) return undefined;
    return this.moves.trailTo(dest);
  }

  private refresh(): void {
    // [CAMBIO] Puntero del raton segun lo que haria el clic derecho donde esta el cursor.
    if (this.gestures.inside) this.orders.updatePointer(this.phase === 'busy' ? null : this.view.cursor);
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
      attackZone: this.phase === 'move' ? (this.moves.session?.attackZone ?? null) : null,
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
      danger: this.phase === 'move' ? (this.moves.session?.danger ?? null) : null,
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
      this.moves.followCursor(this.view.cursor);
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
      attackSet: this.moves.session?.attackTargets ?? NO_TILES,
      anchor: (p) => this.anchor('forecast', p),
    });
  }

  /** Bocadillo junto al cursor al mover (ver moveTipFor). */
  private moveTip(c: Pos): MoveTipVM | null {
    return moveTipFor(this.s, {
      sel: this.sel,
      range: this.moves.session?.range ?? null,
      c,
      intentAt: (p) => this.intentAt(p),
      trailTo: (d) => this.moves.trailTo(d),
      danger: this.moves.session?.danger ?? null,
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
      actions: this.unitOptions,
      building: this.buyAt,
      buy: this.buyOptions,
      groupUnits: () => this.selection.groupUnits(),
      groupCtx: () => this.orders.ctx(null),
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
        if (this.phase === 'move') return void this.moves.commit(this.view.cursor, { wait: cmd.wait });
        return this.accept();
      case 'stepBack':
        // Al trazar un camino, quitar la ultima casilla.
        if (this.phase === 'move') {
          const trailEnd = this.moves.session?.stepBack();
          if (trailEnd) {
            this.view.cursor = { ...trailEnd };
            this.view.ensureVisible(this.view.cursor, 3);
            return this.refresh();
          }
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
        // [CAMBIO] Con varias elegidas, Tab va pasando por ellas (panel de lo elegido); si no, la siguiente sin mover.
        if (this.phase === 'map' && this.group.size > 1) return this.selection.nextPicked();
        if (this.phase === 'map') this.nextIdle();
        return;
      case 'order':
        return this.orders.orderKey(cmd.order);
      case 'group':
        // [CAMBIO] 1-9 elige el grupo (dos veces: la camara va alli); Ctrl lo hace; Mayusculas añade.
        return this.selection.groupKey(cmd.n, cmd.mode);
      case 'orderHere':
        // [CAMBIO] F: menu de ordenes en la casilla del cursor, con la unidad o el grupo elegido.
        if (!this.orders.openMenu(this.view.cursor) && (this.phase === 'map' || this.phase === 'move')) showToast(t('orderHereNone'));
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

  /** Aceptar en la fase actual (ver game/phases). */
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

  private toMap(): void {
    this.phase = 'map';
    this.abilities.targeting = null;
    this.ordering = null;
    this.orderMenu = null;
    this.inspectUid = null;
    this.moves.deselect();
    this.buyAt = null;
    this.refresh();
  }

  /** Si hay una unidad movida a medio decidir, deshacer su movimiento antes de salir. */
  private abandonSelection(): void {
    if (
      (this.phase === 'unitMenu' || this.phase === 'attack' || this.phase === 'unloadPick' || this.phase === 'unloadTile') &&
      this.moves.session?.undo
    ) {
      this.moves.undoMove();
    }
    if (this.phase !== 'map') this.toMap();
  }

  private openGameMenu(): void {
    this.enterPhase('gameMenu');
  }

  private openUnitMenu(): void {
    this.enterPhase('unitMenu');
  }

  /** Muestra el alcance de una unidad (enemiga, o propia ya usada). */
  private inspect(u: Unit): void {
    this.inspectUid = u.uid;
    this.refresh();
  }

  private selectUnit(u: Unit): void {
    this.moves.select(u);
  }

  /** Que pasaria al soltar (o pulsar) la unidad elegida en una casilla. */
  private intentAt(t: Pos): Intent {
    return this.moves.intentAt(t);
  }

  private waitSelected(): void {
    this.moves.waitSelected();
  }

  private clearUndo(): void {
    this.moves.clearUndo();
  }

  /** Pantalla de opciones (la misma que en el menu principal), encima del menu de pausa. */
  private optionsPanel!: OptionsPanel;

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

  /** [CAMBIO] Menu de grupo, al elegir varias con Mayusculas + recuadro (tambien lo abre tests/visual/keys.mjs). */
  private openGroupMenu(): void {
    this.enterPhase('groupMenu');
  }

  // -------------------------------------------------------------------------
  // [CAMBIO] Ordenes con destino y acciones del registro (game/orders.ts)
  // -------------------------------------------------------------------------

  /** Orden con destino que se esta dando (fase 'target', eligiendo casilla). */
  private get ordering(): Ordering | null {
    return this.orders.ordering;
  }

  private set ordering(v: Ordering | null) {
    this.orders.ordering = v;
  }

  /**
   * Menu de ordenes en una casilla (fase 'orderMenu'): clic derecho, pulsacion larga o F en el
   * destino con una unidad o un grupo elegido. `from`: de donde se venia (adonde vuelve al cancelar).
   */
  private get orderMenu(): OrderMenu | null {
    return this.orders.menu;
  }

  private set orderMenu(v: OrderMenu | null) {
    this.orders.menu = v;
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
      updateTrail: (t) => this.moves.followCursor(t),
      intentAt: (t) => this.intentAt(t),
      refresh: () => this.refresh(),
      giveOrder: (u, goal) => this.moves.giveOrder(u, goal),
      commit: (t, opts) => this.moves.commit(t, opts),
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
      lastCommit: { get: () => this.moves.lastCommit },
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
      actionCtx: (at) => this.orders.ctx(at),
      runAction: (id, at, opts) => this.orders.run(id, at, opts),
      openOrderMenu: (at) => this.orders.openMenu(at),
      inspect: (u) => this.inspect(u),
      accept: () => this.accept(),
      back: () => this.back(),
      toMap: () => this.toMap(),
      refresh: () => this.refresh(),
      refreshHud: () => this.refreshHud(),
      cursorMoved: () => this.cursorMoved(),
      moveCursorTo: (p, follow) => this.moveCursorTo(p, follow),
      setPointer: (kind) => this.orders.setPointer(kind),
      updatePointer: (tile) => this.orders.updatePointer(tile),
      commit: (t, opts) => this.moves.commit(t, opts),
      waitSelected: () => this.waitSelected(),
      groupMove: (goal) => this.moves.groupMove(goal),
      selectUnit: (u) => this.selectUnit(u),
      acceptMap: (c) => acceptMapTile(this.phaseHost, c),
    });
  }

  private moveHost(): MoveHost {
    return live<MoveHost>({
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
      ended: { get: () => this.ended },
      selection: { get: () => this.selection },
      visible: (p) => this.visibleToPlayer(p),
      play: (events, ghostKey) => this.playEvents(events, ghostKey),
      toMap: () => this.toMap(),
      refresh: () => this.refresh(),
      afterAction: () => this.afterAction(),
      openUnitMenu: () => this.openUnitMenu(),
      captureNow: () => captureNow(this.phaseHost),
    });
  }

  private makePhaseHost(): PhaseHost {
    return live<PhaseHost>({
      state: { get: () => this.s },
      view: { get: () => this.view },
      phase: {
        get: () => this.phase,
        set: (v) => {
          this.phase = v;
        },
      },
      menuSel: {
        get: () => this.menuSel,
        set: (v) => {
          this.menuSel = v;
        },
      },
      menuItems: { get: () => this.menuItems },
      inspectUid: {
        get: () => this.inspectUid,
        set: (v) => {
          this.inspectUid = v;
        },
      },
      unitOptions: {
        get: () => this.unitOptions,
        set: (v) => {
          this.unitOptions = v;
        },
      },
      deleteArmed: {
        get: () => this.deleteArmed,
        set: (v) => {
          this.deleteArmed = v;
        },
      },
      buyAt: {
        get: () => this.buyAt,
        set: (v) => {
          this.buyAt = v;
        },
      },
      buyOptions: {
        get: () => this.buyOptions,
        set: (v) => {
          this.buyOptions = v;
        },
      },
      moves: { get: () => this.moves },
      selection: { get: () => this.selection },
      orders: { get: () => this.orders },
      abilities: { get: () => this.abilities },
      gameMenu: { get: () => this.gameMenu },
      enter: (phase) => this.enterPhase(phase),
      toMap: () => this.toMap(),
      refresh: () => this.refresh(),
      afterAction: () => this.afterAction(),
      abandonSelection: () => this.abandonSelection(),
      inspect: (u) => this.inspect(u),
      visible: (p) => this.visibleToPlayer(p),
      play: (events) => this.playEvents(events),
    });
  }

  private gameMenuHost(): GameMenuHost {
    return live<GameMenuHost>({
      now: { get: () => this.time.now },
      canReplay: { get: () => this.turns.canReplay },
      toMap: () => this.toMap(),
      openOptions: () => this.optionsPanel.open(),
      showHelp: () => ui.set({ help: true }),
      saveGame: () => {
        if (!writeSave(serialize(this.s))) return false;
        this.savedThisGame = true;
        return true;
      },
      endTurn: () => void this.turns.enemyTurn(),
      replayEnemyTurn: () => void this.turns.replayEnemyTurn(),
      surrender: () => this.surrender(),
      quitToMenu: () => this.quitToMenu(),
    });
  }

  private orderHost(): OrderHost {
    return live<OrderHost>({
      scene: { get: () => this },
      view: { get: () => this.view },
      state: { get: () => this.s },
      phase: {
        get: () => this.phase,
        set: (v) => {
          this.phase = v;
        },
      },
      menuSel: {
        get: () => this.menuSel,
        set: (v) => {
          this.menuSel = v;
        },
      },
      match: { get: () => this.match },
      sel: { get: () => this.sel },
      undo: { get: () => this.moves.session?.undo ?? null },
      selection: { get: () => this.selection },
      menuPick: () => this.menuItems[this.menuSel]?.id,
      stopInspect: () => {
        this.inspectUid = null;
      },
      visible: (p) => this.visibleToPlayer(p),
      intentAt: (t) => this.intentAt(t),
      toMap: () => this.toMap(),
      back: () => this.back(),
      refresh: () => this.refresh(),
      selectUnit: (u) => this.selectUnit(u),
      moveCursorTo: (p, follow) => this.moveCursorTo(p, follow),
      commit: (t, opts) => this.moves.commit(t, opts),
      groupMove: (goal) => this.moves.groupMove(goal),
      giveOrder: (u, goal) => this.moves.giveOrder(u, goal),
      clearUndo: () => this.clearUndo(),
      afterAction: () => this.afterAction(),
      checkEnd: () => this.checkEnd(),
      play: (events) => this.playEvents(events),
    });
  }
}
