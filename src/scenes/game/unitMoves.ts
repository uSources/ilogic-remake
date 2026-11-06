/**
 * Mover las unidades del jugador: elegir una (MoveSession), soltarla en una casilla (mover, atacar,
 * unirse, subir), ordenes de varios turnos, mover un grupo y deshacer (Atras en su menu y Ctrl+Z:
 * los dos son la accion 'undoMove' del nucleo, que sabe que se puede deshacer).
 */
import type Phaser from 'phaser';
import { actionProblem, availableActions, groupMoveOrder, groupMoveStep, isValidAction, type UnitMenuOption } from '../../core/actions';
import { samePos, posOf } from '../../core/geom';
import { canCapture, canStillMove, endsInAmbush, lastUndoableMove, unitById } from '../../core/rules';
import type { GameEvent, GameState, Pos, TeamId, Unit } from '../../core/model';
import { showToast } from '../../hud/store';
import { settings, t, type TextKey } from '../../settings';
import type { MapView } from '../../ui/mapView';
import { unitKey } from '../../ui/sprites';
import type { GroupSelection } from './groupSelection';
import { MoveSession } from './moveSession';
import type { ActionHost, Intent, Phase } from './types';

/** Lo que mover necesita de la escena. */
export interface MoveHost extends ActionHost {
  readonly scene: Phaser.Scene;
  readonly view: MapView;
  readonly state: GameState;
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

/** Lo que una unidad puede hacer despues de moverse, aparte de esperar y de las ordenes. */
const ACTIONS_AFTER_MOVING: readonly UnitMenuOption[] = ['attack', 'capture', 'unload', 'supply'];

/** Sin nada mas que hacer tras moverse (para «Esperar sola» al soltar). */
function hasNothingElseToDo(s: GameState, team: TeamId, unit: Unit): boolean {
  return !availableActions(s, team, unit).some((option) => ACTIONS_AFTER_MOVING.includes(option));
}

/**
 * Lo que «Atras» tiene que avisar en vez de deshacer: con niebla, si al moverse ha descubierto a
 * alguien ya no vuelve (seria mirar gratis) y el menu sigue abierto. null si no hay que avisar (se
 * deshace o, si no se ha movido, se cierra el menu).
 */
export function backWarning(s: GameState, viewer: TeamId, unit: Unit): TextKey | null {
  return actionProblem(s, viewer, { kind: 'undoMove', uid: unit.uid }) === 'revealed' ? 'undoRevealed' : null;
}

export class UnitMoves {
  /** La unidad elegida y lo calculado al elegirla (null en el mapa). */
  session: MoveSession | null = null;
  /** Ultimo movimiento confirmado (para el doble clic: mover y esperar). */
  lastCommit: { at: Pos; time: number } | null = null;

  constructor(private readonly host: MoveHost) {}

  /** Partida nueva. */
  reset(): void {
    this.session = null;
    this.lastCommit = null;
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
    // Una emboscada por el camino lo deja en mover: no llega a unirse ni a subir (lo dice su suceso).
    await this.host.perform({ kind, uid: unit.uid, into: target.uid }, ghost);
    this.host.afterAction();
  }

  private async moveAndAttack(session: MoveSession, from: Pos, target: Unit): Promise<void> {
    const host = this.host;
    const unit = session.unit;
    const ghost = unitKey(host.scene.textures, host.state, unit, host.viewer);
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
    const moved = host.act({ kind: 'move', uid: unit.uid, to, path: this.trailTo(to) });
    if (!moved) return;
    session.range = null;
    await host.play(moved, ghost);
    if (endsInAmbush(moved)) return host.afterAction();
    this.lastCommit = { at: { ...to }, time: host.scene.time.now };
    if (options.wait) return this.waitSelected();
    if (options.drop && isCapture && canCapture(host.state, unit)) return host.captureNow();
    if (options.drop && settings.autoWait && hasNothingElseToDo(host.state, host.viewer, unit)) return this.waitSelected();
    host.openUnitMenu();
  }

  /**
   * Viaje de varios turnos (travelTo): la unidad avanza ya este turno y, en los siguientes, sola al
   * empezar ('travelStep': hasta donde, y cuando acaba, lo dice el nucleo).
   */
  async giveTravel(unit: Unit, goal: Pos): Promise<void> {
    const host = this.host;
    if (!host.act({ kind: 'travel', uid: unit.uid, to: goal })) {
      showToast(t('travelUnreachable'));
      return host.toMap();
    }
    showToast(t('travelSet'));
    const ghost = unitKey(host.scene.textures, host.state, unit, host.viewer);
    const moved = host.act({ kind: 'travelStep', uid: unit.uid });
    if (this.session) this.session.range = null;
    if (moved) await host.play(moved, ghost);
    host.toMap();
  }

  /** Mover en grupo: cada unidad elegida va lo mas cerca posible del destino, sin pisarse (el plan es del nucleo). */
  async groupMove(goal: Pos): Promise<void> {
    const host = this.host;
    host.selection.multi = false;
    const group = [...host.selection.group].map((uid) => unitById(host.state, uid)).filter((unit): unit is Unit => !!unit);
    // [CAMBIO] El grupo sigue elegido despues de moverlo (como en los juegos de estrategia en tiempo real).
    for (const unit of groupMoveOrder(group, goal)) {
      // Cada paso con el mapa como lo han dejado las de antes.
      const step = groupMoveStep(host.state, unit, goal);
      if (!step) continue;
      await host.perform(step);
      if (host.ended) return;
    }
    host.toMap();
  }

  waitSelected(): void {
    if (this.selected) this.host.act({ kind: 'wait', uid: this.selected.uid });
    this.host.afterAction();
  }

  /** La unidad elegida se acaba de mover y se puede deshacer («Atras» en su menu). */
  canUndoSelected(): boolean {
    const unit = this.selected;
    return !!unit && isValidAction(this.host.state, this.host.viewer, { kind: 'undoMove', uid: unit.uid });
  }

  /**
   * «Atras» en el menu de la unidad: vuelve a donde estaba antes de moverla y se puede mover otra vez;
   * si no se movio, cierra el menu.
   */
  undoMove(): void {
    const unit = this.selected;
    const outcome = unit ? this.undoMoveOf(unit) : 'nothing';
    if (outcome === 'nothing') return this.host.toMap();
    if (unit && outcome === 'undone') this.select(unit);
  }

  /**
   * Ctrl+Z: deshacer el ultimo movimiento que se puede (el nucleo los apunta mientras lo de despues
   * no cuenta nada nuevo: esperar, escuadras, ordenes).
   */
  undoLast(): void {
    const host = this.host;
    const last = lastUndoableMove(host.state);
    const unit = last && unitById(host.state, last.uid);
    const outcome = unit ? this.undoMoveOf(unit) : 'nothing';
    if (outcome === 'nothing') return showToast(t('nothingToUndo'));
    if (!unit || outcome !== 'undone') return;
    host.toMap();
    host.view.cursor = posOf(unit);
    showToast(t('undone'));
  }

  /**
   * Deshace el movimiento de la unidad (lo mismo para «Atras» y Ctrl+Z: la accion 'undoMove'). Si
   * descubrio enemigos no se puede, y se avisa ('warned'); 'nothing' si no habia nada que deshacer.
   */
  private undoMoveOf(unit: Unit): 'undone' | 'warned' | 'nothing' {
    const host = this.host;
    const warning = backWarning(host.state, host.viewer, unit);
    if (warning) {
      showToast(t(warning));
      return 'warned';
    }
    if (!host.act({ kind: 'undoMove', uid: unit.uid })) return 'nothing';
    host.view.cursor = posOf(unit);
    return 'undone';
  }
}
