/**
 * [CAMBIO] Acciones y ordenes sobre lo elegido (estilo RTS). Que acciones hay y cuando valen lo dice el
 * registro de controls/actions.ts; aqui se cumplen (`run`): clic derecho, menu de ordenes de una
 * casilla, bandeja, teclas de orden y ordenes con destino (fase 'target'). Tambien el puntero del
 * raton, que enseña lo que haria el clic derecho.
 */
import type Phaser from 'phaser';
import { commandNow, commandOrder } from '../../core/ai';
import { Movement, UNIT } from '../../core/data';
import { inBounds } from '../../core/geom';
import { canWalk, unitAt, unitById, wait } from '../../core/rules';
import {
  cancelCommand,
  commandBlock,
  disbandSquad,
  formSquad,
  giveCommand,
  leaveSquad,
  pruneSquads,
  squadById,
  SQUAD_NAME_MAX,
} from '../../core/squads';
import type { CommandKind, GameEvent, GameState, Pos, Unit } from '../../core/types';
import { cursorFor, exactSquad, menuActions, type ActionCtx, type ActionId, type CursorKind } from '../../controls/actions';
import { showToast, ui } from '../../hud/store';
import { t } from '../../settings';
import { cursorCss } from '../../ui/cursors';
import { commandLabel } from '../../ui/hudModels';
import type { MapView } from '../../ui/mapView';
import type { GroupSelection } from './groupSelection';
import { CMD_OF, type Intent, type MoveUndo, type Phase } from './types';

/** De donde se abrio el menu de ordenes de una casilla (adonde vuelve al cancelar). */
export type OrderFrom = 'move' | 'unitMenu' | 'map';

/** Orden con destino que se esta dando (fase 'target', eligiendo casilla). */
export interface Ordering {
  kind: CommandKind;
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

export class Orders {
  ordering: Ordering | null = null;
  menu: OrderMenu | null = null;
  private pointerKind: CursorKind = 'default';

  constructor(private readonly h: OrderHost) {}

  /**
   * Unidades a las que iria una orden dada ahora con un gesto en el mapa: la elegida (moviendo o en su
   * menu) o el grupo elegido (recuadro, «Elegir varias» o una escuadra). null si no hay ninguna.
   */
  subjects(): { units: Unit[]; from: OrderFrom } | null {
    const h = this.h;
    if ((h.phase === 'move' || h.phase === 'unitMenu') && h.sel && h.sel.team === 0) return { units: [h.sel], from: h.phase };
    if ((h.phase === 'map' || h.phase === 'groupMenu') && h.selection.group.size) {
      const units = h.selection.groupUnits();
      return units.length ? { units, from: 'map' } : null;
    }
    return null;
  }

  /**
   * [CAMBIO] Teclas de orden con lo elegido (Q atacar, C capturar, G defender, X quitar): las tres
   * primeras piden luego la casilla (clic o Enter), como "A + clic" en los juegos de estrategia.
   */
  orderKey(order: 'attack' | 'capture' | 'defend' | 'cancel'): void {
    const h = this.h;
    const who = this.subjects();
    if (!who) return showToast(t('groupNone'));
    if (order === 'cancel') {
      cancelCommand(h.state, who.units);
      showToast(t('orderCancelled'));
      if (h.phase === 'groupMenu') h.toMap();
      return h.refresh();
    }
    if (order === 'capture' && !who.units.some((u) => UNIT.cancapt[u.type])) return showToast(t('orderNoCapturer'));
    if (h.phase === 'groupMenu') h.phase = 'map';
    this.start(order, who.units, who.from !== 'map');
  }

  /**
   * Empieza a dar una orden a estas unidades: ahora se elige la casilla en el mapa (fase 'target').
   * `single` = una unidad desde su menu (su movimiento de este turno, si lo hay, se mantiene).
   */
  start(kind: CommandKind, units: Unit[], single: boolean): void {
    const h = this.h;
    if (!units.length) return h.toMap();
    this.ordering = { kind, uids: units.map((u) => u.uid), single };
    h.phase = 'target';
    showToast(t('orderPick'));
    h.refresh();
  }

  /**
   * [CAMBIO] Menu de ordenes en una casilla (sin pasar por el menu de la unidad): solo las que tienen
   * sentido ahi (commandChoices). false si no hay unidad ni grupo elegido: el gesto hace lo de siempre.
   */
  openMenu(at: Pos): boolean {
    const h = this.h;
    const who = this.subjects();
    if (!who || !inBounds(at.x, at.y)) return false;
    const ctx = this.ctx(at);
    const ids = ctx ? menuActions(ctx).map((a) => a.id) : [];
    if (!ids.length) return false;
    this.menu = { at: { x: at.x, y: at.y }, uids: who.units.map((u) => u.uid), ids, from: who.from };
    h.selection.multi = false;
    h.stopInspect();
    h.view.cursor = { x: at.x, y: at.y };
    h.menuSel = 0;
    h.phase = 'orderMenu';
    h.refresh();
    return true;
  }

  /** Accion elegida en el menu de la casilla. */
  async acceptMenu(): Promise<void> {
    const h = this.h;
    const o = this.menu;
    const id = h.menuPick() as ActionId | undefined;
    if (!o || !id || !o.ids.includes(id)) return h.back();
    const from = o.from;
    this.menu = null;
    // Vuelve a la fase de la que salio el menu, que es donde la accion tiene sentido.
    if (from === 'move' && h.sel) h.selectUnit(h.sel);
    else if (from === 'unitMenu' && h.sel) h.phase = 'unitMenu';
    else h.phase = 'map';
    return this.run(id, o.at, { queue: false, single: from !== 'map' });
  }

  /** Contexto de las acciones en `at` (null: menu sin casilla) con lo elegido ahora. */
  ctx(at: Pos | null): ActionCtx | null {
    const h = this.h;
    const s = h.state;
    const units = this.subjects()?.units ?? h.selection.units();
    if (!units.length) return null;
    const e = at ? unitAt(s, at.x, at.y) : undefined;
    const enemyHere = !!e && e.team !== 0 && e.carrier === null && h.visible(e);
    const ctx: ActionCtx = { s, units, at: at ? { x: at.x, y: at.y } : null, enemyHere };
    if (at && h.phase === 'move' && h.sel && units.length === 1 && units[0]!.uid === h.sel.uid) {
      const it = h.intentAt(at);
      ctx.intent = it.kind;
      ctx.intentCapture = it.kind === 'move' && it.capture;
      ctx.farOk = it.kind === 'none' && !unitAt(s, at.x, at.y) && canWalk(s, at.x, at.y, Movement.of(h.sel.type));
    }
    return ctx;
  }

  /**
   * Cumplir una accion del registro. `queue` (Mayusculas + clic derecho): atacar, capturar o mover
   * quedan como orden (se cumplen al terminar el turno) sin mover nada ahora. `single`: viene del
   * menu de una unidad elegida (la orden respeta lo ya movido, ver place).
   */
  async run(id: ActionId, at: Pos | null, opts: { queue: boolean; single?: boolean } = { queue: false }): Promise<void> {
    const h = this.h;
    const s = h.state;
    const units = this.subjects()?.units ?? h.selection.units();
    if (!units.length) return;
    const one = h.phase === 'move' && h.sel && units.length === 1 ? h.sel : null;
    if (opts.queue && at && (id === 'attack' || id === 'capture' || id === 'move' || id === 'go')) {
      // Orden sin gastar el turno: atacar/capturar alli, o ir y quedarse (defender).
      const kind = id === 'attack' ? 'attack' : id === 'capture' ? 'capture' : 'defend';
      if (commandBlock(s, kind, at, units)) return;
      giveCommand(s, units, kind, at);
      showToast(`${commandLabel(kind)} · ${units.length}`);
      if (one) h.toMap();
      return h.refresh();
    }
    switch (id) {
      case 'attack':
      case 'capture':
      case 'merge':
      case 'load':
      case 'move':
        if (!at) return;
        if (one) {
          h.moveCursorTo(at, false);
          return h.commit(at, { drop: id === 'capture' });
        }
        if (id === 'move') {
          h.moveCursorTo(at, false);
          return h.groupMove(at);
        }
        // Grupo: atacar o capturar alli es una orden que empiezan ya las que pueden.
        this.ordering = { kind: id === 'attack' ? 'attack' : 'capture', uids: units.map((u) => u.uid), single: false };
        return this.place(at);
      case 'go':
        if (at && one) return h.giveOrder(one, at);
        return;
      case 'cmdAttack':
      case 'cmdCapture':
      case 'cmdDefend': {
        const kind = CMD_OF[id]!;
        const single = opts.single ?? !!one;
        if (!at) return this.start(kind, units, single);
        this.ordering = { kind, uids: units.map((u) => u.uid), single };
        return this.place(at);
      }
      case 'cmdCancel':
        cancelCommand(s, units);
        showToast(t('orderCancelled'));
        break;
      case 'squadForm': {
        const q = formSquad(s, units);
        if (q) showToast(`${t('squadFormed')}: ${q.name}${q.key ? ` · ${t('squadKeyHint')} ${q.key}` : ''}`);
        break;
      }
      case 'squadLeave':
        for (const u of units) leaveSquad(s, u);
        pruneSquads(s);
        break;
      case 'squadRename': {
        const q = exactSquad(s, units);
        if (q !== null) ui.set({ rename: { id: q, name: squadById(s, q)?.name ?? '', max: SQUAD_NAME_MAX } });
        break;
      }
      case 'squadDisband': {
        const q = exactSquad(s, units);
        if (q !== null) disbandSquad(s, q);
        break;
      }
      default:
        break;
    }
    if (h.phase === 'groupMenu' || h.phase === 'orderMenu') h.toMap();
    h.refresh();
  }

  /** Casilla elegida para la orden: se da, y las que aun no se han movido la empiezan ya. */
  async place(c: Pos): Promise<void> {
    const h = this.h;
    const s = h.state;
    const o = this.ordering;
    if (!o) return h.toMap();
    const units = o.uids.map((uid) => unitById(s, uid)).filter((u): u is Unit => !!u);
    const block = commandBlock(s, o.kind, c, units);
    if (block) return showToast(t(block === 'noBuilding' ? 'orderNoBuilding' : 'orderNoCapturer'));
    this.ordering = null;
    giveCommand(s, units, o.kind, c);
    // Una unidad movida este turno: lo movido cuenta y espera; la orden empieza el turno que viene.
    const sel = o.single ? units[0] : undefined;
    const undo = h.undo;
    const moved = !!sel && !!undo && undo.uid === sel.uid && (undo.x !== sel.x || undo.y !== sel.y);
    if (sel && undo && undo.uid === sel.uid && !moved) {
      sel.canMove = true;
      sel.canFire = undo.canFire;
    }
    if (moved) wait(sel);
    h.clearUndo();
    // [CAMBIO] El grupo sigue elegido (como en los juegos de estrategia en tiempo real).
    h.toMap();
    showToast(t('orderGiven'));
    const now = units.filter((u) => u.active && u.canMove && u.carrier === null);
    if (now.length) await this.playCommands(now);
    else h.afterAction();
  }

  /** Las unidades empiezan ya su orden (animado); luego esperan. */
  private async playCommands(units: Unit[]): Promise<void> {
    const h = this.h;
    const m = h.match;
    h.phase = 'busy';
    h.refresh();
    // [CAMBIO] En formacion: primero las mas retrasadas, y las demas se colocan con ellas.
    for (const u of commandOrder(h.state, units)) {
      for (const ev of commandNow(h.state, u.uid, Math.random)) {
        await h.play([ev]);
        if (m !== h.match || h.checkEnd()) return;
      }
      if (unitById(h.state, u.uid)) wait(u);
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
