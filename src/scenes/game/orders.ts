/**
 * [CAMBIO] Acciones y ordenes sobre lo elegido (estilo RTS). Que acciones hay y cuando valen lo dice el
 * registro de controls/actions.ts, y que hace cada una, ACTION_RUNNERS (actionRunners.ts). Aqui se
 * eligen y se cumplen: clic derecho, menu de ordenes de una casilla, bandeja, teclas de orden y
 * ordenes con destino (fase 'target'). Tambien el puntero del raton, que enseña lo que haria el clic
 * derecho.
 */
import type Phaser from 'phaser';
import { startStandingOrder, standingOrderPlayOrder } from '../../core/ai';
import { movementOf } from '../../core/rules';
import { isCapturer } from '../../core/util/predicates';
import { isOnBoard } from '../../core/mapGrid';
import { canWalk, unitAt, unitById, wait } from '../../core/rules';
import { cancelStandingOrder, standingOrderBlock, giveStandingOrder, pruneSquads } from '../../core/squads';
import type { StandingOrderKind, GameEvent, GameState, Pos, Unit } from '../../core/model';
import { cursorFor, menuActions, type ActionCtx, type ActionId, type CursorKind } from '../../controls/actions';
import { showToast } from '../../hud/store';
import { t } from '../../settings';
import { cursorCss } from '../../ui/cursors';
import { standingOrderLabel } from '../../ui/hudModels';
import type { MapView } from '../../ui/mapView';
import { ACTION_RUNNERS, type ActionRunHost } from './actionRunners';
import type { GroupSelection } from './groupSelection';
import type { Intent, MoveUndo, Phase } from './types';
import { posOf } from '../../core/geom';

/** De donde se abrio el menu de ordenes de una casilla (adonde vuelve al cancelar). */
export type OrderFrom = 'move' | 'unitMenu' | 'map';

/** Orden con destino que se esta dando (fase 'target', eligiendo casilla). */
export interface Ordering {
  kind: StandingOrderKind;
  uids: number[];
  /** Una unidad desde su menu: su movimiento de este turno, si lo hay, se mantiene. */
  single: boolean;
}

/** Menu de ordenes en una casilla (fase 'orderMenu'). */
export interface OrderMenu {
  at: Pos;
  uids: number[];
  ids: ActionId[];
  from: OrderFrom;
}

/** Tecla de orden con lo elegido (ver orderKey). */
export type OrderKey = 'attack' | 'capture' | 'defend' | 'cancel';

/** Lo que las ordenes necesitan de la escena. */
export interface OrderHost {
  readonly scene: Phaser.Scene;
  readonly view: MapView;
  readonly state: GameState;
  phase: Phase;
  /** Opcion señalada del menu de bocadillo. */
  menuSel: number;
  readonly match: number;
  /** La unidad elegida para moverla (o en su menu). */
  readonly sel: Unit | null;
  /** Donde estaba la unidad elegida antes de moverla este turno. */
  readonly undo: MoveUndo | null;
  readonly selection: GroupSelection;
  /** Id de la opcion señalada del menu de bocadillo. */
  menuPick(): string | undefined;
  stopInspect(): void;
  visible(p: Pos): boolean;
  intentAt(t: Pos): Intent;
  toMap(): void;
  back(): void;
  refresh(): void;
  selectUnit(u: Unit): void;
  moveCursorTo(p: Pos, follow: boolean): void;
  commit(t: Pos, opts?: { drop?: boolean; wait?: boolean }): Promise<void>;
  groupMove(goal: Pos): Promise<void>;
  giveOrder(u: Unit, goal: Pos): Promise<void>;
  clearUndo(): void;
  afterAction(): void;
  checkEnd(): boolean;
  play(events: GameEvent[]): Promise<void>;
}

const isPlayer = (unit: Unit) => unit.team === 0;
const uidsOf = (units: readonly Unit[]) => units.map((unit) => unit.uid);

export class Orders {
  ordering: Ordering | null = null;
  menu: OrderMenu | null = null;
  private pointerKind: CursorKind = 'default';
  /** Lo que las acciones del registro usan para cumplirse. */
  private readonly runHost: ActionRunHost;

  constructor(private readonly h: OrderHost) {
    this.runHost = {
      get state() {
        return h.state;
      },
      moveCursorTo: (p, follow) => h.moveCursorTo(p, follow),
      commit: (at, opts) => h.commit(at, opts),
      groupMove: (goal) => h.groupMove(goal),
      giveOrder: (unit, goal) => h.giveOrder(unit, goal),
      pickOrderTarget: (kind, units, fromUnitMenu) => this.start(kind, units, fromUnitMenu),
      placeOrder: (kind, units, fromUnitMenu, at) => {
        this.ordering = { kind, uids: uidsOf(units), single: fromUnitMenu };
        return this.place(at);
      },
      finish: () => this.closeMenuAndRefresh(),
    };
  }

  /**
   * Unidades a las que iria una orden dada ahora con un gesto en el mapa: la elegida (moviendo o en su
   * menu) o el grupo elegido (recuadro, «Elegir varias» o una escuadra). null si no hay ninguna.
   */
  subjects(): { units: Unit[]; from: OrderFrom } | null {
    const h = this.h;
    const withSelectedUnit = h.phase === 'move' || h.phase === 'unitMenu';
    if (withSelectedUnit && h.sel && isPlayer(h.sel)) return { units: [h.sel], from: h.phase as OrderFrom };
    const withGroup = h.phase === 'map' || h.phase === 'groupMenu';
    if (!withGroup || !h.selection.group.size) return null;
    const units = h.selection.groupUnits();
    return units.length ? { units, from: 'map' } : null;
  }

  /** Lo elegido ahora: lo que dice subjects o, si no hay, la seleccion. */
  private chosenUnits(): Unit[] {
    return this.subjects()?.units ?? this.h.selection.units();
  }

  /**
   * [CAMBIO] Teclas de orden con lo elegido (Q atacar, C capturar, G defender, X quitar): las tres
   * primeras piden luego la casilla (clic o Enter), como "A + clic" en los juegos de estrategia.
   */
  orderKey(order: OrderKey): void {
    const h = this.h;
    const who = this.subjects();
    if (!who) return showToast(t('groupNone'));
    if (order === 'cancel') return this.cancelOrdersOf(who.units);
    if (order === 'capture' && !who.units.some((unit) => isCapturer(h.state, unit))) return showToast(t('orderNoCapturer'));
    if (h.phase === 'groupMenu') h.phase = 'map';
    this.start(order, who.units, who.from !== 'map');
  }

  private cancelOrdersOf(units: Unit[]): void {
    const h = this.h;
    cancelStandingOrder(h.state, units);
    showToast(t('orderCancelled'));
    if (h.phase === 'groupMenu') h.toMap();
    h.refresh();
  }

  /**
   * Empieza a dar una orden a estas unidades: ahora se elige la casilla en el mapa (fase 'target').
   * `single` = una unidad desde su menu (su movimiento de este turno, si lo hay, se mantiene).
   */
  start(kind: StandingOrderKind, units: Unit[], single: boolean): void {
    const h = this.h;
    if (!units.length) return h.toMap();
    this.ordering = { kind, uids: uidsOf(units), single };
    h.phase = 'target';
    showToast(t('orderPick'));
    h.refresh();
  }

  /**
   * [CAMBIO] Menu de ordenes en una casilla (sin pasar por el menu de la unidad): solo las que tienen
   * sentido ahi (standingOrderChoices). false si no hay unidad ni grupo elegido: el gesto hace lo de siempre.
   */
  openMenu(at: Pos): boolean {
    const h = this.h;
    const who = this.subjects();
    if (!who || !isOnBoard(h.state, at)) return false;
    const ctx = this.ctx(at);
    const ids = ctx ? menuActions(ctx).map((action) => action.id) : [];
    if (!ids.length) return false;
    this.menu = { at: posOf(at), uids: uidsOf(who.units), ids, from: who.from };
    h.selection.multi = false;
    h.stopInspect();
    h.view.cursor = posOf(at);
    h.menuSel = 0;
    h.phase = 'orderMenu';
    h.refresh();
    return true;
  }

  /** Accion elegida en el menu de la casilla. */
  async acceptMenu(): Promise<void> {
    const h = this.h;
    const menu = this.menu;
    const id = h.menuPick() as ActionId | undefined;
    if (!menu || !id || !menu.ids.includes(id)) return h.back();
    this.menu = null;
    this.returnTo(menu.from);
    return this.run(id, menu.at, { queue: false, single: menu.from !== 'map' });
  }

  /** Vuelve a la fase de la que salio el menu, que es donde la accion tiene sentido. */
  private returnTo(from: OrderFrom): void {
    const h = this.h;
    if (from === 'move' && h.sel) h.selectUnit(h.sel);
    else if (from === 'unitMenu' && h.sel) h.phase = 'unitMenu';
    else h.phase = 'map';
  }

  /** Contexto de las acciones en `at` (null: menu sin casilla) con lo elegido ahora. */
  ctx(at: Pos | null): ActionCtx | null {
    const h = this.h;
    const s = h.state;
    const units = this.chosenUnits();
    if (!units.length) return null;
    const unitHere = at ? unitAt(s, at) : undefined;
    const enemyHere = !!unitHere && !isPlayer(unitHere) && unitHere.carrier === null && h.visible(unitHere);
    const ctx: ActionCtx = { s, units, at: at ? posOf(at) : null, enemyHere };
    const isSelectedUnit = h.phase === 'move' && h.sel && units.length === 1 && units[0]!.uid === h.sel.uid;
    if (at && isSelectedUnit) Object.assign(ctx, this.movingIntent(h.sel, at));
    return ctx;
  }

  /** Lo que la escena sabe de soltar la unidad elegida en `at` (ver ActionCtx.intent). */
  private movingIntent(unit: Unit, at: Pos): Pick<ActionCtx, 'intent' | 'intentCapture' | 'farOk'> {
    const s = this.h.state;
    const intent = this.h.intentAt(at);
    const isFreeWalkable = !unitAt(s, at) && canWalk(s, at, movementOf(s, unit.type));
    return {
      intent: intent.kind,
      intentCapture: intent.kind === 'move' && intent.capture,
      farOk: intent.kind === 'none' && isFreeWalkable,
    };
  }

  /**
   * Cumplir una accion del registro (lo que hace cada una esta en ACTION_RUNNERS). `queue`
   * (Mayusculas + clic derecho): atacar, capturar o mover quedan como orden (se cumplen al terminar
   * el turno) sin mover nada ahora. `single`: viene del menu de una unidad elegida (la orden respeta
   * lo ya movido, ver place).
   */
  async run(id: ActionId, at: Pos | null, opts: { queue: boolean; single?: boolean } = { queue: false }): Promise<void> {
    const h = this.h;
    const units = this.chosenUnits();
    if (!units.length) return;
    const moving = h.phase === 'move' && h.sel && units.length === 1 ? h.sel : null;
    const runner = ACTION_RUNNERS[id];
    if (opts.queue && at && runner.queueAs) return this.queue(runner.queueAs, units, at, moving);
    return runner.run({ units, at, moving, fromUnitMenu: opts.single }, this.runHost);
  }

  /** Orden sin gastar el turno: se cumple al terminarlo. */
  private queue(kind: StandingOrderKind, units: Unit[], at: Pos, moving: Unit | null): void {
    const h = this.h;
    if (standingOrderBlock(h.state, kind, at, units)) return;
    giveStandingOrder(h.state, units, kind, at);
    showToast(`${standingOrderLabel(kind)} · ${units.length}`);
    if (moving) h.toMap();
    h.refresh();
  }

  private closeMenuAndRefresh(): void {
    const h = this.h;
    if (h.phase === 'groupMenu' || h.phase === 'orderMenu') h.toMap();
    h.refresh();
  }

  /** Casilla elegida para la orden: se da, y las que aun no se han movido la empiezan ya. */
  async place(at: Pos): Promise<void> {
    const h = this.h;
    const s = h.state;
    const ordering = this.ordering;
    if (!ordering) return h.toMap();
    const units = ordering.uids.map((uid) => unitById(s, uid)).filter((unit): unit is Unit => !!unit);
    const block = standingOrderBlock(s, ordering.kind, at, units);
    if (block) return showToast(t(block === 'noBuilding' ? 'orderNoBuilding' : 'orderNoCapturer'));
    this.ordering = null;
    giveStandingOrder(s, units, ordering.kind, at);
    if (ordering.single && units[0]) this.keepThisTurnMove(units[0]);
    h.clearUndo();
    // [CAMBIO] El grupo sigue elegido (como en los juegos de estrategia en tiempo real).
    h.toMap();
    showToast(t('orderGiven'));
    const canStartNow = units.filter((unit) => unit.active && unit.canMove && unit.carrier === null);
    if (canStartNow.length) await this.playStandingOrders(canStartNow);
    else h.afterAction();
  }

  /**
   * Orden desde el menu de una unidad: si se movio este turno, lo movido cuenta y espera (la orden
   * empieza el turno que viene); si no se movio, vuelve a poder moverse para empezarla ya.
   */
  private keepThisTurnMove(unit: Unit): void {
    const undo = this.h.undo;
    if (!undo || undo.uid !== unit.uid) return;
    const moved = undo.x !== unit.x || undo.y !== unit.y;
    if (moved) return wait(unit);
    unit.canMove = true;
    unit.canFire = undo.canFire;
  }

  /** Las unidades empiezan ya su orden (animado); luego esperan. */
  private async playStandingOrders(units: Unit[]): Promise<void> {
    const h = this.h;
    const match = h.match;
    h.phase = 'busy';
    h.refresh();
    // [CAMBIO] En formacion: primero las mas retrasadas, y las demas se colocan con ellas.
    for (const unit of standingOrderPlayOrder(h.state, units)) {
      for (const event of startStandingOrder(h.state, unit.uid, Math.random)) {
        await h.play([event]);
        if (match !== h.match || h.checkEnd()) return;
      }
      if (unitById(h.state, unit.uid)) wait(unit);
    }
    pruneSquads(h.state);
    h.afterAction();
  }

  /** [CAMBIO] Puntero del raton segun lo que haria el clic derecho en esa casilla. */
  updatePointer(tile: Pos | null): void {
    const h = this.h;
    if (!tile || (h.phase !== 'map' && h.phase !== 'move')) return this.setPointer('default');
    const ctx = h.selection.units().length ? this.ctx(tile) : null;
    this.setPointer(ctx ? cursorFor(ctx) : 'default');
  }

  setPointer(kind: CursorKind): void {
    if (kind === this.pointerKind) return;
    this.pointerKind = kind;
    this.h.scene.game.canvas.style.cursor = cursorCss(kind);
  }
}
