/**
 * Lo que hace la persona en el prototipo 3D: tocar una unidad suya la elige y enseña a donde llega
 * (el alcance del nucleo: moveRange), tocar una de esas casillas la mueve (la accion 'move' por la
 * sesion, como en 2D) y «Fin de turno» se lo pasa a la sesion. Las reglas las dice siempre el nucleo.
 */
import type { GameSession } from '../core/session';
import type { Pos, TeamId, Unit } from '../core/model';
import { canMoveNow, canReach, moveRange, pathTo, reachableTiles, unitAt, type MoveRange } from '../core/rules';
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
    await playEvents(result.events, this.animations);
    this.isBusy = false;
    this.refresh();
  }

  private refresh(): void {
    this.onChange();
  }
}
