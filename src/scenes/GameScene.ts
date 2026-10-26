import Phaser from 'phaser';
import { aiTurn } from '../core/ai';
import { BUILDING, HQ, MAP_H, MAP_W, MAX_UNITS, TERRAIN, UNIT, UNIT_NAMES } from '../core/data';
import { samePos } from '../core/geom';
import { generateGame } from '../core/mapgen';
import {
  attack,
  attackTargets,
  buildingAt,
  buyOptions,
  canBuyAt,
  capture,
  cargoUnits,
  combatForecast,
  endRound,
  load,
  loadTargets,
  merge,
  mergeTargets,
  moveRange,
  moveUnit,
  outcome,
  pathTo,
  removeUnit,
  spawn,
  supply,
  teamUnits,
  threatMap,
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
import type { Building, GameEvent, GameState, Pos, Unit } from '../core/types';
import { showBanner, showToast, ui, type ForecastVM, type IdleVM, type MenuItemVM, type MenuVM, type TileVM } from '../hud/store';
import { TILE } from '../layout';
import { playMusic } from '../music';
import { buildingLabel, settings, t, terrainLabel, unitLabel, type TextKey } from '../settings';
import { deleteSave, readSave, writeSave } from '../storage';
import { MapView, type HighlightKind } from '../ui/mapView';
import { buildingKey, terrainKey, unitIconKey, unitKey } from '../ui/sprites';

/**
 * Fases de la partida (equivalen a las del original, docs/SPEC-INTERFAZ.md §2):
 * map 3, gameMenu 4, unitMenu 5, buy 6, move 7, attack 8, unloadPick 11, unloadTile 12.
 * "busy" = animando o jugando la IA (no se acepta entrada).
 */
type Phase = 'map' | 'gameMenu' | 'unitMenu' | 'buy' | 'move' | 'attack' | 'unloadPick' | 'unloadTile' | 'busy';

type ActionKey = keyof UnitActions;
const ACTION_ORDER: ActionKey[] = ['attack', 'capture', 'unload', 'supply', 'wait', 'back', 'delete'];
type GameMenuKey = 'endTurn' | 'save' | 'quit' | 'resume';
const GAME_MENU: GameMenuKey[] = ['endTurn', 'save', 'resume', 'quit'];

interface MoveUndo {
  uid: number;
  x: number;
  y: number;
  fuel: number;
  canFire: boolean;
}

const key = (p: Pos) => `${p.x},${p.y}`;
const CURSOR_PHASES: Phase[] = ['map', 'move', 'attack', 'unloadTile'];
const MENU_PHASES: Phase[] = ['gameMenu', 'unitMenu', 'buy', 'unloadPick'];
const STEP_MS = 70;
const DRAG_THRESHOLD = 6;

export class GameScene extends Phaser.Scene {
  private s!: GameState;
  private view!: MapView;
  private phase: Phase = 'map';
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
  private lastScroll = { x: NaN, y: NaN, zoom: NaN };

  // Raton
  private pointerInside = false;
  private drag: { x: number; y: number; moved: boolean } | null = null;

  constructor() {
    super('Game');
  }

  init(data: { mode?: 'new' | 'load' }): void {
    this.phase = 'map';
    this.sel = null;
    this.selBuilding = null;
    this.undo = null;
    this.ended = false;
    this.enemyPlaying = false;
    this.fastForward = false;
    this.savedThisGame = false;
    this.fromSave = false;
    this.drag = null;
    this.hidden.clear();
    let state: GameState | null = null;
    if (data.mode === 'load') {
      const raw = readSave();
      state = raw ? deserialize(raw) : null;
      this.fromSave = !!state;
    }
    this.corruptSave = data.mode === 'load' && !state;
    if (this.corruptSave) deleteSave();
    this.s = state ?? generateGame();
  }

  create(): void {
    this.view = new MapView(this);
    this.view.buildTerrain(this.s);

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
      this.scale.off(Phaser.Scale.Events.RESIZE, onResize);
      ui.set({ menu: null, forecast: null, tile: null });
    });
    playMusic(this, 'game');
    ui.set({ screen: 'game', toast: null, banner: null, threat: this.threat });
    this.refresh();
    showBanner(`${t('day')} ${this.s.day}`, t('yourTurn'), 'blue');
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
      openGameMenu: () => {
        if (ready()) this.openGameMenu();
      },
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
    return this.s.units.filter((u) => u.team === 0 && u.active && u.carrier === null);
  }

  // -------------------------------------------------------------------------
  // Dibujado
  // -------------------------------------------------------------------------

  private highlights(): Map<string, HighlightKind> {
    const h = new Map<string, HighlightKind>();
    if (this.phase === 'move' && this.range) {
      for (let x = 0; x < MAP_W; x++)
        for (let y = 0; y < MAP_H; y++) if (this.range.steps[x]![y]! > 0) h.set(`${x},${y}`, 'move');
      for (const k of this.mergeSet.keys()) h.set(k, 'merge');
      for (const k of this.loadSet.keys()) h.set(k, 'load');
    } else if (this.phase === 'attack') {
      for (const k of this.attackSet.keys()) h.set(k, 'attack');
    } else if (this.phase === 'unloadTile') {
      for (const k of this.unloadSet) h.set(k, 'unload');
    }
    return h;
  }

  /** Camino previsto de la unidad seleccionada hasta el cursor. */
  private previewPath(): Pos[] | undefined {
    if (this.phase !== 'move' || !this.sel || !this.range) return undefined;
    const c = this.view.cursor;
    if (this.range.steps[c.x]![c.y]! > 0) return pathTo(this.range, this.sel, c);
    return undefined;
  }

  private refresh(): void {
    this.vis = visibility(this.s, 0);
    const threat = this.threat && !this.enemyPlaying ? threatMap(this.s, 1, 0) : null;
    this.view.render(this.s, { vis: this.vis, highlights: this.highlights(), hidden: this.hidden, path: this.previewPath(), threat });
    this.view.placeCursor(this.phase !== 'busy');
    this.refreshHud();
  }

  /** Solo cambia el cursor: no hace falta redibujar unidades, salvo el camino previsto. */
  private cursorMoved(): void {
    if (this.phase === 'move') this.refresh();
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
    ui.set({
      funds: s.funds[0],
      income: owned.reduce((sum, b) => sum + BUILDING.earning[b.type]!, 0),
      buildings: owned.length,
      day: s.day,
      turn: this.enemyPlaying ? 'enemy' : 'player',
      busy,
      tile: busy ? null : this.tileInfo(c),
      forecast: this.phase === 'attack' ? this.forecast(c) : null,
      menu: MENU_PHASES.includes(this.phase) ? this.buildMenu() : null,
      idle,
      hint: busy ? (this.enemyPlaying ? t('skip') : '') : this.phase === 'map' ? t('hintMap') : '',
    });
    const cam = this.cameras.main;
    this.lastScroll = { x: cam.scrollX, y: cam.scrollY, zoom: cam.zoom };
  }

  private forecast(c: Pos): ForecastVM | null {
    if (!this.sel) return null;
    const uid = this.attackSet.get(key(c));
    const target = uid !== undefined ? unitById(this.s, uid) : undefined;
    if (!target) return null;
    const f = combatForecast(this.s, this.sel, target);
    return {
      attackerIcon: unitKey(this.textures, this.s, { ...this.sel, active: true }),
      defenderIcon: unitKey(this.textures, this.s, target),
      low: f.low,
      high: f.high,
      expected: f.expected,
      lifeBefore: target.life,
      lifeAfter: f.lifeAfter,
      killChance: f.killChance,
      anchor: this.view.tileRectCss(target),
    };
  }

  private tileInfo(p: Pos): TileVM {
    const s = this.s;
    const terr = s.map[p.x]![p.y]!;
    const b = buildingAt(s, p.x, p.y);
    const vis = this.vis[p.x]![p.y]!;
    const prot = TERRAIN.protection[terr]! * (b ? BUILDING.protection[b.type]! : 1);
    const info: TileVM = { terrain: { key: terrainKey(terr), name: terrainLabel(terr), defense: Math.round((1 - prot) * 100) } };
    if (b) {
      const known = vis || b.owner === 0;
      info.building = {
        name: buildingLabel(b.type),
        owner: !known ? 'unknown' : b.owner === 0 ? 'you' : b.owner === 1 ? 'enemy' : 'neutral',
        income: BUILDING.earning[b.type]!,
        icon: buildingKey(this.textures, s, b, vis),
      };
    }
    const u = unitAt(s, p.x, p.y);
    const shown = u && vis && !this.hidden.has(u.uid) ? u : this.phase !== 'map' && this.sel && samePos(this.sel, p) ? this.sel : undefined;
    if (shown) {
      const T = shown.type;
      const cargo = cargoUnits(s, shown).map((c) => unitLabel(c.type));
      info.unit = {
        icon: unitKey(this.textures, s, { ...shown, active: shown.team === 1 || shown.active }),
        name: unitLabel(T),
        team: shown.team,
        life: shown.life,
        fuel: UNIT.maxfuel[T]! > 0 ? { now: shown.fuel, max: UNIT.maxfuel[T]! } : undefined,
        ammo: UNIT.maxammo[T]! > 0 ? { now: shown.ammo, max: UNIT.maxammo[T]! } : undefined,
        stats: this.unitDetail(T),
        cargo: UNIT.maxcarry[T]! > 0 ? `${t('cargo')}: ${cargo.length ? cargo.join(', ') : t('empty')}` : undefined,
      };
    }
    return info;
  }

  private unitDetail(type: number): string {
    const range = UNIT.alcance[type]! === 0 ? t('noAttack') : `${t('range')} ${UNIT.minalc[type]! + 1}–${UNIT.alcance[type]}`;
    return `${t('move')} ${UNIT.mover[type]} · ${range}`;
  }

  /** Menu emergente de la fase actual. */
  private buildMenu(): MenuVM {
    let items: MenuItemVM[] = [];
    let at: Pos = this.view.cursor;
    let title: string | undefined;
    let subtitle: string | undefined;
    let kind: MenuVM['kind'] = 'game';
    switch (this.phase) {
      case 'gameMenu':
        title = `${t('day')} ${this.s.day}`;
        items = GAME_MENU.map((k) => ({ id: k, label: t(k as TextKey), hint: k === 'endTurn' ? 'E' : k === 'resume' ? 'Esc' : undefined, danger: k === 'quit' }));
        break;
      case 'unitMenu':
        kind = 'unit';
        if (this.sel) at = this.sel;
        items = this.actions.map((a) => ({ id: a, label: t(a as TextKey), danger: a === 'delete' }));
        title = this.sel ? unitLabel(this.sel.type) : undefined;
        break;
      case 'buy':
        kind = 'buy';
        if (this.selBuilding) {
          at = this.selBuilding;
          title = buildingLabel(this.selBuilding.type);
          subtitle = `${t('funds')}: ${this.s.funds[0].toLocaleString(settings.lang === 'es' ? 'es-ES' : 'en-US')}`;
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
              `${this.unitDetail(o.type)} · ${t('vision')} ${UNIT.vision[o.type]}` +
              (o.affordable ? '' : ` · ${teamUnits(this.s, 0).length >= MAX_UNITS ? t('unitLimit') : t('cantAfford')}`),
          })),
        ];
        break;
      case 'unloadPick': {
        kind = 'cargo';
        if (this.sel) at = this.sel;
        const cargo = this.sel ? this.sel.cargo.map((uid) => unitById(this.s, uid)) : [];
        items = [
          { id: 'back', label: t('back'), icon: null },
          ...cargo.map((u, i) =>
            u
              ? { id: `c${i}`, label: unitLabel(u.type), icon: unitIconKey(u.type, true), hint: `${u.life}`, disabled: !unloadTiles(this.s, this.sel!, u).length }
              : { id: `c${i}`, label: t('empty'), icon: null, disabled: true },
          ),
        ];
        title = t('unload');
        break;
      }
    }
    this.menuItems = items;
    return { kind, title, subtitle, items, selected: this.menuSel, anchor: this.view.tileRectCss(at) };
  }

  // -------------------------------------------------------------------------
  // Entrada
  // -------------------------------------------------------------------------

  private setupInput(): void {
    this.input.mouse?.disableContextMenu();
    // Que el navegador no use estas teclas (Tab cambia el foco, Espacio desplaza la pagina...).
    this.input.keyboard!.addCapture('TAB,SPACE,UP,DOWN,LEFT,RIGHT,BACKSPACE');
    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => this.onKey(e));
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => this.onPointerMove(p));
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.onPointerDown(p));
    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => this.onPointerUp(p));
    this.input.on(Phaser.Input.Events.GAME_OUT, () => (this.pointerInside = false));
    this.input.on(Phaser.Input.Events.POINTER_WHEEL, (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (this.ended) return;
      this.view.zoomStep(dy < 0 ? 1 : -1, p.x, p.y);
      this.time.delayedCall(0, () => this.refreshHud());
    });
  }

  private onKey(e: KeyboardEvent): void {
    if (this.ended) return;
    if (this.phase === 'busy') {
      if (['Enter', 'NumpadEnter', 'Space'].includes(e.code)) this.fastForward = true;
      return;
    }
    switch (e.code) {
      case 'ArrowUp':
      case 'KeyW':
      case 'Numpad8':
        return this.direction(0, -1);
      case 'ArrowDown':
      case 'KeyS':
      case 'Numpad2':
        return this.direction(0, 1);
      case 'ArrowLeft':
      case 'KeyA':
      case 'Numpad4':
        return this.direction(-1, 0);
      case 'ArrowRight':
      case 'KeyD':
      case 'Numpad6':
        return this.direction(1, 0);
      case 'Enter':
      case 'NumpadEnter':
      case 'Space':
        e.preventDefault();
        if (this.time.now < this.inputLockUntil || e.repeat) return;
        return this.accept();
      case 'Escape':
      case 'Backspace':
        return this.back();
      case 'KeyE':
        if (this.phase === 'map' || this.phase === 'gameMenu') this.requestEndTurn();
        return;
      case 'KeyT':
        return this.toggleThreat();
      case 'Tab':
        if (this.phase === 'map') this.nextIdle();
        return;
      case 'Equal':
      case 'NumpadAdd':
        this.zoomKey(1);
        return this.refreshHud();
      case 'Minus':
      case 'NumpadSubtract':
        this.zoomKey(-1);
        return this.refreshHud();
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

  private onPointerMove(p: Phaser.Input.Pointer): void {
    this.pointerInside = true;
    if (this.ended) return;
    // Arrastrar el mapa.
    if (this.drag && p.isDown) {
      const dx = p.x - this.drag.x,
        dy = p.y - this.drag.y;
      if (this.drag.moved || Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        this.drag.moved = true;
        this.view.scrollBy(-dx, -dy);
        this.drag.x = p.x;
        this.drag.y = p.y;
        this.refreshHud();
        return;
      }
    }
    if (this.phase === 'busy' || p.wasTouch) return;
    const tile = this.view.tileAtScreen(p.x, p.y);
    if (tile && CURSOR_PHASES.includes(this.phase)) this.moveCursorTo(tile, false);
  }

  private onPointerDown(p: Phaser.Input.Pointer): void {
    if (this.ended) return;
    if (this.phase === 'busy') {
      this.fastForward = true;
      return;
    }
    if (p.rightButtonDown()) return this.back();
    this.drag = { x: p.x, y: p.y, moved: false };
  }

  private onPointerUp(p: Phaser.Input.Pointer): void {
    const drag = this.drag;
    this.drag = null;
    if (this.ended || this.phase === 'busy' || p.rightButtonReleased() || !drag || drag.moved) return;
    if (this.time.now < this.inputLockUntil) return;
    // (La barra superior y los menus son HTML: sus clics no llegan aqui.)
    // Clic fuera de un menu: cerrarlo (en el de acciones, deshace el movimiento).
    if (MENU_PHASES.includes(this.phase)) return this.back();
    const tile = this.view.tileAtScreen(p.x, p.y);
    if (!tile) return;
    // Tactil: primer toque mueve el cursor, segundo toque confirma.
    if (p.wasTouch && !samePos(tile, this.view.cursor)) return this.moveCursorTo(tile, false);
    this.moveCursorTo(tile, false);
    this.accept();
  }

  override update(time: number, delta: number): void {
    this.view.tick(time, delta);
    // Desplazar el mapa con el raton en el borde de la pantalla.
    const p = this.input.activePointer;
    if (this.pointerInside && !this.ended && !this.drag && !p.wasTouch && !MENU_PHASES.includes(this.phase)) {
      const edge = 14 * (window.devicePixelRatio || 1);
      const dx = p.x < edge ? -1 : p.x > this.scale.width - edge ? 1 : 0;
      const dy = p.y < edge ? -1 : p.y > this.scale.height - edge ? 1 : 0;
      if (dx || dy) this.view.scrollBy(dx * delta * 0.9 * (window.devicePixelRatio || 1), dy * delta * 0.9 * (window.devicePixelRatio || 1));
    }
    // Si la camara se ha movido (arrastre, borde, paneo animado), recolocar los bocadillos.
    const cam = this.cameras.main;
    const l = this.lastScroll;
    if (cam.scrollX !== l.x || cam.scrollY !== l.y || cam.zoom !== l.zoom) this.refreshHud();
  }

  // -------------------------------------------------------------------------
  // Aceptar / atras
  // -------------------------------------------------------------------------

  private accept(): void {
    const c = this.view.cursor;
    switch (this.phase) {
      case 'map':
        return this.acceptMap(c);
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
    }
  }

  private back(): void {
    this.deleteArmed = false;
    switch (this.phase) {
      case 'map':
        return this.openGameMenu();
      case 'gameMenu':
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
    }
  }

  private toMap(): void {
    this.phase = 'map';
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
    this.openGameMenu();
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
    this.phase = 'move';
    this.refresh();
  }

  private acceptGameMenu(): void {
    switch (GAME_MENU[this.menuSel]) {
      case 'resume':
        return this.toMap();
      case 'save':
        if (writeSave(serialize(this.s))) {
          this.savedThisGame = true;
          showToast(t('saved'));
        }
        return this.toMap();
      case 'endTurn':
        return void this.enemyTurn();
      case 'quit':
        // [CAMBIO] en el original Esc abandonaba la partida al instante, sin confirmar.
        if (this.time.now - this.quitArmedAt < 2500) return this.quitToMenu();
        this.quitArmedAt = this.time.now;
        return showToast(t('confirmQuit'));
    }
  }

  private openUnitMenu(): void {
    if (!this.sel) return this.toMap();
    const av = unitActions(this.s, this.sel);
    // [CAMBIO] "Atras" siempre: deshace el movimiento (en el original no se podia).
    av.back = true;
    this.actions = ACTION_ORDER.filter((a) => av[a]);
    this.menuSel = 0;
    this.deleteArmed = false;
    this.phase = 'unitMenu';
    this.view.cursor = { x: this.sel.x, y: this.sel.y };
    this.refresh();
  }

  private undoMove(): void {
    const u = this.sel;
    if (!u) return this.toMap();
    if (this.undo && this.undo.uid === u.uid) {
      u.x = this.undo.x;
      u.y = this.undo.y;
      u.fuel = this.undo.fuel;
      u.canFire = this.undo.canFire;
      u.canMove = true;
      this.view.cursor = { x: u.x, y: u.y };
      return this.selectUnit(u);
    }
    this.toMap();
  }

  private async acceptMove(c: Pos): Promise<void> {
    const u = this.sel;
    if (!u || !this.range) return;
    const mergeUid = this.mergeSet.get(key(c));
    const loadUid = this.loadSet.get(key(c));
    if (mergeUid !== undefined) {
      const target = unitById(this.s, mergeUid)!;
      const ghost = unitKey(this.textures, this.s, u);
      const path = merge(this.s, u, target);
      if (path) await this.playEvents([{ kind: 'merge', uid: u.uid, into: target.uid, path }], ghost);
      return this.afterAction();
    }
    if (loadUid !== undefined) {
      const tr = unitById(this.s, loadUid)!;
      const ghost = unitKey(this.textures, this.s, u);
      const path = load(this.s, u, tr);
      if (path) await this.playEvents([{ kind: 'load', uid: u.uid, into: tr.uid, path }], ghost);
      return this.afterAction();
    }
    if (samePos(c, u)) return this.openUnitMenu();
    if (this.range.steps[c.x]![c.y]! > 0) {
      const snapshot: MoveUndo = { uid: u.uid, x: u.x, y: u.y, fuel: u.fuel, canFire: u.canFire };
      const ghost = unitKey(this.textures, this.s, u);
      const path = moveUnit(this.s, u, c, this.range);
      if (!path) return;
      this.range = null;
      await this.playEvents([{ kind: 'move', uid: u.uid, path }], ghost);
      this.undo = snapshot;
      return this.openUnitMenu();
    }
    this.toMap();
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
        capture(this.s, u);
        if (b) void this.playEvents([{ kind: 'capture', uid: u.uid, at: { x: b.x, y: b.y }, owner: b.owner }]).then(() => this.afterAction());
        else this.afterAction();
        return;
      }
      case 'unload':
        this.menuSel = 1;
        this.phase = 'unloadPick';
        return this.refresh();
      case 'supply':
        supply(this.s, u);
        return this.afterAction();
      case 'wait':
        wait(u);
        return this.afterAction();
      case 'back':
        return this.undoMove();
      case 'delete':
        // [CAMBIO] pedir confirmacion (en el original se borraba al instante).
        if (!this.deleteArmed) {
          this.deleteArmed = true;
          return showToast(t('confirmDelete'));
        }
        removeUnit(this.s, u.uid);
        return this.afterAction();
    }
  }

  private async acceptAttack(c: Pos): Promise<void> {
    const u = this.sel;
    const targetUid = this.attackSet.get(key(c));
    if (!u || targetUid === undefined) return this.openUnitMenu();
    const target = unitById(this.s, targetUid)!;
    const before = target.life;
    const dmg = attack(this.s, u, target, Math.random);
    await this.playEvents([{ kind: 'attack', attacker: u.uid, target: { x: c.x, y: c.y }, damage: dmg, killed: before - dmg <= 0 }]);
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
    if (unload(this.s, this.sel, this.passenger, c)) this.afterAction();
  }

  private acceptBuy(): void {
    if (this.menuSel === 0 || !this.selBuilding) return this.toMap();
    const opt = this.buy[this.menuSel - 1];
    if (!opt) return;
    if (!opt.affordable) return showToast(teamUnits(this.s, 0).length >= MAX_UNITS ? t('unitLimit') : t('cantAfford'));
    const b = this.selBuilding;
    const u = spawn(this.s, b, opt.type);
    if (u) void this.playEvents([{ kind: 'spawn', uid: u.uid, at: { x: b.x, y: b.y } }]).then(() => this.afterAction());
  }

  private afterAction(): void {
    if (this.checkEnd()) return;
    this.toMap();
  }

  private checkEnd(): boolean {
    const result = outcome(this.s);
    if (result === 'playing') return false;
    this.ended = true;
    this.phase = 'busy';
    // [CAMBIO] borrar el guardado de esta partida al terminarla (antes solo si se habia cargado).
    if (this.fromSave || this.savedThisGame) deleteSave();
    this.refresh();
    this.time.delayedCall(900, () => this.scene.start('End', { won: result === 'won' }));
    return true;
  }

  private quitToMenu(): void {
    this.ended = true;
    this.scene.start('Menu');
  }

  // -------------------------------------------------------------------------
  // Turno de la IA y animaciones
  // -------------------------------------------------------------------------

  /** Fin de turno con la tecla E: si quedan unidades sin usar, pedir que se pulse otra vez. */
  private requestEndTurn(): void {
    const idle = this.idleUnits().length > 0;
    if (idle && this.time.now - this.endArmedAt > 2500) {
      this.endArmedAt = this.time.now;
      return showToast(t('confirmEndTurn'));
    }
    void this.enemyTurn();
  }

  private async enemyTurn(): Promise<void> {
    if (this.phase === 'busy' || this.ended) return;
    this.abandonSelection();
    const cam = this.cameras.main;
    const saved = { x: cam.midPoint.x, y: cam.midPoint.y, cursor: { ...this.view.cursor } };
    this.phase = 'busy';
    this.enemyPlaying = true;
    this.fastForward = false;
    this.refresh();
    showBanner(`${t('day')} ${this.s.day}`, t('enemyTurn'), 'red');
    await this.wait(900);
    for (const ev of aiTurn(this.s, Math.random)) {
      await this.playEvents([ev]);
      if (this.checkEnd()) return;
    }
    endRound(this.s);
    if (settings.autosave && writeSave(serialize(this.s))) this.savedThisGame = true;
    this.enemyPlaying = false;
    if (this.checkEnd()) return;
    this.view.cursor = saved.cursor;
    this.fastForward = false;
    cam.pan(saved.x, saved.y, 300, 'Sine.easeInOut', true);
    this.phase = 'map';
    this.inputLockUntil = this.time.now + 350;
    this.refresh();
    showBanner(`${t('day')} ${this.s.day}`, t('yourTurn'), 'blue');
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
    this.phase = 'busy';
    this.view.placeCursor(false);
    this.refreshHud();
    for (const ev of events) {
      switch (ev.kind) {
        case 'move':
        case 'merge':
        case 'load': {
          const seen = ev.path.some((p) => this.visibleToPlayer(p));
          if (!seen || this.fastForward) break;
          const u = unitById(this.s, ev.uid);
          const fallback = 'r_' + UNIT_NAMES[unitById(this.s, (ev as { into?: number }).into ?? -1)?.type ?? 0];
          const tex = ghostKey ?? (u ? unitKey(this.textures, this.s, { ...u, x: ev.path[0]!.x, y: ev.path[0]!.y, active: true }) : fallback);
          if (!tex) break;
          // La IA solo se ve donde hay vision (no se delatan sus unidades en la niebla).
          const mover = unitById(this.s, ev.uid) ?? unitById(this.s, (ev as { into?: number }).into ?? -1);
          const showAll = mover?.team === 0;
          await this.animatePath(ev.uid, tex, ev.path, showAll);
          break;
        }
        case 'attack':
          this.refresh();
          if (this.visibleToPlayer(ev.target) && !this.fastForward) {
            await this.lookAt(ev.target);
            await this.attackFx(ev.target, ev.damage, ev.killed);
          }
          break;
        case 'capture':
        case 'spawn':
          this.refresh();
          if (!this.fastForward && this.visibleToPlayer(ev.at)) {
            await this.lookAt(ev.at);
            await this.flash(ev.at, ev.kind === 'capture' ? 0xf5c542 : 0xffffff);
          }
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
    for (let i = 1; i < path.length; i++) {
      const p = path[i]!;
      const shown = showAll || this.visibleToPlayer(p);
      if (!shown && !img.visible) {
        img.setPosition(p.x * TILE, (p.y + 1) * TILE);
        continue;
      }
      await new Promise<void>((resolve) =>
        this.tweens.add({ targets: img, x: p.x * TILE, y: (p.y + 1) * TILE, duration: this.fastForward ? 1 : STEP_MS, onComplete: () => resolve() }),
      );
      img.setVisible(shown);
    }
    img.destroy();
    this.hidden.delete(uid);
  }

  private async attackFx(at: Pos, damage: number, killed: boolean): Promise<void> {
    const cx = at.x * TILE + TILE / 2,
      cy = at.y * TILE + TILE / 2;
    const flash = this.add.rectangle(cx, cy, TILE, TILE, killed ? 0xff3020 : 0xffffff, 0.8);
    this.view.addFx(flash);
    this.cameras.main.shake(120, 0.004);
    const text = this.add
      .text(cx, cy - 8, `-${damage}`, { fontFamily: 'Silkscreen, monospace', fontSize: '16px', color: '#ff4d45', stroke: '#0b1220', strokeThickness: 4 })
      .setOrigin(0.5, 1);
    this.view.addFx(text);
    this.tweens.add({ targets: flash, alpha: 0, scale: 1.4, duration: 380 });
    await new Promise<void>((resolve) => this.tweens.add({ targets: text, y: cy - 30, alpha: 0, delay: 300, duration: 450, onComplete: () => resolve() }));
    flash.destroy();
    text.destroy();
  }

  private async flash(at: Pos, color: number): Promise<void> {
    const r = this.add.rectangle(at.x * TILE + TILE / 2, at.y * TILE + TILE / 2, TILE, TILE, color, 0.7);
    this.view.addFx(r);
    await new Promise<void>((resolve) => this.tweens.add({ targets: r, alpha: 0, scale: 1.5, duration: 320, onComplete: () => resolve() }));
    r.destroy();
  }
}
