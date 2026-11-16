/**
 * Lo que haran las ordenes permanentes al terminar el turno (las flechas de intencion): al señalar
 * una unidad propia con orden, la suya; con «Ver órdenes», las de todas. La prevision la hace el
 * nucleo sobre una copia como la sabe el equipo (previewStandingOrders: no delata a nadie); aqui solo
 * se decide cuales enseñar y se piden al motor por `IntentMarks`.
 */
import { dispatch } from '../../../core/actions';
import { previewStandingOrders, type StandingOrderIntent } from '../../../core/autopilot';
import { samePos } from '../../../core/geom';
import type { GameState, Pos, TeamId, Unit } from '../../../core/model';
import { isOnMap } from '../../../core/rules';
import type { GameSession } from '../../../core/session';
import { gotoDestination, turnEndOrderOf } from '../../../core/squads';
import type { IntentLook, IntentMarks } from '../../ports/orders';

export interface OrderIntentsHost {
  session: GameSession;
  viewer: TeamId;
  marks: IntentMarks;
}

/** La unidad lleva una orden permanente (la suya o la de su escuadra). */
const hasOrder = (s: GameState, unit: Unit): boolean => !!turnEndOrderOf(s, unit) || !!gotoDestination(unit);

/** Alguna unidad de ese equipo lleva orden (la bandeja enseña entonces «Ver órdenes»). */
export const anyStandingOrder = (s: GameState, team: TeamId): boolean => s.units.some((unit) => unit.team === team && hasOrder(s, unit));

/** Cuales enseñar: todas, o la de la unidad señalada (si la hay). */
export function intentsToShow(intents: ReadonlyMap<number, StandingOrderIntent>, showAll: boolean, pointed: number | null): IntentLook[] {
  if (showAll) return [...intents.values()];
  const intent = pointed === null ? undefined : intents.get(pointed);
  return intent ? [intent] : [];
}

export class OrderIntents {
  private showAll = false;
  private pointed: Pos | null = null;

  constructor(private readonly host: OrderIntentsHost) {}

  /** «Ver órdenes» esta encendido. */
  get isShowingAll(): boolean {
    return this.showAll;
  }

  toggleAll(): void {
    this.showAll = !this.showAll;
    this.update();
  }

  /** La casilla señalada: si hay una unidad propia con orden, se enseña la suya. */
  hover(pos: Pos | null): void {
    this.pointed = pos;
    this.update();
  }

  /** Vuelve a enseñar lo que toca (la partida ha cambiado o se ha señalado otra casilla). Solo en el turno propio. */
  update(): void {
    const { session, viewer, marks } = this.host;
    const pointedUid = this.pointedUnitWithOrder();
    const wantsSome = this.showAll || pointedUid !== null;
    if (!wantsSome || session.awaitingInput !== viewer) return marks.show([]);
    const intents = previewStandingOrders(session.state, viewer, dispatch);
    marks.show(intentsToShow(intents, this.showAll, pointedUid));
  }

  private pointedUnitWithOrder(): number | null {
    const { session, viewer } = this.host;
    const pointed = this.pointed;
    if (!pointed) return null;
    const unit = session.state.units.find((candidate) => candidate.team === viewer && isOnMap(candidate) && samePos(candidate, pointed));
    return unit && hasOrder(session.state, unit) ? unit.uid : null;
  }
}
