/**
 * Lo que hace la persona en el prototipo 3D: tocar una unidad suya la elige y enseña a donde llega
 * (el alcance del nucleo: moveRange), tocar una de esas casillas la mueve (la accion 'move' por la
 * sesion, como en 2D) y «Fin de turno» se lo pasa a la sesion. Las reglas las dice siempre el nucleo.
 */
import type { GameSession } from '../core/session';
import type { Pos, TeamId, Unit } from '../core/model';
import { canMoveNow, canReach, moveRange, pathTo, reachableTiles, unitAt, unitById, type MoveRange } from '../core/rules';
import { playEvents, type AnimationHost } from './animations';
import type { Highlights } from './highlights';

interface Selection {
  unit: Unit;
  range: MoveRange;
}

export class PrototypeControls {
  private selection: Selection | null = null;
  /** Mientras se anima algo no se atiende la entrada (como en 2D). */
  private isBusy = false;

  constructor(
    private readonly session: GameSession,
    private readonly viewer: TeamId,
    private readonly highlights: Highlights,
    private readonly animations: AnimationHost,
    private readonly onChange: () => void,
  ) {}

  get state() {
    return this.session.state;
  }

  /** Se esta animando algo (la interfaz lo enseña: sin fichas ni boton de fin de turno). */
  get busy(): boolean {
    return this.isBusy;
  }

  /** Lleva la partida hasta que le toca decidir a la persona (o se acaba). */
  runUntilInput(): void {
    while (this.session.step().kind === 'acted');
    this.refresh();
  }

  async tap(pos: Pos): Promise<void> {
    if (this.isBusy || this.session.awaitingInput !== this.viewer) return;
    if (this.selection && canReach(this.selection.range, pos)) return this.moveSelected(pos);
    this.selectAt(pos);
  }

  /** Elegir una unidad por su uid (desde la interfaz): como tocar su casilla. */
  focusUnit(uid: number): void {
    const unit = unitById(this.state, uid);
    if (unit && !this.isBusy) this.selectAt(unit);
  }

  /** La siguiente unidad propia que aun puede moverse, despues de la elegida (null si no queda ninguna). */
  nextIdleUnit(): number | null {
    const idle = this.state.units.filter((unit) => unit.team === this.viewer && canMoveNow(unit));
    const current = idle.findIndex((unit) => unit.uid === this.selection?.unit.uid);
    return idle[(current + 1) % idle.length]?.uid ?? null;
  }

  /** Soltar la unidad elegida. */
  cancel(): void {
    if (!this.isBusy) this.deselect();
  }

  endTurn(): void {
    if (this.isBusy) return;
    this.deselect();
    this.session.finishInput(this.viewer);
    this.runUntilInput();
  }

  private selectAt(pos: Pos): void {
    const unit = unitAt(this.state, pos);
    if (!unit || unit.team !== this.viewer || !canMoveNow(unit)) return this.deselect();
    this.selection = { unit, range: moveRange(this.state, unit) };
    this.highlights.showReach(reachableTiles(this.selection.range));
    this.highlights.select(pos);
  }

  private deselect(): void {
    this.selection = null;
    this.highlights.showReach([]);
    this.highlights.select(null);
  }

  private async moveSelected(to: Pos): Promise<void> {
    const { unit, range } = this.selection!;
    this.deselect();
    const result = this.session.act(this.viewer, { kind: 'move', uid: unit.uid, to, path: pathTo(range, to) });
    if (!result.ok) return console.warn('Movimiento rechazado:', result.reason);
    this.isBusy = true;
    this.refresh();
    await playEvents(result.events, this.animations);
    this.isBusy = false;
    this.refresh();
  }

  private refresh(): void {
    this.onChange();
  }
}
