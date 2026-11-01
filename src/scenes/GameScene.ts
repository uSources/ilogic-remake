import Phaser from 'phaser';
import { aiTurn, assistTurn, assistUnit } from '../core/ai';
import {
  HQ,
  MAP_H,
  MAP_W,
  DEFAULT_RULES,
  RULES,
  UNIT,
  UNIT_ART,
  WEATHER,
  useRules,
  type RulesConfig,
  Movement,
  UNIT_NAMES,
  MoveType,
} from '../core/data';
import { grid, inBounds, manhattan, samePos, seededRng } from '../core/geom';
import { generateGame } from '../core/mapgen';
import { bestAttackTile, closestStep, extendTrail } from '../core/orders';
import {
  attackEvent,
  buildingIncome,
  commandUsed,
  attackTargets,
  buildingAt,
  buyOptions,
  canBuyAt,
  canCapture,
  canWalk,
  pathCost,
  passMap,
  stepToward,
  capture,
  capturePointsOf,
  captureProgress,
  endRound,
  load,
  loadTargets,
  merge,
  mergeTargets,
  moveRange,
  moveUnit,
  outcome,
  endReason,
  score,
  pathTo,
  removeUnit,
  type RoundReport,
  spawn,
  supply,
  upkeepOf,
  threatMap,
  unitThreat,
  attackZone,
  captureEvent,
  defenseStars,
  moveEvent,
  reachableTiles,
  unitActions,
  unitAt,
  unitById,
  unload,
  unloadTiles,
  visibility,
  wait,
  type BuyOption,
  type MoveRange,
  type UnitActions,
} from '../core/rules';
import { deserialize, serialize } from '../core/save';
import { recordEvent, sampleArmy, stats } from '../core/stats';
import type { AutoMission, Building, GameEvent, GameSetup, GameState, Pos, Unit } from '../core/types';
import { randomSeed, seedToCode } from '../setup';
import { bestDays, markCompleted, objectiveStatus, objectiveText, TUTORIAL } from '../campaign';
import { buildMission, missionById, missionRules, MISSIONS } from '../core/missions';
import { ensureWeather } from '../core/weather';
import {
  resetActions,
  showBanner,
  showReport,
  showToast,
  ui,
  type ReportLineVM,
  type ForecastVM,
  type IdleVM,
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
import { buildingLabel, fmtNum, settings, t, unitLabel, weatherLabel, type TextKey } from '../settings';
import { deleteSave, readSave, writeSave } from '../storage';
import { MapView, type HighlightKind } from '../ui/mapView';
import { WeatherFx } from '../ui/weatherFx';
import { blink, burst, center, COLORS, floatText, lifeBar, reducedMotion, targetMark, tileFlash } from '../ui/fx';
import { unitIconKey, unitKey } from '../ui/sprites';
import { terrainPalette } from '../ui/terrainColors';
import { mapTap, moveTap } from '../ui/touch';
import { PointerGestures, type PointerIn, type PointerTarget } from '../controls/pointer';
import { CLOSES_HELP, type GameCommand } from '../controls/commands';
import { keyCommand } from '../controls/keyboard';
import {
  abilitiesVM,
  buyBlockedText,
  captureHintText,
  combatVM,
  forecastVM,
  minimapVM,
  tileVM,
  unitStatsText,
  weatherEffectsText,
  weatherVM,
  dayInfoVM,
  economyVM,
  generalVM,
} from '../ui/hudModels';
import {
  debris,
  facingToward,
  hitFlash,
  impact,
  muzzleFlash,
  popNumber,
  projectile,
  recoil,
  shotKind,
  tag,
  type ShotKind,
} from '../ui/combatFx';
import { baseFacing, faceFlip } from '../ui/mapView';
import { defaultLab, LAB_TARGET, labRange, labState, type LabAction, type LabOptions } from '../lab';
import { abilityArea, abilityBlock, areaTiles, generalOf, newGeneral, useAbility } from '../core/generals';
import { PAL, PAL_CSS } from '../ui/palette';

/**
 * Fases de la partida (equivalen a las del original, docs/SPEC-INTERFAZ.md §2):
 * map 3, gameMenu 4, unitMenu 5, buy 6, move 7, attack 8, unloadPick 11, unloadTile 12.
 * "busy" = animando o jugando la IA (no se acepta entrada).
 */
type Phase = 'map' | 'gameMenu' | 'unitMenu' | 'groupMenu' | 'buy' | 'move' | 'attack' | 'unloadPick' | 'unloadTile' | 'target' | 'busy';

type ActionKey = keyof UnitActions;
const ACTION_ORDER: ActionKey[] = ['attack', 'capture', 'unload', 'supply', 'wait', 'auto', 'autoDefend', 'manual', 'back', 'delete'];
type GameMenuKey = 'endTurn' | 'save' | 'replay' | 'options' | 'help' | 'surrender' | 'quit' | 'resume';
const GAME_MENU: GameMenuKey[] = ['resume', 'endTurn', 'save', 'replay', 'options', 'help', 'surrender', 'quit'];
/** [CAMBIO] Menu de grupo (Mayusculas + recuadro): mover o dar a todas la misma mision. */
type GroupMenuKey = 'move' | 'auto' | 'autoDefend' | 'manual' | 'cancel';
const GROUP_MENU: GroupMenuKey[] = ['move', 'auto', 'autoDefend', 'manual', 'cancel'];
/** [CAMBIO] Mision de "Auto": la infanteria (lo que captura) captura; el resto ataca. */
const defaultMission = (type: number): AutoMission => (UNIT.cancapt[type] ? 'capture' : 'attack');
/** Aviso al dar una mision a una unidad. */
const missionToast = (m: AutoMission): string => t(m === 'capture' ? 'autoOnCapture' : m === 'defend' ? 'autoOnDefend' : 'autoOnAttack');
type EndButton = 'rematch' | 'new' | 'menu' | 'next' | 'retry';
const END_LABEL: Record<EndButton, TextKey> = {
  rematch: 'endRematch',
  new: 'newGame',
  menu: 'endMenu',
  next: 'endNext',
  retry: 'endRetry',
};

/** Filtro CSS del lienzo del juego (gris al perder). */
function setEndFilter(f: string | null): void {
  const el = document.getElementById('game');
  if (!el) return;
  el.style.transition = f ? 'filter 1.2s steps(6)' : '';
  el.style.filter = f ?? '';
}

/** Que pasaria al soltar la unidad elegida en una casilla. */
type Intent =
  | { kind: 'none' }
  | { kind: 'stay' }
  | { kind: 'move'; to: Pos; capture: boolean }
  | { kind: 'attack'; from: Pos; target: Unit }
  | { kind: 'merge'; target: Unit }
  | { kind: 'load'; target: Unit };

interface MoveUndo {
  uid: number;
  x: number;
  y: number;
  canFire: boolean;
}

const key = (p: Pos) => `${p.x},${p.y}`;
const CURSOR_PHASES: Phase[] = ['map', 'move', 'attack', 'unloadTile', 'target'];
const MENU_PHASES: Phase[] = ['gameMenu', 'unitMenu', 'groupMenu', 'buy', 'unloadPick'];
const STEP_MS = 70;
/** Tiempo sin aceptar Enter/clic al volver el turno al jugador. */
const INPUT_LOCK_MS = 350;
/** Ventana para confirmar acciones pulsando dos veces (terminar turno, salir, rendirse). */
const CONFIRM_MS = 2500;

/** Como empieza una partida (scene.start('Game', data)). */
export interface GameStartData {
  /** new: mapa al azar o con `setup`; load: la guardada; mission: `mission`; state: `state` (JSON de una partida). */
  mode?: 'new' | 'load' | 'mission' | 'state' | 'lab';
  /** Laboratorio de animaciones (src/lab.ts). */
  lab?: LabOptions;
  rules?: Partial<RulesConfig>;
  setup?: GameSetup;
  mission?: string;
  state?: string;
  /** Partida nueva: general del jugador y de la IA (id de generals.json). */
  general?: string | null;
  enemyGeneral?: string | null;
}

export class GameScene extends Phaser.Scene {
  private s!: GameState;
  private view!: MapView;
  /** Lluvia, nieve... sobre el mapa. */
  private weatherFx: WeatherFx | null = null;
  private phase: Phase = 'map';
  /** Laboratorio de animaciones (null en una partida normal). */
  private lab: LabOptions | null = null;
  /** Habilidad del general que se esta apuntando (fase 'target'). */
  private targeting: string | null = null;
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
  /** Unidad cogida para arrastrar y soltar. */
  private carry: {
    uid: number;
    ghost: Phaser.GameObjects.Image;
    shadow: Phaser.GameObjects.Rectangle;
    touch: boolean;
    /** Cogida a proposito (raton, o dedo mantenido): soltar lejos da una orden de varios turnos. */
    held: boolean;
  } | null = null;
  /** Casillas que el enemigo visible puede atacar el turno siguiente (al mover) y alcance de ataque de la elegida. */
  private dangerMap: boolean[][] | null = null;
  private attackZone: boolean[][] | null = null;
  /** Estados anteriores para deshacer movimientos sin consecuencias (Ctrl+Z). */
  private undoStack: string[] = [];
  /** Seleccion en grupo (Mayusculas + arrastrar). */
  private group = new Set<number>();
  /** Ultimo movimiento confirmado (para el doble clic: mover y esperar). */
  private lastCommit: { at: Pos; time: number } | null = null;

  // Partida
  private fromSave = false;
  private savedThisGame = false;
  private quitArmedAt = -1e9;
  private endArmedAt = -1e9;
  private corruptSave = false;
  /** Ignorar Enter/clic hasta este instante (tras el turno enemigo). */
  private inputLockUntil = 0;
  private deleteArmed = false;
  private fastForward = false;
  private ended = false;
  private enemyPlaying = false;
  /** Zona de amenaza enemiga visible (tecla T). */
  private threat = false;
  /** Unidad cuyo alcance se esta mostrando (Enter o clic derecho sobre ella). */
  private inspectUid: number | null = null;
  private lastScroll = { x: NaN, y: NaN, zoom: NaN };

  // Raton y dedos (src/controls/pointer.ts)
  private gestures = new PointerGestures(this.pointerTarget());

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
    this.carry = null;
    this.dangerMap = null;
    this.attackZone = null;
    this.undoStack = [];
    this.group = new Set();
    this.lastCommit = null;
    this.fromSave = false;
    this.savedThisGame = false;
    this.quitArmedAt = -1e9;
    this.endArmedAt = -1e9;
    this.surrenderArmedAt = -1e9;
    this.corruptSave = false;
    this.inputLockUntil = 0;
    this.deleteArmed = false;
    this.fastForward = false;
    this.ended = false;
    this.enemyPlaying = false;
    this.inspectUid = null;
    this.lastScroll = { x: NaN, y: NaN, zoom: NaN };
    this.gestures.reset();
    this.tutorialStep = 0;
    this.tutorialEvents = [];
    this.tutorialOwned = 0;
    this.lastAt = null;
    this.anchorAt = {};
    this.endButtons = [];
    this.endSel = 0;
    this.endFx = null;
    this.lastEnemy = null;
    this.replaying = false;
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

    this.setupInput();
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
    ui.set({ screen: 'game', toast: null, banner: null, combat: null, threat: this.threat, options: null });
    this.refresh();
    if (this.lab) this.startLab(this.lab);
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
        if (ready()) this.requestEndTurn();
      },
      labPlay: (action: LabAction) => {
        if (this.lab && this.phase !== 'busy') this.restartLab({ ...this.lab, play: action });
      },
      labSet: (patch: Partial<LabOptions>) => {
        if (this.lab && this.phase !== 'busy') this.restartLab({ ...this.lab, ...patch, play: null });
      },
      labExit: () => {
        this.scene.start('Menu');
      },
      useAbility: (id: string) => {
        if (ready() && (this.phase === 'map' || this.phase === 'target')) void this.startAbility(id);
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

  private idleUnits(): Unit[] {
    // Las de automatico no cuentan: se moveran solas al terminar el turno.
    return this.s.units.filter((u) => u.team === 0 && u.active && u.carrier === null && !u.auto);
  }

  // -------------------------------------------------------------------------
  // Dibujado
  // -------------------------------------------------------------------------

  private highlights(): Map<string, HighlightKind> {
    const h = new Map<string, HighlightKind>();
    if (this.phase === 'move' && this.range) {
      for (const p of reachableTiles(this.range)) h.set(key(p), 'move');
      for (const k of this.mergeSet.keys()) h.set(k, 'merge');
      for (const k of this.loadSet.keys()) h.set(k, 'load');
    } else if (this.phase === 'attack') {
      for (const k of this.attackSet.keys()) h.set(k, 'attack');
    } else if (this.phase === 'unloadTile') {
      for (const k of this.unloadSet) h.set(k, 'unload');
    } else if (this.phase === 'target') {
      for (const p of this.targetArea(this.view.cursor)) h.set(key(p), 'attack');
    } else if (this.phase === 'map' && this.group.size) {
      for (const uid of this.group) {
        const u = unitById(this.s, uid);
        if (u) h.set(`${u.x},${u.y}`, 'group');
      }
    } else if (this.phase === 'map' && this.inspectUid === null) {
      // Solo pasando por encima de una unidad propia: su alcance, en tenue.
      const c = this.view.cursor;
      const u = unitAt(this.s, c.x, c.y);
      if (u && u.team === 0 && u.active && u.canMove && u.carrier === null && !this.enemyPlaying) {
        const r = moveRange(this.s, u);
        for (const p of reachableTiles(r)) h.set(key(p), 'hover');
      }
    } else if (this.phase === 'map' && this.inspectUid !== null) {
      // Alcance de una unidad señalada: adonde llega y que puede atacar en su proximo turno.
      const u = unitById(this.s, this.inspectUid);
      if (u && u.carrier === null && (u.team === 0 || this.visibleToPlayer(u))) {
        const r = moveRange(this.s, { ...u, active: true, canMove: true });
        const reach = 'reach';
        const threat = unitThreat(this.s, u);
        for (let x = 0; x < MAP_W; x++)
          for (let y = 0; y < MAP_H; y++) {
            if (r.steps[x]![y]! > 0 && UNIT.mover[u.type]! > 0) h.set(`${x},${y}`, reach);
            else if (threat[x]![y]) h.set(`${x},${y}`, 'attack');
          }
      } else this.inspectUid = null;
    }
    return h;
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
      orders: this.s.units
        .filter((u) => u.team === 0 && u.order && u.carrier === null)
        .map((u) => ({ from: { x: u.x, y: u.y }, to: u.order! })),
      danger: this.phase === 'move' ? this.dangerMap : null,
      captures,
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
      general: generalVM(s, 0, this.phase === 'target' ? this.targeting : null),
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
      hint: busy
        ? this.enemyPlaying
          ? t('skip')
          : ''
        : this.phase === 'target'
          ? t('genTarget')
          : this.phase === 'map'
            ? this.inspectUid !== null
              ? t('hintInspect')
              : t('hintMap')
            : '',
      mission: this.missionPanel(),
    });
    this.publishCameraView();
  }

  // -------------------------------------------------------------------------
  // Misiones y tutorial
  // -------------------------------------------------------------------------

  private tutorialStep = 0;
  /** Acciones del jugador desde que empezo el paso actual del tutorial. */
  private tutorialEvents: GameEvent[] = [];
  private tutorialOwned = 0;

  private missionPanel(): UIState['mission'] {
    const id = this.s.mission?.id;
    const m = id ? missionById(id) : undefined;
    if (!m) return null;
    let tip: string | null = null;
    let step: string | null = null;
    if (m.tutorial) {
      this.advanceTutorial();
      const st = TUTORIAL[this.tutorialStep];
      if (st) {
        tip = st.text[settings.lang];
        step = `${this.tutorialStep + 1}/${TUTORIAL.length}`;
      }
    }
    return { title: m.title[settings.lang], objective: objectiveText(m, this.s), status: objectiveStatus(this.s), tip, step };
  }

  /** Pasa al siguiente consejo cuando se ha hecho lo que pedia el actual (puede saltar varios). */
  private advanceTutorial(): void {
    if (this.tutorialStep === 0 && this.tutorialEvents.length === 0)
      this.tutorialOwned = this.s.buildings.filter((b) => b.owner === 0).length;
    for (let guard = 0; guard < TUTORIAL.length; guard++) {
      const st = TUTORIAL[this.tutorialStep];
      if (!st || !st.done({ s: this.s, phase: this.phase, events: this.tutorialEvents, ownedAtStart: this.tutorialOwned })) return;
      this.tutorialStep++;
      this.tutorialEvents = [];
    }
  }

  private forecast(c: Pos): ForecastVM | null {
    if (!this.sel) return null;
    let target: Unit | undefined;
    let atk: Unit = this.sel;
    if (this.phase === 'move') {
      // Al mover: si el cursor esta sobre un enemigo atacable, prevision desde la casilla desde la que se atacaria.
      const it = this.intentAt(c);
      if (it.kind !== 'attack') return null;
      target = it.target;
      atk = { ...this.sel, x: it.from.x, y: it.from.y };
    } else {
      const uid = this.attackSet.get(key(c));
      target = uid !== undefined ? unitById(this.s, uid) : undefined;
    }
    if (!target) return null;
    return forecastVM(this.textures, this.s, this.sel, atk, target, this.anchor('forecast', target));
  }

  /** Bocadillo junto al cursor al mover: movimiento gastado, defensa, combustible, peligro y lo que pasaria al soltar. */
  private moveTip(c: Pos): MoveTipVM | null {
    const u = this.sel,
      r = this.range;
    if (!u || !r) return null;
    const it = this.intentAt(c);
    if (it.kind === 'attack' || it.kind === 'stay') return null; // de eso se encarga la prevision de combate
    const anchor = this.anchor('moveTip', c);
    if (it.kind === 'none') return { anchor, action: t('tipNone'), invalid: true };
    const dest = it.kind === 'move' ? it.to : null;
    const used = dest ? pathCost(this.s, Movement.of(u.type), this.trailTo(dest)) : r.steps[c.x]![c.y]! || 1;
    const stars = defenseStars(this.s, c);
    const action = it.kind === 'merge' ? t('tipJoin') : it.kind === 'load' ? t('tipBoard') : it.capture ? t('tipCapture') : t('tipMove');
    return {
      anchor,
      action,
      used,
      max: r.maxSteps,
      stars: it.kind === 'move' ? stars : undefined,
      danger: it.kind === 'move' && !!this.dangerMap?.[c.x]?.[c.y],
    };
  }

  private tileInfo(p: Pos): TileVM {
    const selected = this.phase !== 'map' ? this.sel : null;
    return tileVM(this.textures, this.s, p, { vis: this.vis, hidden: this.hidden, selected });
  }

  /** "20→10": puntos del edificio antes y despues de capturar este turno (reglas nuevas). */
  private captureHint(): string | undefined {
    return this.sel ? captureHintText(this.s, this.sel) : undefined;
  }

  /** Menu emergente de la fase actual. */
  private buildMenu(): MenuVM {
    let items: MenuItemVM[] = [];
    let at: Pos = this.view.cursor;
    let title: string | undefined;
    let subtitle: string | undefined;
    let kind: MenuVM['kind'] = 'game';
    let info: string[] | undefined;
    switch (this.phase) {
      case 'gameMenu':
        title = `${t('day')} ${this.s.day}${RULES.dayLimit ? ` / ${RULES.dayLimit}` : ''}`;
        // Codigo del mapa, para volver a jugarlo (Nueva partida > Codigo del mapa).
        if (this.s.setup) subtitle = `${t('mapCode')}: ${seedToCode(this.s.setup.seed)} · ${this.s.setup.size}×${this.s.setup.size}`;
        if (this.s.mission) {
          const m = missionById(this.s.mission.id);
          if (m) info = [`${m.title[settings.lang]}: ${objectiveText(m, this.s)}`];
        }
        items = GAME_MENU.map((k) => ({
          id: k,
          label: t(k as TextKey),
          hint: k === 'endTurn' ? 'E' : k === 'resume' ? 'Esc' : k === 'help' ? 'H' : k === 'options' ? 'O' : undefined,
          danger: k === 'quit' || k === 'surrender',
          disabled: k === 'replay' && !this.lastEnemy,
        }));
        break;
      case 'unitMenu':
        kind = 'unit';
        if (this.sel) at = this.sel;
        items = this.actions.map((a) => ({
          id: a,
          label: t(a as TextKey),
          danger: a === 'delete',
          hint: a === 'capture' ? this.captureHint() : undefined,
        }));
        title = this.sel ? unitLabel(this.sel.type) : undefined;
        break;
      case 'buy':
        kind = 'buy';
        if (this.selBuilding) {
          at = this.selBuilding;
          title = buildingLabel(this.selBuilding.type);
          subtitle = `${t('funds')}: ${fmtNum(this.s.funds[0])}`;
        }
        items = [
          { id: 'cancel', label: t('cancel'), icon: null },
          ...this.buy.map((o) => ({
            id: `buy${o.type}`,
            label: unitLabel(o.type),
            hint: `${o.cost}`,
            icon: unitIconKey(o.type, o.affordable),
            disabled: !o.affordable,
            detail:
              `${unitStatsText(o.type)} · ${t('vision')} ${UNIT.vision[o.type]}` +
              (RULES.commandPoints === null ? '' : ` · ${t('commandShort')} ${UNIT.command[o.type]}`) +
              abilitiesVM(o.type)
                .map((a) => ` · ${a.name}`)
                .join('') +
              (o.blocked ? ` · ${buyBlockedText(o.blocked)}` : ''),
          })),
        ];
        break;
      case 'groupMenu': {
        kind = 'unit';
        const units = this.groupUnits();
        if (units[0]) at = units[0];
        title = `${t('groupMenu')} · ${units.length}`;
        items = GROUP_MENU.filter((k) => this.groupOption(k, units)).map((k) => ({
          id: k,
          label: t(k === 'move' ? 'groupMoveHint' : (k as TextKey)),
        }));
        break;
      }
      case 'unloadPick': {
        kind = 'cargo';
        if (this.sel) at = this.sel;
        const cargo = this.sel ? this.sel.cargo.map((uid) => unitById(this.s, uid)) : [];
        items = [
          { id: 'back', label: t('back'), icon: null },
          ...cargo.map((u, i) =>
            u
              ? {
                  id: `c${i}`,
                  label: unitLabel(u.type),
                  icon: unitIconKey(u.type, true),
                  hint: `${u.life}`,
                  disabled: !unloadTiles(this.s, this.sel!, u).length,
                }
              : { id: `c${i}`, label: t('empty'), icon: null, disabled: true },
          ),
        ];
        title = t('unload');
        break;
      }
      default:
        break;
    }
    this.menuItems = items;
    return { kind, title, subtitle, info, items, selected: this.menuSel, anchor: this.anchor('menu', at) };
  }

  // -------------------------------------------------------------------------
  // Entrada
  // -------------------------------------------------------------------------

  private setupInput(): void {
    this.input.mouse?.disableContextMenu();
    // Dos dedos a la vez para pellizcar (zoom).
    if (this.input.manager.pointersTotal < 3) this.input.addPointer(1);
    // Que el navegador no use estas teclas (Tab cambia el foco, Espacio desplaza la pagina...).
    this.input.keyboard!.addCapture('TAB,SPACE,UP,DOWN,LEFT,RIGHT,BACKSPACE');
    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => this.onKey(e));
    // Raton y dedos: el adaptador decide el gesto; pointerTarget() dice que hace en la partida.
    const g = this.gestures;
    const pin = (p: Phaser.Input.Pointer, right: boolean): PointerIn => ({
      id: p.id,
      x: p.x,
      y: p.y,
      touch: p.wasTouch,
      down: p.isDown,
      right,
      shift: !!(p.event as MouseEvent | undefined)?.shiftKey,
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => g.move(pin(p, false)));
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => g.down(pin(p, p.rightButtonDown())));
    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => g.up(pin(p, p.rightButtonReleased())));
    this.input.on(Phaser.Input.Events.GAME_OUT, () => g.leave());
    this.input.on(Phaser.Input.Events.POINTER_WHEEL, (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) =>
      g.wheel(dy, p.x, p.y),
    );
  }

  private onKey(e: KeyboardEvent): void {
    // Pantalla final y opciones: menus propios, con sus teclas.
    if (this.ended) return this.endKey(e);
    if (this.optionsPanel.isOpen) return this.optionsPanel.key(e);
    const cmd = keyCommand(e);
    if (!cmd) return;
    if (cmd.kind === 'accept') e.preventDefault();
    this.command(cmd);
  }

  /**
   * Cumplir una orden del jugador, venga del teclado o de otro mando (ver src/controls). Es lo unico
   * que un mando necesita de la escena.
   */
  command(cmd: GameCommand): void {
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
        if (this.carry) return this.cancelCarry();
        if (this.group.size) {
          this.group.clear();
          return this.refresh();
        }
        return this.back();
      case 'undo':
        if (this.phase === 'map') this.undoLast();
        return;
      case 'endTurn':
        if (this.phase === 'map' || this.phase === 'gameMenu') this.requestEndTurn();
        return;
      case 'threat':
        return this.toggleThreat();
      case 'minimap':
        return ui.actions.toggleMinimap();
      case 'nextUnit':
        if (this.phase === 'map') this.nextIdle();
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

  /**
   * Lo que significa cada gesto del raton o del dedo en la partida. Que gesto es (toque, arrastre,
   * pellizco...) lo decide el adaptador (src/controls/pointer.ts); aqui solo se cumple.
   */
  private pointerTarget(): PointerTarget {
    return {
      later: (ms, fn) => {
        const ev = this.time.delayedCall(ms, fn);
        return { cancel: () => ev.remove(false) };
      },
      ended: () => this.ended,
      busy: () => this.phase === 'busy',
      fastForward: () => {
        this.fastForward = true;
      },
      carrying: () => this.carry !== null,
      canBox: () => this.phase === 'map',
      pickAt: (x, y) => {
        // ¿Se coge una unidad propia? (en el mapa, o la que esta elegida al mover)
        const tile = this.view.tileAtScreen(x, y);
        const u = tile ? unitAt(this.s, tile.x, tile.y) : undefined;
        const pickable =
          !!u &&
          u.team === 0 &&
          u.active &&
          u.canMove &&
          u.carrier === null &&
          (this.phase === 'map' || (this.phase === 'move' && this.sel?.uid === u.uid));
        return pickable ? u.uid : null;
      },
      touchStart: () => this.touchHint(),
      rightPress: (x, y) => {
        if (this.carry) return this.cancelCarry();
        // Clic derecho sobre una unidad en el mapa: ver su alcance (si no, atras).
        const tile = this.view.tileAtScreen(x, y);
        const u = tile && this.phase === 'map' ? unitAt(this.s, tile.x, tile.y) : undefined;
        if (u && u.carrier === null && (u.team === 0 || this.visibleToPlayer(u)) && u.uid !== this.inspectUid) return this.inspect(u);
        return this.back();
      },
      beginCarry: (uid, touch, held) => this.beginCarry(uid, touch, held),
      carryTo: (x, y) => this.carryTo(x, y),
      dropCarry: (x, y, shift) => this.dropCarry(this.view.tileAtScreen(x, y), shift),
      cancelCarry: () => this.cancelCarry(),
      boxUpdate: (box) => this.view.setBox(box),
      boxEnd: (box) => {
        // Mayusculas + arrastrar en el mapa: elegir varias unidades (mover en grupo).
        const r = this.view.tilesInBox(box);
        this.view.setBox(null);
        this.group = new Set(
          this.s.units
            .filter(
              (u) =>
                u.team === 0 && u.active && u.canMove && u.carrier === null && u.x >= r.x0 && u.x <= r.x1 && u.y >= r.y0 && u.y <= r.y1,
            )
            .map((u) => u.uid),
        );
        // [CAMBIO] Ayudante: con varias elegidas sale el menu de grupo (mover o darles una mision).
        if (this.group.size) return this.openGroupMenu();
        this.refresh();
      },
      pan: (dx, dy) => {
        this.view.scrollBy(dx, dy);
        this.refreshHud();
      },
      zoomAt: (dir, x, y, wheel) => {
        this.view.zoomStep(dir, x, y);
        if (wheel) this.time.delayedCall(0, () => this.refreshHud());
        else this.refreshHud();
      },
      hover: (x, y) => {
        if (this.phase === 'busy') return;
        const tile = this.view.tileAtScreen(x, y);
        if (tile && CURSOR_PHASES.includes(this.phase)) this.moveCursorTo(tile, false);
      },
      tap: (x, y, touch, shift) => this.pointerTap(x, y, touch, shift),
      longPress: (x, y) => {
        // Pulsacion larga: llevar el cursor ahi (ficha de informacion) y ver el alcance si hay una unidad.
        if (this.phase !== 'map') return false;
        const tile = this.view.tileAtScreen(x, y);
        if (!tile) return true;
        navigator.vibrate?.(12);
        this.view.cursor = { ...tile };
        const u = unitAt(this.s, tile.x, tile.y);
        if (u && u.carrier === null && (u.team === 0 || this.visibleToPlayer(u))) this.inspect(u);
        else this.cursorMoved();
        return true;
      },
    };
  }

  /** La primera vez que se juega con el dedo, explicar los gestos. */
  private touchHint(): void {
    try {
      if (localStorage.getItem('ilogic.touchHint')) return;
      localStorage.setItem('ilogic.touchHint', '1');
    } catch {
      return;
    }
    showToast(t('touchHint'));
  }

  /** Un toque o un clic sin arrastrar. */
  private pointerTap(x: number, y: number, touch: boolean, shift: boolean): void {
    if (this.time.now < this.inputLockUntil) return;
    // (La barra superior y los menus son HTML: sus clics no llegan aqui.)
    const tile = this.view.tileAtScreen(x, y);
    // Doble clic en el destino: mover y esperar.
    if (
      this.phase === 'unitMenu' &&
      this.sel &&
      tile &&
      samePos(tile, this.sel) &&
      this.lastCommit &&
      this.time.now - this.lastCommit.time < 450
    ) {
      return this.waitSelected();
    }
    // Con el menu de grupo abierto, un clic en el mapa mueve el grupo ahi.
    if (this.phase === 'groupMenu' && tile && this.group.size) {
      this.toMap();
      this.moveCursorTo(tile, false);
      return void this.groupMove(tile);
    }
    // Clic fuera de un menu: cerrarlo (en el de acciones, deshace el movimiento).
    if (MENU_PHASES.includes(this.phase)) return this.back();
    if (!tile) return;
    if (this.phase === 'map' && this.group.size) {
      this.moveCursorTo(tile, false);
      return void this.groupMove(tile);
    }
    // Dedo, en el mapa o con una unidad elegida: un toque hace directamente lo logico (ver ui/touch.ts).
    if (touch && (this.phase === 'map' || this.phase === 'move')) return this.touchTap(tile);
    if (this.phase === 'move') {
      // Al mover, un clic es como soltar: en un enemigo, ataca; en un edificio, se mueve (y sale el menu).
      this.moveCursorTo(tile, false);
      return void this.commit(tile, { wait: shift });
    }
    // Tactil, en el resto (elegir objetivo, descargar...): primer toque señala, segundo confirma.
    if (touch && !samePos(tile, this.view.cursor)) return this.moveCursorTo(tile, false);
    this.moveCursorTo(tile, false);
    this.accept();
  }

  /** Un toque con el dedo en el mapa (fases map y move). */
  private touchTap(tile: Pos): void {
    const u = unitAt(this.s, tile.x, tile.y);
    const own = u && u.team === 0 && u.active && u.carrier === null ? u : null;
    if (this.phase === 'move') {
      const it = this.intentAt(tile);
      const act = moveTap({
        intent: it.kind,
        atCursor: samePos(tile, this.view.cursor),
        otherOwnActive: !!own && own.uid !== this.sel?.uid,
      });
      switch (act) {
        case 'commit':
          // Como soltar arrastrando: captura directamente, y espera sola si no hay nada mas que hacer.
          this.moveCursorTo(tile, false);
          return void this.commit(tile, { drop: true });
        case 'preview':
          return this.moveCursorTo(tile, false);
        case 'reselect':
          this.toMap();
          this.view.cursor = { ...tile };
          return this.selectUnit(own!);
        case 'deselect':
          this.toMap();
          return this.moveCursorTo(tile, false);
        default:
          return;
      }
    }
    const b = buildingAt(this.s, tile.x, tile.y);
    const act = mapTap({
      ownActive: !!own,
      buyHere: !u && !!b && b.owner === 0 && canBuyAt(this.s, b),
      visibleUnit: !!u && u.carrier === null && (u.team === 0 || this.visibleToPlayer(u)),
      inspectingThis: !!u && u.uid === this.inspectUid,
    });
    this.moveCursorTo(tile, false);
    if (act === 'point') {
      if (this.inspectUid === null) return;
      this.inspectUid = null;
      return this.refresh();
    }
    if (this.group.size) this.group.clear();
    this.acceptMap(tile);
  }

  override update(time: number, delta: number): void {
    this.view.cursorAttack = this.phase === 'attack' || this.phase === 'target';
    this.view.tick(time);
    // Desplazar el mapa con el raton en el borde de la pantalla.
    const p = this.input.activePointer;
    if (this.carry && p.isDown) {
      // Llevando una unidad cerca del borde: el mapa se desplaza solo (tambien con el dedo).
      const edge = (this.carry.touch ? 40 : 24) * (window.devicePixelRatio || 1);
      const dx = p.x < edge ? -1 : p.x > this.scale.width - edge ? 1 : 0;
      const dy = p.y < edge ? -1 : p.y > this.scale.height - edge ? 1 : 0;
      if (dx || dy) {
        this.view.scrollBy(dx * delta * 0.6 * (window.devicePixelRatio || 1), dy * delta * 0.6 * (window.devicePixelRatio || 1));
        this.carryTo(p.x, p.y);
      }
    } else if (this.gestures.inside && !this.ended && !this.gestures.dragging && !p.wasTouch && !MENU_PHASES.includes(this.phase)) {
      const edge = 14 * (window.devicePixelRatio || 1);
      const dx = p.x < edge ? -1 : p.x > this.scale.width - edge ? 1 : 0;
      const dy = p.y < edge ? -1 : p.y > this.scale.height - edge ? 1 : 0;
      if (dx || dy)
        this.view.scrollBy(dx * delta * 0.9 * (window.devicePixelRatio || 1), dy * delta * 0.9 * (window.devicePixelRatio || 1));
    }
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
      case 'map':
        return this.acceptMap(c);
      case 'groupMenu':
        return this.acceptGroupMenu();
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
        return void this.fireAbility(c);
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
        return this.toMap();
      default:
        break;
    }
  }

  // -------------------------------------------------------------------------
  // General
  // -------------------------------------------------------------------------

  /** Habilidad elegida en el panel: las de area pasan a elegir casilla; el resto se usan ya. */
  private async startAbility(id: string): Promise<void> {
    const g = generalOf(this.s, 0);
    const a = g?.def.abilities.find((x) => x.id === id);
    if (!g || !a) return;
    const block = abilityBlock(this.s, 0, id);
    if (block === 'target') {
      this.abandonSelection();
      this.phase = 'target';
      this.targeting = id;
      return this.refresh();
    }
    if (block) return showToast(t(block === 'used' ? 'genUsed' : 'genCharge'));
    if (this.phase === 'target') this.toMap();
    const ev = useAbility(this.s, 0, id);
    if (ev) await this.playEvents([ev]);
  }

  /** Casillas que tocaria la habilidad que se apunta si se lanza en `c` (dentro del mapa). */
  private targetArea(c: Pos): Pos[] {
    const a = this.targeting ? generalOf(this.s, 0)?.def.abilities.find((x) => x.id === this.targeting) : undefined;
    const r = a ? abilityArea(a) : null;
    if (r === null) return [];
    return areaTiles(c, r).filter((p) => p.x >= 0 && p.y >= 0 && p.x < MAP_W && p.y < MAP_H);
  }

  private async fireAbility(c: Pos): Promise<void> {
    const id = this.targeting;
    if (!id) return this.toMap();
    const ev = useAbility(this.s, 0, id, c);
    this.toMap();
    if (ev) await this.playEvents([ev]);
  }

  /** Animacion de una habilidad: el area se ilumina y cada unidad tocada explota y enseña lo que pierde. */
  private async playAbility(ev: Extract<GameEvent, { kind: 'ability' }>): Promise<void> {
    this.refresh();
    if (this.fastForward) return;
    const def = generalOf(this.s, ev.team)?.def;
    const ability = def?.abilities.find((a) => a.id === ev.ability);
    const name = ability?.name[settings.lang] ?? ev.ability;
    // El enemigo avisa siempre (aunque sea en la niebla): sabes que te han bombardeado o te ven.
    if (ev.team !== 0) showToast(`${t('enemy')} · ${def?.name[settings.lang] ?? ev.general}: ${name}`);
    const at = ev.target ?? this.view.cursor;
    if (ev.target) await this.lookAt(ev.target);
    const c = center(at);
    void floatText(this, this.view, { x: c.x, y: c.y - 18 }, name, PAL_CSS.gold);
    const r = ability ? abilityArea(ability) : null;
    if (ev.target && r !== null) {
      for (const p of areaTiles(ev.target, r))
        if (p.x >= 0 && p.y >= 0 && p.x < MAP_W && p.y < MAP_H) void tileFlash(this, this.view, p, PAL.red);
      this.cameras.main.shake(220, 0.006);
    }
    await Promise.all([
      ...ev.hits.map(async (h) => {
        const u = unitById(this.s, h.uid);
        if (!u || (u.team !== 0 && !this.visibleToPlayer(u))) return;
        const p = center(u);
        void burst(this, this.view, p, { colors: COLORS.fire, count: 14, radius: 20 });
        await floatText(this, this.view, { x: p.x, y: p.y - 6 }, `-${h.damage}`, PAL_CSS.redSoft);
      }),
      // Curar: "+N" en verde sobre cada unidad que recupera vida.
      ...(ev.heals ?? []).map(async (h) => {
        const u = unitById(this.s, h.uid);
        if (!u || (u.team !== 0 && !this.visibleToPlayer(u))) return;
        const p = center(u);
        void burst(this, this.view, p, { colors: COLORS.heal, count: 10, radius: 16 });
        await floatText(this, this.view, { x: p.x, y: p.y - 6 }, `+${h.amount}`, PAL_CSS.green);
      }),
      // Dinero: la cantidad, bajo el nombre de la habilidad.
      ...(ev.funds ? [floatText(this, this.view, { x: c.x, y: c.y }, `+${fmtNum(ev.funds)}`, PAL_CSS.gold)] : []),
    ]);
  }

  // -------------------------------------------------------------------------
  // Laboratorio de animaciones (src/lab.ts)
  // -------------------------------------------------------------------------

  private startLab(o: LabOptions): void {
    // Camara lenta: todo lo que va por tweens y temporizadores de la escena.
    const scale = o.slow ? 0.25 : 1;
    this.tweens.timeScale = scale;
    this.time.timeScale = scale;
    this.view.cursor = { ...LAB_TARGET };
    // Mas cerca que en una partida: se ven bien los efectos. Centrado entre las dos unidades.
    const cam = this.cameras.main;
    for (let i = 0; i < 2; i++) this.view.zoomStep(1, cam.width / 2, cam.height / 2);
    cam.centerOn((LAB_TARGET.x - 1) * TILE, (LAB_TARGET.y + 0.5) * TILE);
    this.refresh();
    if (o.play) this.time.delayedCall(450, () => void this.runLab(o.play!));
  }

  private async runLab(action: LabAction): Promise<void> {
    const me = this.s.units.find((u) => u.team === 0);
    const foe = this.s.units.find((u) => u.team === 1);
    if (!me || !foe) return;
    if (action === 'move') {
      const range = moveRange(this.s, me);
      const dest = { x: LAB_TARGET.x - labRange(me.type), y: LAB_TARGET.y };
      const path = moveUnit(this.s, me, dest, range);
      if (path) await this.playEvents([moveEvent(me.uid, path)]);
      return;
    }
    await this.playEvents([attackEvent(this.s, me, foe, seededRng(3))]);
  }

  /** Volver a empezar el laboratorio con otras opciones (y una accion, si se pide). */
  private restartLab(o: LabOptions): void {
    this.scene.start('Game', { mode: 'lab', lab: o } satisfies GameStartData);
  }

  private toMap(): void {
    this.phase = 'map';
    this.targeting = null;
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

  /** Camino hasta `dest`: el trazado si acaba ahi, si no el mas corto. */
  private trailTo(dest: Pos): Pos[] {
    const end = this.trail[this.trail.length - 1];
    if (end && samePos(end, dest) && this.sel && samePos(this.trail[0]!, this.sel)) return this.trail;
    const i = this.trail.findIndex((p) => samePos(p, dest));
    if (i > 0) return this.trail.slice(0, i + 1);
    return pathTo(this.range!, this.sel!, dest);
  }

  /** Que pasaria al soltar (o pulsar) la unidad elegida en una casilla. */
  private intentAt(t: Pos): Intent {
    const u = this.sel,
      r = this.range;
    if (!u || !r || !inBounds(t.x, t.y)) return { kind: 'none' };
    if (samePos(t, u)) return { kind: 'stay' };
    const mergeUid = this.mergeSet.get(key(t));
    if (mergeUid !== undefined) return { kind: 'merge', target: unitById(this.s, mergeUid)! };
    const loadUid = this.loadSet.get(key(t));
    if (loadUid !== undefined) return { kind: 'load', target: unitById(this.s, loadUid)! };
    const enemy = unitAt(this.s, t.x, t.y);
    if (enemy && enemy.team !== u.team && enemy.carrier === null && this.visibleToPlayer(enemy)) {
      const from = this.attackFrom(enemy);
      return from ? { kind: 'attack', from, target: enemy } : { kind: 'none' };
    }
    if (r.steps[t.x]![t.y]! > 0) {
      const b = buildingAt(this.s, t.x, t.y);
      return { kind: 'move', to: { x: t.x, y: t.y }, capture: !!b && b.owner !== u.team && !!UNIT.cancapt[u.type] };
    }
    return { kind: 'none' };
  }

  /** Mejor casilla desde la que atacar a `t` (ver bestAttackTile). */
  private attackFrom(t: Unit): Pos | null {
    return bestAttackTile(this.s, this.sel!, t, this.range!, this.trail[this.trail.length - 1] ?? this.sel!);
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

  /** Al empezar el turno: las unidades con orden avanzan solas (y pueden seguir actuando despues). */
  private async runOrders(): Promise<void> {
    const movers = this.s.units.filter((u) => u.team === 0 && u.order && u.active && u.canMove && u.carrier === null);
    const arrived: Unit[] = [];
    const m = this.match;
    for (const u of movers) {
      if (m !== this.match) return;
      const goal = u.order!;
      if (samePos(u, goal)) {
        delete u.order;
        continue;
      }
      const r = moveRange(this.s, u);
      // Si ya llega este turno, no gastar el turno en las ultimas casillas: la mueve el jugador
      // (y puede seguir hasta donde quiera, atacar o capturar).
      if ((r.steps[goal.x]?.[goal.y] ?? 0) > 0) {
        delete u.order;
        arrived.push(u);
        continue;
      }
      const dest = stepToward(this.s, u, goal, r);
      if (!dest) continue;
      const path = moveUnit(this.s, u, dest, r);
      if (!path) continue;
      await this.playEvents([moveEvent(u.uid, path)]);
      if (samePos(u, goal) || path.ambush) delete u.order;
    }
    if (arrived.length) {
      this.view.cursor = { x: arrived[0]!.x, y: arrived[0]!.y };
      this.view.ensureVisible(arrived[0]!, 3);
      showToast(t('orderArrives'));
    }
    if (movers.length) this.refresh();
  }

  /** Mover en grupo: cada unidad elegida va lo mas cerca posible del destino, sin pisarse. */
  private async groupMove(goal: Pos): Promise<void> {
    const units = [...this.group]
      .map((uid) => unitById(this.s, uid))
      .filter((u): u is Unit => !!u && u.active && u.canMove && u.carrier === null)
      .sort((a, b) => manhattan(a, goal) - manhattan(b, goal));
    this.group.clear();
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

  /**
   * Levantar la unidad de la pulsacion actual (arrastrar y soltar). `held`: con el dedo, se ha
   * mantenido pulsado antes de arrastrar (si no, el arrastre puede ser un desplazamiento del mapa
   * que empezo sobre la unidad, y soltar lejos no le da una orden de varios turnos).
   */
  private beginCarry(uid: number, touch: boolean, held: boolean): boolean {
    const u = unitById(this.s, uid);
    if (!u || !u.active || !u.canMove) return false;
    if (this.phase !== 'move' || this.sel?.uid !== u.uid) {
      if (this.phase !== 'map') this.toMap();
      this.view.cursor = { x: u.x, y: u.y };
      this.selectUnit(u);
    }
    if (touch) navigator.vibrate?.(10);
    const key = unitKey(this.textures, this.s, u);
    if (!key) return true;
    // Sombra en el suelo y la unidad "levantada" 3 pixeles.
    const shadow = this.add.rectangle(u.x * TILE + TILE / 2, (u.y + 1) * TILE - 3, 22, 5, 0x000000, 0.35);
    this.view.addFx(shadow);
    const ghost = this.view.ghost(key, u);
    ghost.y -= 3;
    this.carry = { uid: u.uid, ghost, shadow, touch, held: held || !touch };
    this.hidden.add(u.uid);
    this.refresh();
    return true;
  }

  /** El puntero se mueve con la unidad cogida: la unidad salta de casilla en casilla y el camino la sigue. */
  private carryTo(x: number, y: number): void {
    const c = this.carry;
    if (!c) return;
    const tile = this.view.tileAtScreen(x, y);
    if (!tile || samePos(tile, this.view.cursor)) return;
    this.view.cursor = { ...tile };
    this.updateTrail(tile);
    const it = this.intentAt(tile);
    // Sobre un enemigo, la unidad se coloca en la casilla desde la que atacaria (y el cursor marca al enemigo).
    const at = it.kind === 'attack' ? it.from : tile;
    c.ghost.setPosition(at.x * TILE + TILE / 2, (at.y + 1) * TILE - 3);
    c.shadow.setPosition(at.x * TILE + TILE / 2, (at.y + 1) * TILE - 3);
    if (it.kind === 'none') c.ghost.setTint(0xff9090).setAlpha(0.7);
    else c.ghost.clearTint().setAlpha(1);
    this.refresh();
  }

  /** Soltar la unidad cogida. Fuera del alcance (o en su sitio) vuelve sin hacer nada. */
  private dropCarry(tile: Pos | null, shift: boolean): void {
    const c = this.carry;
    if (!c) return;
    this.carry = null;
    this.hidden.delete(c.uid);
    const it = tile ? this.intentAt(tile) : { kind: 'none' as const };
    // Soltar lejos, fuera del alcance, en una casilla a la que se puede llegar algun dia: orden de varios turnos.
    if (
      it.kind === 'none' &&
      c.held &&
      tile &&
      this.sel &&
      !unitAt(this.s, tile.x, tile.y) &&
      canWalk(this.s, tile.x, tile.y, Movement.of(this.sel.type))
    ) {
      c.ghost.destroy();
      c.shadow.destroy();
      return void this.giveOrder(this.sel, tile);
    }
    if (it.kind === 'none' || it.kind === 'stay') {
      void this.snapBack(c);
      return this.toMap();
    }
    c.ghost.destroy();
    c.shadow.destroy();
    this.view.cursor = { ...tile! };
    void this.commit(tile!, { drop: true, wait: shift });
  }

  private cancelCarry(): void {
    const c = this.carry;
    if (!c) return;
    this.carry = null;
    this.hidden.delete(c.uid);
    void this.snapBack(c);
    this.toMap();
  }

  /** Animacion de "vuelve a su sitio" de la unidad cogida. */
  private async snapBack(c: NonNullable<GameScene['carry']>): Promise<void> {
    const u = unitById(this.s, c.uid);
    c.shadow.destroy();
    if (!u || reducedMotion()) return void c.ghost.destroy();
    c.ghost.clearTint();
    await new Promise<void>((resolve) =>
      this.tweens.add({
        targets: c.ghost,
        x: u.x * TILE + TILE / 2,
        y: (u.y + 1) * TILE,
        duration: 140,
        ease: 'Stepped',
        easeParams: [4],
        onComplete: () => resolve(),
      }),
    );
    c.ghost.destroy();
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
        return void this.enemyTurn();
      case 'replay':
        if (!this.lastEnemy) return showToast(t('noReplay'));
        return void this.replayEnemyTurn();
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
      case 'auto':
        return this.setMission(u, defaultMission(u.type));
      case 'autoDefend':
        return this.setMission(u, 'defend');
      case 'manual':
        delete u.auto;
        delete u.guard;
        showToast(t('autoOff'));
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

  /** Unidades del grupo elegido que siguen existiendo. */
  private groupUnits(): Unit[] {
    return [...this.group].map((uid) => unitById(this.s, uid)).filter((u): u is Unit => !!u);
  }

  /** [CAMBIO] Menu de grupo, al elegir varias con Mayusculas + recuadro. */
  private openGroupMenu(): void {
    this.menuSel = 0;
    this.phase = 'groupMenu';
    this.refresh();
  }

  /** Que opciones del menu de grupo tienen sentido para estas unidades. */
  private groupOption(k: GroupMenuKey, units: Unit[]): boolean {
    if (k === 'manual') return units.some((u) => u.auto);
    return true;
  }

  private acceptGroupMenu(): void {
    const k = this.menuItems[this.menuSel]?.id as GroupMenuKey | undefined;
    const units = this.groupUnits();
    if (k === 'move') {
      // Sigue elegido: el siguiente clic en el mapa lo mueve.
      showToast(`${units.length} ${t('groupSelected')}`);
      return this.toMap();
    }
    if (k === 'cancel' || !k) {
      this.group.clear();
      return this.toMap();
    }
    this.group.clear();
    if (k === 'manual') {
      for (const u of units) {
        delete u.auto;
        delete u.guard;
      }
      showToast(t('autoOff'));
      return this.toMap();
    }
    // [CAMBIO] Auto: cada una con la mision de su tipo (la infanteria captura, el resto ataca); o
    // todas a defender su casilla. Empieza al terminar el turno: no se juegan ya, para no perder el hilo.
    for (const u of units) {
      u.auto = k === 'autoDefend' ? 'defend' : defaultMission(u.type);
      u.guard = { x: u.x, y: u.y };
    }
    showToast(`${units.length} · ${t(k === 'autoDefend' ? 'autoOnDefend' : 'autoOnGroup')}`);
    this.toMap();
  }

  /**
   * [CAMBIO] Ayudante: deja la unidad en automatico con una mision. Si se acaba de mover, lo movido
   * cuenta y la mision empieza el turno que viene (defender guarda la casilla nueva); si no se ha
   * movido, la IA la juega ya.
   */
  private setMission(u: Unit, mission: AutoMission): void {
    const moved = !!this.undo && this.undo.uid === u.uid && (this.undo.x !== u.x || this.undo.y !== u.y);
    if (this.undo && this.undo.uid === u.uid && !moved) u.canMove = true;
    this.clearUndo();
    u.auto = mission;
    u.guard = { x: u.x, y: u.y };
    if (moved) {
      wait(u);
      showToast(missionToast(mission));
      return this.afterAction();
    }
    this.abandonSelection();
    void this.playAuto(u, mission);
  }

  /** [CAMBIO] Ayudante: la IA juega ya la unidad que se acaba de dejar en automatico. */
  private async playAuto(u: Unit, mission: AutoMission): Promise<void> {
    const m = this.match;
    this.phase = 'busy';
    this.refresh();
    for (const ev of assistUnit(this.s, u.uid, Math.random)) {
      await this.playEvents([ev]);
      if (m !== this.match || this.checkEnd()) return;
    }
    wait(u);
    showToast(missionToast(mission));
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
    void this.finish(result === 'won', endReason(this.s));
    return true;
  }

  /** Rendirse: la partida termina como derrota. */
  private surrender(): void {
    this.toMap();
    void this.finish(false, 'surrender');
  }

  // -------------------------------------------------------------------------
  // Final de la partida: el mapa tal como acabo, la camara en la jugada decisiva y el resumen
  // -------------------------------------------------------------------------

  /** Ultima casilla con un combate o una captura (para enfocar el final). */
  private lastAt: Pos | null = null;
  private endButtons: EndButton[] = [];
  private endSel = 0;
  private endFx: Phaser.Time.TimerEvent | null = null;

  private async finish(won: boolean, reason: NonNullable<UIState['end']>['reason']): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    this.phase = 'busy';
    // [CAMBIO] borrar el guardado de esta partida al terminarla (antes solo si se habia cargado).
    if (this.fromSave || this.savedThisGame) deleteSave();
    sampleArmy(this.s);
    const m = this.s.mission ? missionById(this.s.mission.id) : undefined;
    const before = m ? bestDays(m.id) : null;
    if (m && won) markCompleted(m.id, this.s.day);
    this.threat = false;
    this.refresh();
    ui.set({
      screen: 'outro',
      menu: null,
      forecast: null,
      moveTip: null,
      tile: null,
      options: null,
      help: false,
      toast: null,
      report: null,
    });

    // Camara a la jugada que lo ha decidido.
    const focus = this.endFocus(won, reason);
    const match = this.match;
    await this.wait(500);
    if (match !== this.match) return;
    const c = { x: focus.x * TILE + TILE / 2, y: focus.y * TILE + TILE / 2 };
    this.cameras.main.pan(c.x, c.y, reducedMotion() ? 0 : 1200, 'Sine.easeInOut', true);
    await this.wait(reducedMotion() ? 100 : 1250);
    if (match !== this.match) return;
    if (won) {
      void tileFlash(this, this.view, focus, PAL.gold);
      const confetti = () => {
        const p = { x: c.x + (Math.random() - 0.5) * TILE * 8, y: c.y + (Math.random() - 0.5) * TILE * 5 };
        void burst(this, this.view, p, {
          colors: [PAL.gold, 0xfff1a8, PAL.blue, 0x8fd0ff, 0xffffff],
          count: 14,
          radius: 30,
          duration: 900,
        });
      };
      confetti();
      if (!reducedMotion()) this.endFx = this.time.addEvent({ delay: 420, loop: true, callback: confetti });
    } else {
      setEndFilter('grayscale(0.9) brightness(0.55)');
      const smoke = () =>
        void burst(
          this,
          this.view,
          { x: c.x + (Math.random() - 0.5) * TILE, y: c.y - TILE / 2 },
          { colors: COLORS.smoke, count: 8, radius: 26, size: 6, duration: 1400 },
        );
      smoke();
      if (!reducedMotion()) this.endFx = this.time.addEvent({ delay: 650, loop: true, callback: smoke });
    }
    await this.wait(reducedMotion() ? 200 : 1300);
    if (match !== this.match) return;

    // Botones del final.
    const next = m ? MISSIONS[MISSIONS.indexOf(m) + 1] : undefined;
    this.endButtons = m ? (won ? [...(next ? ['next' as const] : []), 'retry', 'menu'] : ['retry', 'menu']) : ['rematch', 'new', 'menu'];
    this.endSel = 0;
    const st = stats(this.s);
    ui.set({
      screen: 'end',
      end: {
        won,
        day: this.s.day,
        stats: st,
        reason,
        score: [score(this.s, 0), score(this.s, 1)],
        mission: m ? m.title[settings.lang] : null,
        chart: st.army && st.army.length > 1 ? st.army : null,
        best: m ? (won ? bestDays(m.id) : before) : null,
        newBest: !!m && won && (before === null || this.s.day < before),
        buttons: this.endButtons.map((id) => ({ id, label: t(END_LABEL[id]) })),
        selected: 0,
      },
    });
    Object.assign(ui.actions, {
      endHover: (i: number) => {
        this.endSel = i;
        this.publishEndSel();
      },
      endPick: (i: number) => this.endPick(i),
    });
  }

  /** Donde mirar al acabar. */
  private endFocus(won: boolean, reason: NonNullable<UIState['end']>['reason']): Pos {
    const hq = (team: 0 | 1) => this.s.buildings.find((b) => b.type === HQ && b.owner === team);
    const obj = this.s.mission?.objective;
    if (reason === 'objective' && obj?.kind === 'escort') return obj.to;
    if ((reason === 'hq' || reason === 'wipeout' || reason === 'objective') && this.lastAt) return this.lastAt;
    const own = hq(0) ?? hq(1);
    if (!won && own) return own;
    return this.lastAt ?? own ?? { x: Math.floor(MAP_W / 2), y: Math.floor(MAP_H / 2) };
  }

  private publishEndSel(): void {
    const e = ui.get().end;
    if (e) ui.set({ end: { ...e, selected: this.endSel } });
  }

  private endKey(e: KeyboardEvent): void {
    if (ui.get().screen !== 'end') return;
    const n = this.endButtons.length;
    if (['ArrowLeft', 'KeyA', 'ArrowUp', 'KeyW'].includes(e.code)) this.endSel = (this.endSel - 1 + n) % n;
    else if (['ArrowRight', 'KeyD', 'ArrowDown', 'KeyS', 'Tab'].includes(e.code)) this.endSel = (this.endSel + 1) % n;
    else if (['Enter', 'NumpadEnter', 'Space'].includes(e.code) && !e.repeat) return this.endPick(this.endSel);
    else if (e.code === 'Escape') return this.endPick(this.endButtons.indexOf('menu'));
    else return;
    this.publishEndSel();
  }

  private endPick(i: number): void {
    const id = this.endButtons[i];
    if (!id || ui.get().screen !== 'end') return;
    this.endFx?.remove(false);
    this.endFx = null;
    setEndFilter(null);
    ui.set({ end: null });
    const m = this.s.mission ? missionById(this.s.mission.id) : undefined;
    switch (id) {
      case 'rematch':
        return void this.scene.start('Game', { mode: 'new', rules: this.s.rules, setup: this.s.setup });
      case 'retry':
        return void this.scene.start(
          'Game',
          m ? { mode: 'mission', mission: m.id } : { mode: 'new', rules: this.s.rules, setup: this.s.setup },
        );
      case 'next': {
        const next = m ? MISSIONS[MISSIONS.indexOf(m) + 1] : undefined;
        return void this.scene.start('Game', next ? { mode: 'mission', mission: next.id } : undefined);
      }
      case 'new':
        return void this.scene.start('Menu', { open: 'setup' });
      case 'menu':
        return void this.scene.start('Menu');
    }
  }

  /**
   * Volver a ver el ultimo turno enemigo: se restaura el estado de antes y se vuelve a jugar con
   * la misma semilla (la IA y los combates son deterministas con ella); al acabar se deja todo
   * exactamente como estaba.
   */
  private async replayEnemyTurn(): Promise<void> {
    const last = this.lastEnemy;
    if (!last || this.phase === 'busy' || this.ended) return;
    this.toMap();
    const saved = this.saveCamera();
    const after = serialize(this.s);
    const before = deserialize(last.before);
    if (!before) return;
    this.s = before;
    this.replaying = true;
    this.phase = 'busy';
    this.enemyPlaying = true;
    this.fastForward = false;
    this.refresh();
    showBanner(`${t('day')} ${this.s.day}`, t('replayBanner'), 'red');
    const m = this.match;
    await this.wait(900);
    for (const ev of aiTurn(this.s, seededRng(last.seed))) {
      if (m !== this.match) return;
      await this.playEvents([ev]);
      if (m !== this.match || this.ended) return;
    }
    this.s = deserialize(after)!;
    this.replaying = false;
    this.enemyPlaying = false;
    this.backToPlayer(saved);
  }

  /** Donde estaba mirando el jugador antes del turno enemigo. */
  private saveCamera(): { x: number; y: number; cursor: Pos } {
    const cam = this.cameras.main;
    return { x: cam.midPoint.x, y: cam.midPoint.y, cursor: { ...this.view.cursor } };
  }

  /** Vuelve el control al jugador tras el turno enemigo: camara donde estaba y entrada bloqueada un momento. */
  private backToPlayer(saved: { x: number; y: number; cursor: Pos }): void {
    this.fastForward = false;
    this.view.cursor = saved.cursor;
    this.cameras.main.pan(saved.x, saved.y, 300, 'Sine.easeInOut', true);
    this.phase = 'map';
    // Que el Enter o el clic con el que se aceleraba la IA no actue ya en el turno propio.
    this.inputLockUntil = this.time.now + INPUT_LOCK_MS;
    this.refresh();
  }

  /** Estado antes del ultimo turno enemigo y semilla con la que se jugo (para repetirlo). */
  private lastEnemy: { before: string; seed: number } | null = null;
  private replaying = false;
  private surrenderArmedAt = -1e9;

  private quitToMenu(): void {
    this.ended = true;
    this.scene.start('Menu');
  }

  // -------------------------------------------------------------------------
  // Turno de la IA y animaciones
  // -------------------------------------------------------------------------

  /** Fin de turno con la tecla E: si quedan unidades sin usar, pedir que se pulse otra vez. */
  /** Unidades sin usar encima de un edificio que pueden capturar: capturan solas al terminar el turno. */
  private autoCapturers(): Unit[] {
    return this.s.units.filter((u) => u.team === 0 && u.active && u.canMove && u.carrier === null && canCapture(this.s, u));
  }

  private requestEndTurn(): void {
    if (this.lab) return;
    const auto = new Set(this.autoCapturers().map((u) => u.uid));
    const idle = this.idleUnits().some((u) => !auto.has(u.uid));
    if (idle && this.time.now - this.endArmedAt > CONFIRM_MS) {
      this.endArmedAt = this.time.now;
      return showToast(t('confirmEndTurn'));
    }
    void this.enemyTurn();
  }

  private async enemyTurn(): Promise<void> {
    if (this.phase === 'busy' || this.ended) return;
    const m = this.match;
    this.clearUndo();
    this.abandonSelection();
    const saved = this.saveCamera();
    this.phase = 'busy';
    // [CAMBIO] Ayudante: las unidades en automatico que siguen sin usar cumplen su mision.
    for (const ev of assistTurn(this.s, Math.random)) {
      await this.playEvents([ev]);
      if (m !== this.match || this.checkEnd()) return;
    }
    // [CAMBIO] Las unidades que se han quedado sin usar encima de un edificio capturable siguen capturando.
    for (const u of this.autoCapturers()) {
      const b = buildingAt(this.s, u.x, u.y)!;
      const r = capture(this.s, u);
      if (r) await this.playEvents([captureEvent(u, b, r)]);
      if (m !== this.match || this.checkEnd()) return;
    }
    this.enemyPlaying = true;
    // Velocidad "instantanea" del enemigo: como si se pulsara Enter para acelerar desde el principio.
    this.fastForward = settings.speedEnemy === 'instant';
    this.refresh();
    showBanner(`${t('day')} ${this.s.day}`, t('enemyTurn'), 'red');
    await this.wait(this.fastForward ? 300 : 900);
    if (m !== this.match) return;
    // Semilla propia para este turno: asi se puede repetir exactamente (menu > Repetir turno enemigo).
    const before = serialize(this.s);
    const seed = randomSeed();
    for (const ev of aiTurn(this.s, seededRng(seed))) {
      await this.playEvents([ev]);
      if (m !== this.match || this.checkEnd()) return;
    }
    this.lastEnemy = { before, seed };
    const report = endRound(this.s);
    sampleArmy(this.s);
    if (settings.autosave && writeSave(serialize(this.s))) this.savedThisGame = true;
    this.enemyPlaying = false;
    if (this.checkEnd()) return;
    this.backToPlayer(saved);
    showBanner(`${t('day')} ${this.s.day}`, t('yourTurn'), 'blue');
    this.showReport(report);
    await this.runOrders();
  }

  /** Resumen de la ronda (ingresos, reparaciones...) y "+vida" sobre las unidades curadas que se ven. */
  private showReport(r: RoundReport): void {
    const mine = r.healed.filter((h) => h.team === 0);
    const lines: ReportLineVM[] = [{ icon: 'ui/dinero', text: `+${fmtNum(r.income[0])} ${t('reportIncome')}`, tone: 'gold' }];
    if (r.upkeep[0] > 0) lines.push({ icon: 'ui/dinero', text: `−${fmtNum(r.upkeep[0])} ${t('reportUpkeep')}`, tone: 'red' });
    if (mine.length)
      lines.push({ icon: 'ui/vida', text: `${mine.length} ${t(mine.length === 1 ? 'reportHealed1' : 'reportHealed')}`, tone: 'green' });
    if (r.weather) {
      const to = r.weather.to;
      lines.push({ icon: '', weather: WEATHER.ids[to]!, text: `${weatherLabel(to)}: ${weatherEffectsText(to)}`, tone: 'plain' });
    }
    showReport(`${t('day')} ${this.s.day}`, lines);
    if (this.fastForward) return;
    mine.forEach((h, i) => {
      const u = unitById(this.s, h.uid);
      if (!u || u.carrier !== null || !this.visibleToPlayer(u)) return;
      const c = center(u);
      void floatText(this, this.view, { x: c.x, y: c.y - 6 }, `+${h.amount}`, PAL_CSS.green, 1100 + i * 90);
    });
  }

  /** Milisegundos por casilla al mover, segun la velocidad elegida (tuyas o del enemigo). */
  private stepMs(): number {
    const sp = this.enemyPlaying ? settings.speedEnemy : settings.speedOwn;
    return sp === 'instant' ? 1 : sp === 'fast' ? Math.round(STEP_MS / 2) : STEP_MS;
  }

  private wait(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve) => this.time.delayedCall(ms, resolve));
  }

  private visibleToPlayer(p: Pos): boolean {
    return !!this.vis[p.x]?.[p.y];
  }

  /** Lleva la camara a una casilla si no se ve bien, y espera a que llegue. */
  private async lookAt(p: Pos): Promise<void> {
    if (!this.visibleToPlayer(p) || this.view.isOnScreen(p, 2)) return;
    this.view.ensureVisible(p, 4);
    await this.wait(this.fastForward ? 0 : 180);
  }

  /** Anima eventos (movimiento, ataque...) y vuelve a dibujar al terminar. */
  private async playEvents(events: GameEvent[], ghostKey?: string | null): Promise<void> {
    const prevPhase = this.phase;
    if (!this.enemyPlaying && !this.replaying && settings.speedOwn === 'instant') this.fastForward = true;
    this.phase = 'busy';
    this.view.placeCursor(false);
    this.refreshHud();
    for (const ev of events) {
      // Lo que tiene consecuencias (combates, capturas, compras...) ya no se puede deshacer con Ctrl+Z.
      if (!this.enemyPlaying && ev.kind !== 'move') this.clearUndo();
      if (!this.replaying) recordEvent(this.s, ev, this.enemyPlaying ? 1 : 0);
      if (!this.replaying && !this.enemyPlaying) this.tutorialEvents.push(ev);
      if (ev.kind === 'attack') this.lastAt = { ...ev.target };
      else if (ev.kind === 'capture') this.lastAt = { ...ev.at };
      switch (ev.kind) {
        case 'move':
        case 'merge':
        case 'load': {
          const seen = ev.path.some((p) => this.visibleToPlayer(p));
          if (!seen || this.fastForward) break;
          const u = unitById(this.s, ev.uid);
          const fallback = 'r_' + UNIT_ART[unitById(this.s, (ev as { into?: number }).into ?? -1)?.type ?? 0];
          const tex =
            ghostKey ?? (u ? unitKey(this.textures, this.s, { ...u, x: ev.path[0]!.x, y: ev.path[0]!.y, active: true }) : fallback);
          if (!tex) break;
          // La IA solo se ve donde hay vision (no se delatan sus unidades en la niebla).
          const mover = unitById(this.s, ev.uid) ?? unitById(this.s, (ev as { into?: number }).into ?? -1);
          const showAll = mover?.team === 0;
          await this.animatePath(ev.uid, tex, ev.path, showAll);
          if (ev.kind === 'move' && ev.ambush && !this.fastForward) {
            this.refresh();
            const end = ev.path[ev.path.length - 1]!;
            if (showAll || this.visibleToPlayer(end)) {
              const c = center(end);
              void tileFlash(this, this.view, ev.ambush, PAL.red);
              await floatText(this, this.view, { x: c.x, y: c.y - 6 }, t('fxAmbush'), PAL_CSS.redSoft);
            }
          }
          break;
        }
        case 'attack':
          await this.playAttack(ev);
          break;
        case 'capture':
          this.refresh();
          if (!this.fastForward && this.visibleToPlayer(ev.at)) {
            await this.lookAt(ev.at);
            const c = center(ev.at);
            void burst(this, this.view, c, { colors: COLORS.gold, count: 12, radius: 22 });
            void tileFlash(this, this.view, ev.at, PAL.gold);
            const partial = ev.left !== undefined && ev.left > 0;
            await floatText(
              this,
              this.view,
              { x: c.x, y: c.y - 6 },
              partial ? `${ev.left}/${ev.total}` : ev.owner === null ? t('fxNeutral') : t('fxCaptured'),
              partial ? '#fff1a8' : '#ffd447',
            );
          }
          break;
        case 'spawn':
          this.refresh();
          if (!this.fastForward && this.visibleToPlayer(ev.at)) {
            await this.lookAt(ev.at);
            const sp = this.view.unitSprite(ev.uid);
            void burst(
              this,
              this.view,
              { x: center(ev.at).x, y: ev.at.y * TILE + TILE - 2 },
              { colors: COLORS.smoke, count: 8, radius: 14, size: 2 },
            );
            await Promise.all([tileFlash(this, this.view, ev.at, 0xffffff), sp ? blink(this, sp, 2, 60) : Promise.resolve()]);
          }
          break;
        case 'ability':
          await this.playAbility(ev);
          break;
        default:
          break;
      }
    }
    this.hidden.clear();
    if (this.phase === 'busy' && prevPhase !== 'busy') {
      this.phase = prevPhase;
      // Acelerar una animacion propia no debe saltarse las siguientes.
      this.fastForward = false;
    }
    this.refresh();
  }

  private async animatePath(uid: number, texKey: string, path: Pos[], showAll = true): Promise<void> {
    const visiblePart = showAll ? path : path.filter((p) => this.visibleToPlayer(p));
    await this.lookAt(visiblePart[visiblePart.length - 1] ?? path[path.length - 1]!);
    this.hidden.add(uid);
    this.refresh();
    this.view.placeCursor(false);
    const img = this.view.ghost(texKey, path[0]!);
    img.setVisible(showAll || this.visibleToPlayer(path[0]!));
    // [CAMBIO] Mira hacia donde va (los dibujos rojos miran a la izquierda: ver faceFlip), arranca y
    // frena suave, la infanteria da un saltito por casilla y los vehiculos levantan polvo.
    // Al unirse o subir a un transporte la unidad ya no esta en el estado: entonces no se sabe su tipo.
    const mover = unitById(this.s, uid);
    const team = mover?.team ?? (this.enemyPlaying ? 1 : 0);
    const foot = mover ? Movement.of(mover.type) === MoveType.FOOT : false;
    const air = mover ? Movement.of(mover.type) === MoveType.AIR : false;
    let facing = this.view.facingOf(uid, team);
    img.setFlipX(faceFlip(team, facing));
    const n = path.length - 1;
    for (let i = 1; i < path.length; i++) {
      const p = path[i]!;
      const shown = showAll || this.visibleToPlayer(p);
      if (!shown && !img.visible) {
        img.setPosition(p.x * TILE + TILE / 2, (p.y + 1) * TILE);
        continue;
      }
      const prev = path[i - 1]!;
      const dir = facingToward(prev, p);
      if (dir) {
        facing = dir;
        img.setFlipX(faceFlip(team, dir));
      }
      const from = { x: prev.x * TILE + TILE / 2, y: (prev.y + 1) * TILE };
      const to = { x: p.x * TILE + TILE / 2, y: (p.y + 1) * TILE };
      const ms = this.fastForward ? 1 : this.stepMs() * (n === 1 ? 1.25 : i === 1 || i === n ? 1.15 : 0.9);
      const ease = n === 1 ? 'Sine.easeInOut' : i === 1 ? 'Quad.easeIn' : i === n ? 'Quad.easeOut' : 'Linear';
      if (!this.fastForward && !foot && !air && img.visible && this.stepMs() > 1)
        void burst(
          this,
          this.view,
          { x: from.x - (to.x - from.x) * 0.3, y: from.y - 3 },
          { colors: COLORS.smoke, count: 2, radius: 6, size: 2, duration: 240 },
        );
      const prog = { t: 0 };
      await new Promise<void>((resolve) =>
        this.tweens.add({
          targets: prog,
          t: 1,
          duration: ms,
          ease,
          onUpdate: () => {
            const hop = foot ? Math.round(Math.sin(prog.t * Math.PI) * 3) : 0;
            img.setPosition(Math.round(from.x + (to.x - from.x) * prog.t), Math.round(from.y + (to.y - from.y) * prog.t) - hop);
          },
          onComplete: () => resolve(),
        }),
      );
      img.setPosition(to.x, to.y);
      img.setVisible(shown);
    }
    this.view.face(uid, facing);
    // Al llegar, un poco de polvo (solo las unidades propias, que se ven siempre).
    const last = path[path.length - 1]!;
    if (showAll && path.length > 1 && !this.fastForward && this.stepMs() > 1) {
      void burst(
        this,
        this.view,
        { x: last.x * TILE + TILE / 2, y: (last.y + 1) * TILE - 3 },
        { colors: COLORS.smoke, count: 6, radius: 10, size: 2, duration: 260 },
      );
    }
    img.destroy();
    this.hidden.delete(uid);
  }

  /** Milisegundos de un efecto de combate a la velocidad elegida (0 si es instantanea). */
  private combatMs(ms: number): number {
    const step = this.stepMs();
    return this.fastForward || step <= 1 ? 0 : Math.round((ms * step) / STEP_MS);
  }

  /**
   * Combate, paso a paso para que se entienda: mira sobre el objetivo, disparo desde el atacante,
   * daño con la barra de vida bajando y, si lo hay, el contraataque igual pero al reves. Mientras
   * tanto el panel de combate (abajo) enseña las dos unidades, su acierto y sus vidas.
   */
  private async playAttack(ev: Extract<GameEvent, { kind: 'attack' }>): Promise<void> {
    const seen = this.visibleToPlayer(ev.target) && !this.fastForward;
    // Lo que habia dibujado antes del ataque (la victima puede haber desaparecido ya del estado).
    const victimKey = this.view.unitKeyAt(ev.target);
    // El atacante puede haber caido en el contraataque: su posicion y su imagen, de lo dibujado.
    const atkSprite = this.view.unitSprite(ev.attacker);
    const atkPos = atkSprite ? { x: Math.round(atkSprite.x / TILE), y: Math.round(atkSprite.y / TILE) } : null;
    const atkKey = atkPos ? this.view.unitKeyAt(atkPos) : null;
    const atkSeen = !!atkPos && this.visibleToPlayer(atkPos);
    const info = ev.combat;
    const atkTeam = info?.attackerTeam ?? unitById(this.s, ev.attacker)?.team ?? (this.enemyPlaying ? 1 : 0);
    const defTeam = (1 - atkTeam) as 0 | 1;
    const atkType = info?.attackerType ?? unitById(this.s, ev.attacker)?.type ?? 0;
    const defType = info?.defenderType ?? unitAt(this.s, ev.target.x, ev.target.y)?.type ?? 0;
    const victim = unitAt(this.s, ev.target.x, ev.target.y);
    const victimUid = victim?.uid ?? null;
    const teamColor = (team: number) => (team === 0 ? PAL.blue : PAL.red);
    // Velocidad de las animaciones (Opciones): 1 = normal.
    const k = this.combatMs(1000) / 1000;
    const panelId = Date.now();
    const panel = (stage: 'start' | 'hit' | 'counter') => {
      if (!seen) return;
      const vm = combatVM(ev, stage, { attacker: atkKey, defender: victimKey }, { attacker: atkSeen, defender: true }, panelId);
      if (vm) ui.set({ combat: vm });
    };

    // 1. Apuntar y disparar: el atacante mira al objetivo, retrocede con el fogonazo y sale el proyectil.
    if (seen) {
      panel('start');
      await this.lookAt(ev.target);
      if (atkPos) this.faceTo(ev.attacker, atkPos, ev.target);
      if (victimUid !== null && atkPos) this.faceTo(victimUid, ev.target, atkPos);
      void targetMark(this, this.view, ev.target, teamColor(atkTeam), this.combatMs(150));
      if (atkSprite && atkPos && atkSeen) await this.fire(atkSprite, atkPos, ev.target, shotKind(atkType, defType), k);
      else await this.wait(this.combatMs(150));
    }
    // 2. Impacto.
    if (seen) {
      panel('hit');
      await this.hitFx(victimUid, ev.target, ev.damage, ev.killed, victimKey, defTeam, info?.defenderLife ?? null, k);
    } else this.refresh();
    // 3. Contraataque: el defensor responde enseguida, con el mismo lenguaje que el ataque.
    if (ev.counter !== undefined && atkPos && (ev.counter > 0 || ev.attackerKilled) && !this.fastForward && this.visibleToPlayer(atkPos)) {
      const vs = victimUid !== null ? this.view.unitSprite(victimUid) : null;
      void tag(this, this.view, ev.target, t('fxCounter'), PAL_CSS.gold, k);
      await this.wait(this.combatMs(80));
      if (vs) await this.fire(vs, ev.target, atkPos, shotKind(defType, atkType), k);
      panel('counter');
      await this.hitFx(ev.attacker, atkPos, ev.counter, !!ev.attackerKilled, atkKey, atkTeam, info?.attackerLife ?? null, k);
    }
    // [CAMBIO] Botin: quien destruye cobra parte del precio (dorado, como el dinero de Ambar).
    const lootAt = ev.killed ? ev.target : ev.attackerKilled ? atkPos : null;
    if (ev.bounty && lootAt && !this.fastForward && this.visibleToPlayer(lootAt)) {
      const c = center(lootAt);
      void floatText(this, this.view, { x: c.x, y: c.y - 16 }, `+${fmtNum(ev.bounty)}`, PAL_CSS.gold);
      this.refreshHud();
    }
    if (seen && info) await this.wait(this.combatMs(200));
    ui.set({ combat: null });
  }

  /** Gira una unidad para que mire de `from` hacia `to` (si no estan en la misma columna). */
  private faceTo(uid: number, from: Pos, to: Pos): void {
    const dir = facingToward(from, to);
    if (dir) this.view.face(uid, dir);
  }

  /** Disparo: retroceso y fogonazo a la vez, y el proyectil hasta el impacto. */
  private async fire(sprite: Phaser.GameObjects.Container, from: Pos, to: Pos, kind: ShotKind, k: number): Promise<void> {
    void recoil(this, sprite, from, to, k);
    void muzzleFlash(this, this.view, from, to, k);
    await projectile(this, this.view, kind, from, to, k);
  }

  /**
   * Impacto en `at`: destello en la unidad, explosion, numero de daño y su barra de vida bajando. Si cae,
   * restos y una marca de quemado en el suelo hasta el turno siguiente.
   */
  private async hitFx(
    uid: number | null,
    at: Pos,
    damage: number,
    killed: boolean,
    victimKey: string | null,
    team: 0 | 1,
    lifeBefore: number | null,
    k: number,
  ): Promise<void> {
    const live = unitAt(this.s, at.x, at.y);
    // Si ha caido ya no esta en el estado: una copia de su dibujo, mirando hacia donde miraba.
    let sprite: Phaser.GameObjects.Container | Phaser.GameObjects.Image | null = live ? this.view.unitSprite(live.uid) : null;
    if (!live && killed && victimKey) {
      const ghost = this.view.ghost(victimKey, at);
      ghost.setFlipX(faceFlip(team, uid !== null ? this.view.facingOf(uid, team) : baseFacing(team)));
      sprite = ghost;
    }
    void hitFlash(this, sprite, k);
    void popNumber(this, this.view, at, damage > 0 ? `-${damage}` : t('fxMiss'), damage > 0 ? PAL_CSS.red : '#cfe8ff', k);
    const bar =
      lifeBefore !== null
        ? lifeBar(this, this.view, at, lifeBefore, lifeBefore - damage, team === 0 ? PAL.blue : PAL.red, this.combatMs(220))
        : Promise.resolve();
    await impact(this, this.view, at, killed, k);
    if (killed) {
      if (sprite && !live) sprite.destroy();
      this.view.scorch(at, this.s.day);
      await debris(this, this.view, at, team, k);
    }
    this.refresh();
    // La barra sigue bajando mientras pasa lo siguiente (no se espera).
    void bar;
  }
}
