/**
 * Mover las unidades del jugador: elegir una (MoveSession), soltarla en una casilla (mover, atacar,
 * unirse, subir), ordenes de varios turnos, mover un grupo y deshacer (Atras en su menu y Ctrl+Z).
 */
import type Phaser from 'phaser';
import { manhattan, samePos } from '../../core/geom';
import { closestStep } from '../../core/orders';
import {
  attackEvent,
  canCapture,
  load,
  merge,
  moveEvent,
  moveRange,
  moveUnit,
  stepToward,
  unitActions,
  unitById,
  visibility,
  wait,
} from '../../core/rules';
import { deserialize, serialize } from '../../core/save';
import type { GameEvent, GameState, Pos, Unit } from '../../core/types';
import { showToast } from '../../hud/store';
import { settings, t } from '../../settings';
import type { MapView } from '../../ui/mapView';
import { unitKey } from '../../ui/sprites';
import type { GroupSelection } from './groupSelection';
import { MoveSession } from './moveSession';
import type { Intent, MoveUndo, Phase } from './types';

/** Lo que mover necesita de la escena. */
export interface MoveHost {
  readonly scene: Phaser.Scene;
  readonly view: MapView;
  /** La partida (Ctrl+Z la cambia por la de antes). */
  state: GameState;
  phase: Phase;
  readonly ended: boolean;
  readonly selection: GroupSelection;
  visible(p: Pos): boolean;
  play(events: GameEvent[], ghostKey?: string | null): Promise<void>;
  toMap(): void;
  refresh(): void;
  afterAction(): void;
  openUnitMenu(): void;
  /** Capturar ya con la unidad elegida, como al elegirlo en su menu. */
  captureNow(): void;
}

/** Como confirmar un movimiento: `drop`, se ha soltado arrastrando; `wait`, mover y esperar. */
export interface CommitOptions {
  drop?: boolean;
  wait?: boolean;
}

/** Uids de los enemigos que se ven ahora (para saber si un movimiento ha descubierto a alguien). */
function visibleEnemyUids(s: GameState): string {
  const vis = visibility(s, 0);
  return s.units
    .filter((unit) => unit.team === 1 && unit.carrier === null && vis[unit.x]![unit.y])
    .map((unit) => unit.uid)
    .sort((a, b) => a - b)
    .join(',');
}

/** Sin nada mas que hacer tras moverse (para «Esperar sola» al soltar). */
function hasNothingElseToDo(s: GameState, unit: Unit): boolean {
  const can = unitActions(s, unit);
  return !can.attack && !can.capture && !can.unload && !can.supply;
}

export class UnitMoves {
  /** La unidad elegida y lo calculado al elegirla (null en el mapa). */
  session: MoveSession | null = null;
  /** Ultimo movimiento confirmado (para el doble clic: mover y esperar). */
  lastCommit: { at: Pos; time: number } | null = null;
  /** Estados anteriores para deshacer movimientos sin consecuencias (Ctrl+Z). */
  private undoStack: string[] = [];

  constructor(private readonly h: MoveHost) {}

  /** Partida nueva. */
  reset(): void {
    this.session = null;
    this.lastCommit = null;
    this.undoStack = [];
  }

  /** La unidad elegida para moverla (o en su menu). */
  get selected(): Unit | null {
    return this.session?.unit ?? null;
  }

  /** Vuelta al mapa: ya no hay unidad elegida. */
  deselect(): void {
    this.session = null;
  }

  /** Elegir una unidad: a moverla o, si ya se ha movido este turno, directamente a sus acciones. */
  select(unit: Unit): void {
    const h = this.h;
    if (!unit.canMove) {
      this.session = MoveSession.alreadyMoved(unit);
      return h.openUnitMenu();
    }
    this.session = MoveSession.toMove(h.state, unit);
    h.phase = 'move';
    this.followCursor(h.view.cursor);
    h.refresh();
  }

  /** El cursor pasa por una casilla: el camino trazado la sigue. */
  followCursor(tile: Pos): void {
    this.session?.followCursor(this.h.state, tile);
  }

  /** Que pasaria al soltar (o pulsar) la unidad elegida en una casilla. */
  intentAt(tile: Pos): Intent {
    return this.session ? this.session.intentAt(this.h.state, tile, (p) => this.h.visible(p)) : { kind: 'none' };
  }

  /** Camino de la unidad elegida hasta `dest` (ver MoveSession.trailTo). */
  trailTo(dest: Pos): Pos[] {
    return this.session!.trailTo(dest);
  }

  /**
   * Confirmar el movimiento en una casilla (soltar, clic o Enter). `drop`: se ha soltado arrastrando,
   * y entonces se hace directamente lo logico (capturar, esperar si no hay nada mas...). `wait`: mover y esperar.
   */
  async commit(tile: Pos, opts: CommitOptions = {}): Promise<void> {
    const session = this.session;
    if (!session?.range || this.h.phase !== 'move') return;
    const unit = session.unit;
    const intent = this.intentAt(tile);
    // Moverla a mano cancela su orden de varios turnos.
    if (intent.kind !== 'none' && intent.kind !== 'stay') delete unit.order;
    switch (intent.kind) {
      case 'none':
        return this.h.toMap();
      case 'stay':
        return this.stayHere(unit, opts);
      case 'merge':
      case 'load':
        return this.joinUnit(unit, intent.kind, intent.target);
      case 'attack':
        return this.moveAndAttack(session, intent.from, intent.target);
      case 'move':
        return this.moveTo(session, intent.to, intent.capture, opts);
    }
  }

  /** Soltarla en su sitio: su menu (o esperar, o capturar si se ha soltado encima de un edificio). */
  private stayHere(unit: Unit, opts: CommitOptions): void {
    if (opts.wait) return this.waitSelected();
    if (opts.drop && canCapture(this.h.state, unit)) return this.h.captureNow();
    this.h.openUnitMenu();
  }

  private async joinUnit(unit: Unit, kind: 'merge' | 'load', target: Unit): Promise<void> {
    const s = this.h.state;
    const ghost = unitKey(this.h.scene.textures, s, unit);
    this.clearUndo();
    const path = kind === 'merge' ? merge(s, unit, target) : load(s, unit, target);
    if (path) {
      // Una emboscada por el camino lo deja en mover: no llega a unirse ni a subir.
      const event: GameEvent = path.ambush ? moveEvent(unit.uid, path) : { kind, uid: unit.uid, into: target.uid, path };
      await this.h.play([event], ghost);
    }
    this.h.afterAction();
  }

  private async moveAndAttack(session: MoveSession, from: Pos, target: Unit): Promise<void> {
    const h = this.h;
    const unit = session.unit;
    const ghost = unitKey(h.scene.textures, h.state, unit);
    this.clearUndo();
    if (!samePos(from, unit)) {
      const path = moveUnit(h.state, unit, from, session.range!, this.trailTo(from));
      if (!path) return h.toMap();
      session.range = null;
      await h.play([moveEvent(unit.uid, path)], ghost);
      if (path.ambush) return h.afterAction();
    }
    const stillThere = unitById(h.state, target.uid);
    if (!stillThere) return h.afterAction();
    await h.play([attackEvent(h.state, unit, stillThere, Math.random)]);
    h.afterAction();
  }

  private async moveTo(session: MoveSession, to: Pos, isCapture: boolean, opts: CommitOptions): Promise<void> {
    const h = this.h;
    const unit = session.unit;
    const ghost = unitKey(h.scene.textures, h.state, unit);
    const before = serialize(h.state);
    const seenBefore = visibleEnemyUids(h.state);
    const snapshot: MoveUndo = { uid: unit.uid, x: unit.x, y: unit.y, canFire: unit.canFire };
    const path = moveUnit(h.state, unit, to, session.range!, this.trailTo(to));
    if (!path) return;
    session.range = null;
    await h.play([moveEvent(unit.uid, path)], ghost);
    if (path.ambush) {
      this.clearUndo();
      return h.afterAction();
    }
    // Se puede deshacer si no ha descubierto a nadie.
    if (visibleEnemyUids(h.state) === seenBefore) this.undoStack.push(before);
    else this.clearUndo();
    this.lastCommit = { at: { ...to }, time: h.scene.time.now };
    if (opts.wait) return this.waitSelected();
    if (opts.drop && isCapture && canCapture(h.state, unit)) return h.captureNow();
    if (opts.drop && settings.autoWait && hasNothingElseToDo(h.state, unit)) return this.waitSelected();
    session.undo = snapshot;
    h.openUnitMenu();
  }

  /** Orden de varios turnos: la unidad avanza ya este turno y, en los siguientes, sola al empezar. */
  async giveOrder(unit: Unit, goal: Pos): Promise<void> {
    const h = this.h;
    delete unit.command;
    const range = this.session?.range ?? moveRange(h.state, unit);
    const dest = stepToward(h.state, unit, goal, range);
    if (!dest) {
      showToast(t('orderUnreachable'));
      return h.toMap();
    }
    this.clearUndo();
    unit.order = { ...goal };
    showToast(t('orderSet'));
    const ghost = unitKey(h.scene.textures, h.state, unit);
    const path = moveUnit(h.state, unit, dest, range);
    if (this.session) this.session.range = null;
    if (path) await h.play([moveEvent(unit.uid, path)], ghost);
    if (samePos(unit, goal) || path?.ambush) delete unit.order;
    h.toMap();
  }

  /** Mover en grupo: cada unidad elegida va lo mas cerca posible del destino, sin pisarse. */
  async groupMove(goal: Pos): Promise<void> {
    const h = this.h;
    h.selection.multi = false;
    const closestFirst = [...h.selection.group]
      .map((uid) => unitById(h.state, uid))
      .filter((unit): unit is Unit => !!unit && unit.active && unit.canMove && unit.carrier === null)
      .sort((a, b) => manhattan(a, goal) - manhattan(b, goal));
    // [CAMBIO] El grupo sigue elegido despues de moverlo (como en los juegos de estrategia en tiempo real).
    this.clearUndo();
    for (const unit of closestFirst) {
      const range = moveRange(h.state, unit);
      const best = closestStep(unit, goal, range);
      if (!best) continue;
      delete unit.order;
      const path = moveUnit(h.state, unit, best, range);
      if (path) await h.play([moveEvent(unit.uid, path)]);
      if (h.ended) return;
    }
    h.toMap();
  }

  waitSelected(): void {
    if (this.selected) wait(this.selected);
    this.h.afterAction();
  }

  clearUndo(): void {
    this.undoStack = [];
  }

  /** «Atras» en el menu de la unidad: vuelve a donde estaba antes de moverla y se puede mover otra vez. */
  undoMove(): void {
    const h = this.h;
    const unit = this.selected;
    const undo = this.session?.undo;
    if (!unit || !undo || undo.uid !== unit.uid) return h.toMap();
    this.undoStack.pop();
    unit.x = undo.x;
    unit.y = undo.y;
    unit.canFire = undo.canFire;
    unit.canMove = true;
    h.view.cursor = { x: unit.x, y: unit.y };
    this.select(unit);
  }

  /** Ctrl+Z: volver al estado de antes del ultimo movimiento (si no descubrio nada ni tuvo consecuencias). */
  undoLast(): void {
    const previous = this.undoStack.pop();
    if (!previous) return showToast(t('nothingToUndo'));
    const restored = deserialize(previous);
    if (!restored) return;
    this.h.state = restored;
    this.h.toMap();
    showToast(t('undone'));
  }
}
