/**
 * [CAMBIO] Acciones y ordenes sobre lo elegido (estilo RTS). Que acciones hay y cuando valen lo dice el
 * registro de controls/actions.ts, y que hace cada una, ACTION_RUNNERS (actionRunners.ts). Aqui se
 * eligen y se cumplen: clic derecho, menu de ordenes de una casilla, bandeja, teclas de orden y
 * ordenes con destino (fase 'target'). Tambien el puntero del raton, que enseña lo que haria el clic
 * derecho.
 */
import type Phaser from 'phaser';
import { startStandingOrder, standingOrderPlayOrder } from '../../core/ai';
import { movementOf, canWalk, unitAt, unitById, wait } from '../../core/rules';
import { isCapturer } from '../../core/util/predicates';
import { isOnBoard } from '../../core/mapGrid';
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
  readonly selected: Unit | null;
  /** Donde estaba la unidad elegida antes de moverla este turno. */
  readonly undo: MoveUndo | null;
  readonly selection: GroupSelection;
  /** Id de la opcion señalada del menu de bocadillo. */
  menuPick(): string | undefined;
  stopInspect(): void;
  visible(pos: Pos): boolean;
  intentAt(tile: Pos): Intent;
  toMap(): void;
  back(): void;
  refresh(): void;
  selectUnit(unit: Unit): void;
  moveCursorTo(pos: Pos, follow: boolean): void;
  commit(tile: Pos, options?: { drop?: boolean; wait?: boolean }): Promise<void>;
  groupMove(goal: Pos): Promise<void>;
  giveTravel(unit: Unit, goal: Pos): Promise<void>;
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

  constructor(private readonly host: OrderHost) {
    this.runHost = {
      get state() {
        return host.state;
      },
      moveCursorTo: (pos, follow) => host.moveCursorTo(pos, follow),
      commit: (at, options) => host.commit(at, options),
      groupMove: (goal) => host.groupMove(goal),
      giveTravel: (unit, goal) => host.giveTravel(unit, goal),
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
    const host = this.host;
    const withSelectedUnit = host.phase === 'move' || host.phase === 'unitMenu';
    if (withSelectedUnit && host.selected && isPlayer(host.selected)) return { units: [host.selected], from: host.phase as OrderFrom };
    const withGroup = host.phase === 'map' || host.phase === 'groupMenu';
    if (!withGroup || !host.selection.group.size) return null;
    const units = host.selection.groupUnits();
    return units.length ? { units, from: 'map' } : null;
  }

  /** Lo elegido ahora: lo que dice subjects o, si no hay, la seleccion. */
  private chosenUnits(): Unit[] {
    return this.subjects()?.units ?? this.host.selection.units();
  }

  /**
   * [CAMBIO] Teclas de orden con lo elegido (Q atacar, C capturar, G defender, X quitar): las tres
   * primeras piden luego la casilla (clic o Enter), como "A + clic" en los juegos de estrategia.
   */
  orderKey(order: OrderKey): void {
    const host = this.host;
    const who = this.subjects();
    if (!who) return showToast(t('groupNone'));
    if (order === 'cancel') return this.cancelOrdersOf(who.units);
    if (order === 'capture' && !who.units.some((unit) => isCapturer(host.state, unit))) return showToast(t('orderNoCapturer'));
    if (host.phase === 'groupMenu') host.phase = 'map';
    this.start(order, who.units, who.from !== 'map');
  }

  private cancelOrdersOf(units: Unit[]): void {
    const host = this.host;
    cancelStandingOrder(host.state, units);
    showToast(t('orderCancelled'));
    if (host.phase === 'groupMenu') host.toMap();
    host.refresh();
  }

  /**
   * Empieza a dar una orden a estas unidades: ahora se elige la casilla en el mapa (fase 'target').
   * `single` = una unidad desde su menu (su movimiento de este turno, si lo hay, se mantiene).
   */
  start(kind: StandingOrderKind, units: Unit[], single: boolean): void {
    const host = this.host;
    if (!units.length) return host.toMap();
    this.ordering = { kind, uids: uidsOf(units), single };
    host.phase = 'target';
    showToast(t('orderPick'));
    host.refresh();
  }

  /**
   * [CAMBIO] Menu de ordenes en una casilla (sin pasar por el menu de la unidad): solo las que tienen
   * sentido ahi (standingOrderChoices). false si no hay unidad ni grupo elegido: el gesto hace lo de siempre.
   */
  openMenu(at: Pos): boolean {
    const host = this.host;
    const who = this.subjects();
    if (!who || !isOnBoard(host.state, at)) return false;
    const context = this.ctx(at);
    const ids = context ? menuActions(context).map((action) => action.id) : [];
    if (!ids.length) return false;
    this.menu = { at: posOf(at), uids: uidsOf(who.units), ids, from: who.from };
    host.selection.multi = false;
    host.stopInspect();
    host.view.cursor = posOf(at);
    host.menuSel = 0;
    host.phase = 'orderMenu';
    host.refresh();
    return true;
  }

  /** Accion elegida en el menu de la casilla. */
  async acceptMenu(): Promise<void> {
    const host = this.host;
    const menu = this.menu;
    const id = host.menuPick() as ActionId | undefined;
    if (!menu || !id || !menu.ids.includes(id)) return host.back();
    this.menu = null;
    this.returnTo(menu.from);
    return this.run(id, menu.at, { queue: false, single: menu.from !== 'map' });
  }

  /** Vuelve a la fase de la que salio el menu, que es donde la accion tiene sentido. */
  private returnTo(from: OrderFrom): void {
    const host = this.host;
    if (from === 'move' && host.selected) host.selectUnit(host.selected);
    else if (from === 'unitMenu' && host.selected) host.phase = 'unitMenu';
    else host.phase = 'map';
  }

  /** Contexto de las acciones en `at` (null: menu sin casilla) con lo elegido ahora. */
  ctx(at: Pos | null): ActionCtx | null {
    const host = this.host;
    const s = host.state;
    const units = this.chosenUnits();
    if (!units.length) return null;
    const unitHere = at ? unitAt(s, at) : undefined;
    const enemyHere = !!unitHere && !isPlayer(unitHere) && unitHere.carrier === null && host.visible(unitHere);
    const context: ActionCtx = { s, units, at: at ? posOf(at) : null, enemyHere };
    const isSelectedUnit = host.phase === 'move' && host.selected && units.length === 1 && units[0]!.uid === host.selected.uid;
    if (at && isSelectedUnit) Object.assign(context, this.movingIntent(host.selected, at));
    return context;
  }

  /** Lo que la escena sabe de soltar la unidad elegida en `at` (ver ActionCtx.intent). */
  private movingIntent(unit: Unit, at: Pos): Pick<ActionCtx, 'intent' | 'intentCapture' | 'farOk'> {
    const s = this.host.state;
    const intent = this.host.intentAt(at);
    const isFreeWalkable = !unitAt(s, at) && canWalk(s, at, movementOf(s, unit));
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
  async run(id: ActionId, at: Pos | null, options: { queue: boolean; single?: boolean } = { queue: false }): Promise<void> {
    const host = this.host;
    const units = this.chosenUnits();
    if (!units.length) return;
    const moving = host.phase === 'move' && host.selected && units.length === 1 ? host.selected : null;
    const runner = ACTION_RUNNERS[id];
    if (options.queue && at && runner.queueAs) return this.queue(runner.queueAs, units, at, moving);
    return runner.run({ units, at, moving, fromUnitMenu: options.single }, this.runHost);
  }

  /** Orden sin gastar el turno: se cumple al terminarlo. */
  private queue(kind: StandingOrderKind, units: Unit[], at: Pos, moving: Unit | null): void {
    const host = this.host;
    if (standingOrderBlock(host.state, kind, at, units)) return;
    giveStandingOrder(host.state, units, kind, at);
    showToast(`${standingOrderLabel(kind)} · ${units.length}`);
    if (moving) host.toMap();
    host.refresh();
  }

  private closeMenuAndRefresh(): void {
    const host = this.host;
    if (host.phase === 'groupMenu' || host.phase === 'orderMenu') host.toMap();
    host.refresh();
  }

  /** Casilla elegida para la orden: se da, y las que aun no se han movido la empiezan ya. */
  async place(at: Pos): Promise<void> {
    const host = this.host;
    const s = host.state;
    const ordering = this.ordering;
    if (!ordering) return host.toMap();
    const units = ordering.uids.map((uid) => unitById(s, uid)).filter((unit): unit is Unit => !!unit);
    const block = standingOrderBlock(s, ordering.kind, at, units);
    if (block) return showToast(t(block === 'noBuilding' ? 'orderNoBuilding' : 'orderNoCapturer'));
    this.ordering = null;
    giveStandingOrder(s, units, ordering.kind, at);
    if (ordering.single && units[0]) this.keepThisTurnMove(units[0]);
    host.clearUndo();
    // [CAMBIO] El grupo sigue elegido (como en los juegos de estrategia en tiempo real).
    host.toMap();
    showToast(t('orderGiven'));
    const canStartNow = units.filter((unit) => unit.active && unit.canMove && unit.carrier === null);
    if (canStartNow.length) await this.playStandingOrders(canStartNow);
    else host.afterAction();
  }

  /**
   * Orden desde el menu de una unidad: si se movio este turno, lo movido cuenta y espera (la orden
   * empieza el turno que viene); si no se movio, vuelve a poder moverse para empezarla ya.
   */
  private keepThisTurnMove(unit: Unit): void {
    const undo = this.host.undo;
    if (!undo || undo.uid !== unit.uid) return;
    const moved = undo.x !== unit.x || undo.y !== unit.y;
    if (moved) return wait(unit);
    unit.canMove = true;
    unit.canFire = undo.canFire;
  }

  /** Las unidades empiezan ya su orden (animado); luego esperan. */
  private async playStandingOrders(units: Unit[]): Promise<void> {
    const host = this.host;
    const match = host.match;
    host.phase = 'busy';
    host.refresh();
    // [CAMBIO] En formacion: primero las mas retrasadas, y las demas se colocan con ellas.
    for (const unit of standingOrderPlayOrder(host.state, units)) {
      for (const event of startStandingOrder(host.state, unit.uid, Math.random)) {
        await host.play([event]);
        if (match !== host.match || host.checkEnd()) return;
      }
      if (unitById(host.state, unit.uid)) wait(unit);
    }
    pruneSquads(host.state);
    host.afterAction();
  }

  /** [CAMBIO] Puntero del raton segun lo que haria el clic derecho en esa casilla. */
  updatePointer(tile: Pos | null): void {
    const host = this.host;
    if (!tile || (host.phase !== 'map' && host.phase !== 'move')) return this.setPointer('default');
    const context = host.selection.units().length ? this.ctx(tile) : null;
    this.setPointer(context ? cursorFor(context) : 'default');
  }

  setPointer(kind: CursorKind): void {
    if (kind === this.pointerKind) return;
    this.pointerKind = kind;
    this.host.scene.game.canvas.style.cursor = cursorCss(kind);
  }
}
