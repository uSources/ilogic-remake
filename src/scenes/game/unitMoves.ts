/**
 * Mover las unidades del jugador: elegir una (MoveSession), soltarla en una casilla (mover, atacar,
 * unirse, subir), ordenes de varios turnos, mover un grupo y deshacer (Atras en su menu y Ctrl+Z).
 */
import { saveContext } from '../../core/defaultGames';
import type Phaser from 'phaser';
import { isValidAction } from '../../core/actions';
import { manhattan, samePos, posOf } from '../../core/geom';
import { closestStep } from '../../core/targeting';
import { canCapture, canStillMove, endsInAmbush, moveRange, stepToward, unitActions, unitById, visibility } from '../../core/rules';
import { deserialize, serialize } from '../../core/save';
import type { GameEvent, GameState, Pos, TeamId, Unit } from '../../core/model';
import { isHostile } from '../../core/teams';
import { showToast } from '../../hud/store';
import { settings, t } from '../../settings';
import type { MapView } from '../../ui/mapView';
import { unitKey } from '../../ui/sprites';
import type { GroupSelection } from './groupSelection';
import { MoveSession } from './moveSession';
import type { ActionHost, Intent, Phase } from './types';

/** Lo que mover necesita de la escena. */
export interface MoveHost extends ActionHost {
  readonly scene: Phaser.Scene;
  readonly view: MapView;
  /** La partida (Ctrl+Z la cambia por la de antes). */
  state: GameState;
  /** El equipo que juega la persona en esta pantalla (el que mira). */
  readonly viewer: TeamId;
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

/** Uids de los enemigos de `viewer` que ve ahora (para saber si un movimiento ha descubierto a alguien). */
function visibleEnemyUids(s: GameState, viewer: TeamId): string {
  const vis = visibility(s, viewer);
  return s.units
    .filter((unit) => isHostile(s, viewer, unit.team) && unit.carrier === null && vis.at(unit))
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
    if (!canStillMove(unit)) {
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
  async commit(tile: Pos, options: CommitOptions = {}): Promise<void> {
    const session = this.session;
    if (!session?.range || this.host.phase !== 'move') return;
    const unit = session.unit;
    const intent = this.intentAt(tile);
    // Moverla a mano cancela su orden de varios turnos.
    if (intent.kind !== 'none' && intent.kind !== 'stay' && unit.travelTo) this.host.act({ kind: 'travel', uid: unit.uid, to: null });
    switch (intent.kind) {
      case 'none':
        return this.host.toMap();
      case 'stay':
        return this.stayHere(unit, options);
      case 'merge':
      case 'load':
        return this.joinUnit(unit, intent.kind, intent.target);
      case 'attack':
        return this.moveAndAttack(session, intent.from, intent.target);
      case 'move':
        return this.moveTo(session, intent.to, intent.capture, options);
    }
  }

  /** Soltarla en su sitio: su menu (o esperar, o capturar si se ha soltado encima de un edificio). */
  private stayHere(unit: Unit, options: CommitOptions): void {
    if (options.wait) return this.waitSelected();
    if (options.drop && canCapture(this.host.state, unit)) return this.host.captureNow();
    this.host.openUnitMenu();
  }

  private async joinUnit(unit: Unit, kind: 'merge' | 'load', target: Unit): Promise<void> {
    const ghost = unitKey(this.host.scene.textures, this.host.state, unit, this.host.viewer);
    this.clearUndo();
    // Una emboscada por el camino lo deja en mover: no llega a unirse ni a subir (lo dice su suceso).
    await this.host.perform({ kind, uid: unit.uid, into: target.uid }, ghost);
    this.host.afterAction();
  }

  private async moveAndAttack(session: MoveSession, from: Pos, target: Unit): Promise<void> {
    const host = this.host;
    const unit = session.unit;
    const ghost = unitKey(host.scene.textures, host.state, unit, host.viewer);
    this.clearUndo();
    if (!samePos(from, unit)) {
      const moved = host.act({ kind: 'move', uid: unit.uid, to: from, path: this.trailTo(from) });
      if (!moved) return host.toMap();
      session.range = null;
      await host.play(moved, ghost);
      if (endsInAmbush(moved)) return host.afterAction();
    }
    await host.perform({ kind: 'attack', uid: unit.uid, target: target.uid });
    host.afterAction();
  }

  private async moveTo(session: MoveSession, to: Pos, isCapture: boolean, options: CommitOptions): Promise<void> {
    const host = this.host;
    const unit = session.unit;
    const ghost = unitKey(host.scene.textures, host.state, unit, host.viewer);
    const before = serialize(host.state);
    const seenBefore = visibleEnemyUids(host.state, host.viewer);
    const moved = host.act({ kind: 'move', uid: unit.uid, to, path: this.trailTo(to) });
    if (!moved) return;
    session.range = null;
    await host.play(moved, ghost);
    if (endsInAmbush(moved)) {
      this.clearUndo();
      return host.afterAction();
    }
    // Se puede deshacer si no ha descubierto a nadie.
    if (visibleEnemyUids(host.state, host.viewer) === seenBefore) this.undoStack.push(before);
    else this.clearUndo();
    this.lastCommit = { at: { ...to }, time: host.scene.time.now };
    if (options.wait) return this.waitSelected();
    if (options.drop && isCapture && canCapture(host.state, unit)) return host.captureNow();
    if (options.drop && settings.autoWait && hasNothingElseToDo(host.state, unit)) return this.waitSelected();
    host.openUnitMenu();
  }

  /** Viaje de varios turnos (travelTo): la unidad avanza ya este turno y, en los siguientes, sola al empezar. */
  async giveTravel(unit: Unit, goal: Pos): Promise<void> {
    const host = this.host;
    const dest = stepToward(host.state, unit, goal, this.session?.range ?? moveRange(host.state, unit));
    if (!dest) {
      showToast(t('travelUnreachable'));
      return host.toMap();
    }
    this.clearUndo();
    host.act({ kind: 'travel', uid: unit.uid, to: goal });
    showToast(t('travelSet'));
    const ghost = unitKey(host.scene.textures, host.state, unit, host.viewer);
    const moved = host.act({ kind: 'move', uid: unit.uid, to: dest });
    if (this.session) this.session.range = null;
    if (moved) await host.play(moved, ghost);
    if (samePos(unit, goal) || (moved && endsInAmbush(moved))) host.act({ kind: 'travel', uid: unit.uid, to: null });
    host.toMap();
  }

  /** Mover en grupo: cada unidad elegida va lo mas cerca posible del destino, sin pisarse. */
  async groupMove(goal: Pos): Promise<void> {
    const host = this.host;
    host.selection.multi = false;
    const closestFirst = [...host.selection.group]
      .map((uid) => unitById(host.state, uid))
      .filter((unit): unit is Unit => !!unit && canStillMove(unit) && unit.carrier === null)
      .sort((firstUnit, secondUnit) => manhattan(firstUnit, goal) - manhattan(secondUnit, goal));
    // [CAMBIO] El grupo sigue elegido despues de moverlo (como en los juegos de estrategia en tiempo real).
    this.clearUndo();
    for (const unit of closestFirst) {
      const best = closestStep(unit, goal, moveRange(host.state, unit));
      if (!best) continue;
      if (unit.travelTo) host.act({ kind: 'travel', uid: unit.uid, to: null });
      await host.perform({ kind: 'move', uid: unit.uid, to: best });
      if (host.ended) return;
    }
    host.toMap();
  }

  waitSelected(): void {
    if (this.selected) this.host.act({ kind: 'wait', uid: this.selected.uid });
    this.host.afterAction();
  }

  clearUndo(): void {
    this.undoStack = [];
  }

  /** La unidad elegida se acaba de mover y se puede deshacer («Atras» en su menu). */
  canUndoSelected(): boolean {
    const unit = this.selected;
    return !!unit && isValidAction(this.host.state, this.host.viewer, { kind: 'undoMove', uid: unit.uid });
  }

  /** «Atras» en el menu de la unidad: vuelve a donde estaba antes de moverla y se puede mover otra vez. */
  undoMove(): void {
    const host = this.host;
    const unit = this.selected;
    if (!unit || !host.act({ kind: 'undoMove', uid: unit.uid })) return host.toMap();
    this.undoStack.pop();
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
