/**
 * Mover las unidades del jugador: elegir una (MoveSession), soltarla en una casilla (mover, atacar,
 * unirse, subir), ordenes de varios turnos, mover un grupo y deshacer (Atras en su menu y Ctrl+Z).
 */
import { saveContext } from '../../core/defaultGames';
import type Phaser from 'phaser';
import { manhattan, samePos, posOf } from '../../core/geom';
import { closestStep } from '../../core/targeting';
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
import type { GameEvent, GameState, Pos, Unit } from '../../core/model';
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
  visible(pos: Pos): boolean;
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
    .filter((unit) => unit.team === 1 && unit.carrier === null && vis.at(unit))
    .map((unit) => unit.uid)
    .sort((first, second) => first - second)
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

  constructor(private readonly host: MoveHost) {}

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
    const host = this.host;
    if (!unit.canMove) {
      this.session = MoveSession.alreadyMoved(unit);
      return host.openUnitMenu();
    }
    this.session = MoveSession.toMove(host.state, unit);
    host.phase = 'move';
    this.followCursor(host.view.cursor);
    host.refresh();
  }

  /** El cursor pasa por una casilla: el camino trazado la sigue. */
  followCursor(tile: Pos): void {
    this.session?.followCursor(this.host.state, tile);
  }

  /** Que pasaria al soltar (o pulsar) la unidad elegida en una casilla. */
  intentAt(tile: Pos): Intent {
    return this.session ? this.session.intentAt(this.host.state, tile, (pos) => this.host.visible(pos)) : { kind: 'none' };
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
    if (!session?.range || this.host.phase !== 'move') return;
    const unit = session.unit;
    const intent = this.intentAt(tile);
    // Moverla a mano cancela su orden de varios turnos.
    if (intent.kind !== 'none' && intent.kind !== 'stay') delete unit.travelTo;
    switch (intent.kind) {
      case 'none':
        return this.host.toMap();
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
    if (opts.drop && canCapture(this.host.state, unit)) return this.host.captureNow();
    this.host.openUnitMenu();
  }

  private async joinUnit(unit: Unit, kind: 'merge' | 'load', target: Unit): Promise<void> {
    const s = this.host.state;
    const ghost = unitKey(this.host.scene.textures, s, unit);
    this.clearUndo();
    const path = kind === 'merge' ? merge(s, unit, target) : load(s, unit, target);
    if (path) {
      // Una emboscada por el camino lo deja en mover: no llega a unirse ni a subir.
      const event: GameEvent = path.ambush ? moveEvent(unit.uid, path) : { kind, uid: unit.uid, into: target.uid, path };
      await this.host.play([event], ghost);
    }
    this.host.afterAction();
  }

  private async moveAndAttack(session: MoveSession, from: Pos, target: Unit): Promise<void> {
    const host = this.host;
    const unit = session.unit;
    const ghost = unitKey(host.scene.textures, host.state, unit);
    this.clearUndo();
    if (!samePos(from, unit)) {
      const path = moveUnit(host.state, unit, from, session.range!, this.trailTo(from));
      if (!path) return host.toMap();
      session.range = null;
      await host.play([moveEvent(unit.uid, path)], ghost);
      if (path.ambush) return host.afterAction();
    }
    const stillThere = unitById(host.state, target.uid);
    if (!stillThere) return host.afterAction();
    await host.play([attackEvent(host.state, unit, stillThere, Math.random)]);
    host.afterAction();
  }

  private async moveTo(session: MoveSession, to: Pos, isCapture: boolean, opts: CommitOptions): Promise<void> {
    const host = this.host;
    const unit = session.unit;
    const ghost = unitKey(host.scene.textures, host.state, unit);
    const before = serialize(host.state);
    const seenBefore = visibleEnemyUids(host.state);
    const snapshot: MoveUndo = { uid: unit.uid, x: unit.x, y: unit.y, canFire: unit.canFire };
    const path = moveUnit(host.state, unit, to, session.range!, this.trailTo(to));
    if (!path) return;
    session.range = null;
    await host.play([moveEvent(unit.uid, path)], ghost);
    if (path.ambush) {
      this.clearUndo();
      return host.afterAction();
    }
    // Se puede deshacer si no ha descubierto a nadie.
    if (visibleEnemyUids(host.state) === seenBefore) this.undoStack.push(before);
    else this.clearUndo();
    this.lastCommit = { at: { ...to }, time: host.scene.time.now };
    if (opts.wait) return this.waitSelected();
    if (opts.drop && isCapture && canCapture(host.state, unit)) return host.captureNow();
    if (opts.drop && settings.autoWait && hasNothingElseToDo(host.state, unit)) return this.waitSelected();
    session.undo = snapshot;
    host.openUnitMenu();
  }

  /** Viaje de varios turnos (travelTo): la unidad avanza ya este turno y, en los siguientes, sola al empezar. */
  async giveTravel(unit: Unit, goal: Pos): Promise<void> {
    const host = this.host;
    delete unit.standingOrder;
    const range = this.session?.range ?? moveRange(host.state, unit);
    const dest = stepToward(host.state, unit, goal, range);
    if (!dest) {
      showToast(t('travelUnreachable'));
      return host.toMap();
    }
    this.clearUndo();
    unit.travelTo = posOf(goal);
    showToast(t('travelSet'));
    const ghost = unitKey(host.scene.textures, host.state, unit);
    const path = moveUnit(host.state, unit, dest, range);
    if (this.session) this.session.range = null;
    if (path) await host.play([moveEvent(unit.uid, path)], ghost);
    if (samePos(unit, goal) || path?.ambush) delete unit.travelTo;
    host.toMap();
  }

  /** Mover en grupo: cada unidad elegida va lo mas cerca posible del destino, sin pisarse. */
  async groupMove(goal: Pos): Promise<void> {
    const host = this.host;
    host.selection.multi = false;
    const closestFirst = [...host.selection.group]
      .map((uid) => unitById(host.state, uid))
      .filter((unit): unit is Unit => !!unit && unit.active && unit.canMove && unit.carrier === null)
      .sort((firstUnit, secondUnit) => manhattan(firstUnit, goal) - manhattan(secondUnit, goal));
    // [CAMBIO] El grupo sigue elegido despues de moverlo (como en los juegos de estrategia en tiempo real).
    this.clearUndo();
    for (const unit of closestFirst) {
      const range = moveRange(host.state, unit);
      const best = closestStep(unit, goal, range);
      if (!best) continue;
      delete unit.travelTo;
      const path = moveUnit(host.state, unit, best, range);
      if (path) await host.play([moveEvent(unit.uid, path)]);
      if (host.ended) return;
    }
    host.toMap();
  }

  waitSelected(): void {
    if (this.selected) wait(this.selected);
    this.host.afterAction();
  }

  clearUndo(): void {
    this.undoStack = [];
  }

  /** «Atras» en el menu de la unidad: vuelve a donde estaba antes de moverla y se puede mover otra vez. */
  undoMove(): void {
    const host = this.host;
    const unit = this.selected;
    const undo = this.session?.undo;
    if (!unit || !undo || undo.uid !== unit.uid) return host.toMap();
    this.undoStack.pop();
    unit.x = undo.x;
    unit.y = undo.y;
    unit.canFire = undo.canFire;
    unit.canMove = true;
    host.view.cursor = posOf(unit);
    this.select(unit);
  }

  /** Ctrl+Z: volver al estado de antes del ultimo movimiento (si no descubrio nada ni tuvo consecuencias). */
  undoLast(): void {
    const previous = this.undoStack.pop();
    if (!previous) return showToast(t('nothingToUndo'));
    const restored = deserialize(previous, saveContext(this.host.state.content));
    if (!restored) return;
    this.host.state = restored;
    this.host.toMap();
    showToast(t('undone'));
  }
}
