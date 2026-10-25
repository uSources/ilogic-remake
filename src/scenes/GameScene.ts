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
  endRound,
  expectedDamage,
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
import { SCREEN_H, SCREEN_W, TILE } from '../layout';
import { playMusic } from '../music';
import { buildingLabel, settings, t, terrainLabel, unitLabel, type TextKey } from '../settings';
import { deleteSave, readSave, writeSave } from '../storage';
import { Banner, HintLine, InfoCard, PopMenu, Toast, Tooltip, TopBar, type InfoSpec, type MenuItem } from '../ui/hud';
import { MapView, type HighlightKind } from '../ui/mapView';
import { buildingKey, unitIconKey, unitKey } from '../ui/sprites';
import { C, FONT } from '../ui/theme';

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
  private menuItems: MenuItem[] = [];
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

  // Interfaz
  private uiRoot!: Phaser.GameObjects.Container;
  private topBar!: TopBar;
  private info!: InfoCard;
  private menu!: PopMenu;
  private tooltip!: Tooltip;
  private banner!: Banner;
  private toast!: Toast;
  private hint!: HintLine;
  private clouds: ({ img: Phaser.GameObjects.Image; y: number } | null)[] = [];
  private cloudLayer!: Phaser.GameObjects.Container;
  private cloudAcc = 0;

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

    // Interfaz en una camara aparte (sin zoom ni desplazamiento).
    this.cloudLayer = this.add.container(0, 0);
    this.clouds = Array(8).fill(null);
    this.hint = new HintLine(this);
    this.info = new InfoCard(this);
    this.topBar = new TopBar(this);
    this.menu = new PopMenu(this);
    this.tooltip = new Tooltip(this);
    this.toast = new Toast(this);
    this.banner = new Banner(this);
    this.uiRoot = this.add.container(0, 0, [
      this.cloudLayer,
      this.hint.root,
      this.info.root,
      this.topBar.root,
      this.menu.root,
      this.tooltip.root,
      this.toast.root,
      this.banner.root,
    ]);
    const uiCam = this.cameras.add(0, 0, SCREEN_W, SCREEN_H);
    uiCam.ignore(this.view.root);
    this.cameras.main.ignore(this.uiRoot);

    // Cursor y camara sobre la Base del jugador.
    const hq = this.s.buildings.find((b) => b.owner === 0 && b.type === HQ) ?? { x: 0, y: 0 };
    this.view.cursor = { x: hq.x, y: hq.y };
    this.view.centerOn(hq, true);

    this.setupInput();
    playMusic(this, 'game');
    this.refresh();
    this.banner.show(`${t('day')} ${this.s.day}`, t('yourTurn'), C.blue);
    if (this.corruptSave) this.toast.show(t('badSave'), 3500);
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
    this.view.render(this.s, { vis: this.vis, highlights: this.highlights(), hidden: this.hidden, path: this.previewPath() });
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
    this.topBar.draw(this.s.funds[0], this.s.day, !this.enemyPlaying);
    const c = this.view.cursor;
    const cs = this.view.screenOf(c);
    this.info.show(this.phase === 'busy' ? null : this.infoAt(c), cs);
    // Bocadillo de vista previa de ataque.
    if (this.phase === 'attack' && this.sel) {
      const targetUid = this.attackSet.get(key(c));
      const target = targetUid !== undefined ? unitById(this.s, targetUid) : undefined;
      if (target) {
        const dmg = Math.round(expectedDamage(this.s, this.sel, target));
        const after = Math.max(0, target.life - dmg);
        this.tooltip.show(
          [
            { text: t('expected'), color: C.muted, size: 13 },
            { text: `~${dmg}  (${target.life} → ${after})`, color: C.redText, size: 17 },
            ...(after === 0 ? [{ text: t('kill'), color: C.gold, size: 13 }] : []),
          ],
          cs,
        );
      } else this.tooltip.hide();
    } else this.tooltip.hide();
    // Menu emergente.
    if (MENU_PHASES.includes(this.phase)) this.showMenu();
    else if (this.menu.visible) this.menu.hide();
    this.hint.set(this.phase === 'busy' ? (this.enemyPlaying ? t('skip') : '') : this.phase === 'map' ? t('hintMap') : '');
  }

  private infoAt(p: Pos): InfoSpec | null {
    const s = this.s;
    const terr = s.map[p.x]![p.y]!;
    const b = buildingAt(s, p.x, p.y);
    const vis = this.vis[p.x]![p.y]!;
    const prot = TERRAIN.protection[terr]! * (b ? BUILDING.protection[b.type]! : 1);
    const spec: InfoSpec = { terrain: { name: terrainLabel(terr), defense: Math.round((1 - prot) * 100) } };
    if (b) {
      const known = vis || b.owner === 0;
      const owner = !known ? t('unknown') : b.owner === 0 ? t('you') : b.owner === 1 ? t('enemy') : t('neutral');
      const color = !known ? C.muted : b.owner === 0 ? C.blueText : b.owner === 1 ? C.redText : C.muted;
      spec.building = { name: buildingLabel(b.type), owner, ownerColor: color, income: BUILDING.earning[b.type]!, icon: buildingKey(this.textures, s, b, vis) };
    }
    const u = unitAt(s, p.x, p.y);
    const shown = u && vis && !this.hidden.has(u.uid) ? u : this.phase !== 'map' && this.sel && samePos(this.sel, p) ? this.sel : undefined;
    if (shown) {
      const T = shown.type;
      const cargo = cargoUnits(s, shown).map((c) => unitLabel(c.type));
      spec.unit = {
        icon: unitKey(this.textures, s, { ...shown, active: shown.team === 1 || shown.active }),
        name: unitLabel(T),
        teamColor: shown.team === 0 ? C.blueText : C.redText,
        teamLabel: shown.team === 0 ? t('you') : t('enemy'),
        life: shown.life,
        fuel: UNIT.maxfuel[T]! > 0 ? { now: shown.fuel, max: UNIT.maxfuel[T]! } : undefined,
        ammo: UNIT.maxammo[T]! > 0 ? { now: shown.ammo, max: UNIT.maxammo[T]! } : undefined,
        stats: this.unitDetail(T),
        cargo: UNIT.maxcarry[T]! > 0 ? `${t('cargo')}: ${cargo.length ? cargo.join(', ') : t('empty')}` : undefined,
      };
    }
    return spec;
  }

  private unitDetail(type: number): string {
    const range = UNIT.alcance[type]! === 0 ? t('noAttack') : `${t('range')} ${UNIT.minalc[type]! + 1}-${UNIT.alcance[type]}`;
    return `${t('move')} ${UNIT.mover[type]} · ${range} · ${t('vision')} ${UNIT.vision[type]}`;
  }

  /** Construye y muestra el menu emergente de la fase actual. */
  private showMenu(): void {
    let items: MenuItem[] = [];
    let anchor = this.view.screenOf(this.view.cursor);
    let title: string | undefined;
    switch (this.phase) {
      case 'gameMenu':
        items = GAME_MENU.map((k) => ({
          label: t(k as TextKey),
          color: k === 'endTurn' ? C.blueText : k === 'quit' ? C.redText : undefined,
          hint: k === 'endTurn' ? 'E' : undefined,
        }));
        break;
      case 'unitMenu':
        if (this.sel) anchor = this.view.screenOf(this.sel);
        items = this.actions.map((a) => ({
          label: t(a as TextKey),
          color: a === 'delete' ? C.redText : a === 'attack' ? '#ffd0d1' : undefined,
        }));
        title = this.sel ? unitLabel(this.sel.type) : undefined;
        break;
      case 'buy':
        if (this.selBuilding) {
          anchor = this.view.screenOf(this.selBuilding);
          title = `${buildingLabel(this.selBuilding.type)} · ${t('funds')} ${this.s.funds[0]}`;
        }
        items = [
          { label: t('cancel') },
          ...this.buy.map((o) => ({
            label: unitLabel(o.type),
            hint: `${o.cost}`,
            icon: unitIconKey(o.type, o.affordable),
            disabled: !o.affordable,
            detail:
              this.unitDetail(o.type) +
              (o.affordable ? '' : ` · ${teamUnits(this.s, 0).length >= MAX_UNITS ? t('unitLimit') : t('cantAfford')}`),
          })),
        ];
        break;
      case 'unloadPick': {
        if (this.sel) anchor = this.view.screenOf(this.sel);
        const cargo = this.sel ? this.sel.cargo.map((uid) => unitById(this.s, uid)) : [];
        items = [
          { label: t('back') },
          ...cargo.map((u) =>
            u
              ? { label: unitLabel(u.type), icon: unitIconKey(u.type, true), hint: `${u.life}`, disabled: !unloadTiles(this.s, this.sel!, u).length }
              : { label: t('empty'), disabled: true },
          ),
        ];
        title = t('unload');
        break;
      }
    }
    this.menuItems = items;
    this.menu.show(items, anchor, this.menuSel, title);
  }

  // -------------------------------------------------------------------------
  // Entrada
  // -------------------------------------------------------------------------

  private setupInput(): void {
    this.input.mouse?.disableContextMenu();
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
      case 'Equal':
      case 'NumpadAdd':
        this.view.zoomStep(1, SCREEN_W / 2, SCREEN_H / 2);
        return this.refreshHud();
      case 'Minus':
      case 'NumpadSubtract':
        this.view.zoomStep(-1, SCREEN_W / 2, SCREEN_H / 2);
        return this.refreshHud();
    }
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
    this.menu.select(i);
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
    this.topBar.setHover(this.phase !== 'busy' ? this.topBar.hit(p.x, p.y) : null);
    if (this.phase === 'busy' || p.wasTouch) return;
    const mi = this.menu.hit(p.x, p.y);
    if (mi !== null) return this.selectMenu(mi);
    if (this.menu.contains(p.x, p.y) || this.topBar.hit(p.x, p.y)) return;
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
    // Barra superior.
    const tb = this.topBar.hit(p.x, p.y);
    if (tb === 'endTurn') return void this.enemyTurn();
    if (tb === 'menu') return this.openGameMenu();
    // Menu emergente.
    const mi = this.menu.hit(p.x, p.y);
    if (mi !== null) {
      if (p.wasTouch && mi !== this.menuSel) return this.selectMenu(mi);
      this.menuSel = mi;
      return this.accept();
    }
    if (this.menu.contains(p.x, p.y)) return;
    // Clic fuera de un menu: cerrarlo (en el de acciones, deshace el movimiento).
    if (MENU_PHASES.includes(this.phase)) return this.back();
    const tile = this.view.tileAtScreen(p.x, p.y);
    if (!tile) return;
    // Tactil: primer toque mueve el cursor, segundo toque confirma.
    if (p.wasTouch && !samePos(tile, this.view.cursor)) return this.moveCursorTo(tile, false);
    this.moveCursorTo(tile, false);
    this.accept();
  }

  override update(_time: number, delta: number): void {
    this.cloudAcc += delta;
    while (this.cloudAcc >= 100) {
      this.cloudAcc -= 100;
      this.stepClouds();
    }
    // Desplazar el mapa con el raton en el borde de la pantalla.
    const p = this.input.activePointer;
    if (!this.pointerInside || this.ended || this.drag || p.wasTouch || MENU_PHASES.includes(this.phase)) return;
    if (this.topBar.hit(p.x, p.y) || this.menu.contains(p.x, p.y)) return;
    const edge = 14;
    const dx = p.x < edge ? -1 : p.x > SCREEN_W - edge ? 1 : 0;
    const dy = p.y < edge ? -1 : p.y > SCREEN_H - edge ? 1 : 0;
    if (dx || dy) {
      const speed = (delta / 1000) * 520;
      this.view.scrollBy(dx * speed, dy * speed);
      this.refreshHud();
    }
  }

  private stepClouds(): void {
    let born = false;
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i];
      if (c) {
        c.y += 0.5;
        c.img.y = Math.floor(c.y);
        if (c.y >= SCREEN_H) {
          c.img.destroy();
          this.clouds[i] = null;
        }
      } else if (!born && Math.random() < 0.0005) {
        born = true;
        const img = this.add
          .image(Math.floor(Math.random() * (SCREEN_W - 64)), -128, `cl_${Math.floor(Math.random() * 5)}`)
          .setOrigin(0)
          .setDisplaySize(64, 128)
          .setAlpha(0.8);
        this.cloudLayer.add(img);
        this.clouds[i] = { img, y: -128 };
      }
    }
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
          this.toast.show(t('saved'));
        }
        return this.toMap();
      case 'endTurn':
        return void this.enemyTurn();
      case 'quit':
        // [CAMBIO] en el original Esc abandonaba la partida al instante, sin confirmar.
        if (this.time.now - this.quitArmedAt < 2500) return this.quitToMenu();
        this.quitArmedAt = this.time.now;
        return this.toast.show(t('confirmQuit'), 2200);
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
          return this.toast.show(t('confirmDelete'));
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
    if (!opt.affordable) return this.toast.show(teamUnits(this.s, 0).length >= MAX_UNITS ? t('unitLimit') : t('cantAfford'));
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
    const idle = this.s.units.some((u) => u.team === 0 && u.active && u.carrier === null);
    if (idle && this.time.now - this.endArmedAt > 2500) {
      this.endArmedAt = this.time.now;
      return this.toast.show(t('confirmEndTurn'), 2200);
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
    this.banner.show(`${t('day')} ${this.s.day}`, t('enemyTurn'), C.red);
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
    cam.pan(saved.x, saved.y, 300, 'Sine.easeInOut', true);
    this.phase = 'map';
    this.inputLockUntil = this.time.now + 350;
    this.refresh();
    this.banner.show(`${t('day')} ${this.s.day}`, t('yourTurn'), C.blue);
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
    this.menu.hide();
    this.tooltip.hide();
    this.info.show(null, { x: 0, y: 0 });
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
    if (this.phase === 'busy' && prevPhase !== 'busy') this.phase = prevPhase;
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
      .text(cx, cy - 8, `-${damage}`, { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#ff5a4f', stroke: '#000000', strokeThickness: 4, resolution: 2 })
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
