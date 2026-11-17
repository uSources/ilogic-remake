/**
 * La amenaza enemiga, para quien mira:
 * - «Ver amenaza» (T o el menu): las casillas a las que puede disparar en su turno algun enemigo que
 *   se ve (threatMap del nucleo: no delata a los que estan en la niebla);
 * - al señalar o elegir una unidad propia, una linea desde cada enemigo que se ve y que podria
 *   atacarla en su turno (como en Fire Emblem Engage). Lo que **podria** pasar, no lo que hara la IA.
 * Aqui solo se decide; se pide al motor por `ThreatMarks`.
 */
import type { GameState, Pos, TeamId, Unit } from '../../../core/model';
import { canDamage, isOnMap, isVisibleFoe, sightOf, threatMap, unitThreat } from '../../../core/rules';
import type { GameSession } from '../../../core/session';
import type { Grid } from '../../../core/util/grid';
import type { ThreatLine, ThreatMarks } from '../../ports/threat';

export interface ThreatZoneHost {
  session: GameSession;
  viewer: TeamId;
  marks: ThreatMarks;
}

/** Las casillas amenazadas para quien mira, en una lista. */
export function threatTiles(s: GameState, viewer: TeamId): Pos[] {
  const tiles: Pos[] = [];
  threatMap(s, viewer).forEach((isThreatened, pos) => {
    if (isThreatened) tiles.push(pos);
  });
  return tiles;
}

/** A donde llega cada enemigo en su turno: se calcula una vez por cada estado de la partida. */
export type ReachOf = (enemy: Unit) => Grid<boolean>;

/** Los enemigos que se ven y que podrian atacar a `target` en su turno (llegan a su casilla y le hacen daño). */
export function threatLinesTo(
  s: GameState,
  viewer: TeamId,
  target: Unit,
  reachOf: ReachOf = (enemy) => unitThreat(s, enemy),
): ThreatLine[] {
  const sees = sightOf(s, viewer);
  const attackers = s.units.filter(
    (enemy) => isVisibleFoe(s, viewer, enemy, sees) && canDamage(s, enemy, target) && reachOf(enemy).at(target),
  );
  return attackers.map((enemy) => ({ from: { x: enemy.x, y: enemy.y }, to: { x: target.x, y: target.y } }));
}

export class ThreatZone {
  private isOn = false;
  /** A donde llega cada enemigo (por uid) en el estado de ahora; se vacia al cambiar la partida (`update`). */
  private readonly reaches = new Map<number, Grid<boolean>>();
  /** La unidad propia de la que se enseñan las lineas (null: ninguna). */
  private focused: Unit | null = null;

  constructor(private readonly host: ThreatZoneHost) {}

  get isShowing(): boolean {
    return this.isOn;
  }

  toggle(): void {
    this.isOn = !this.isOn;
    this.update();
  }

  /** La partida ha cambiado: volver a marcar (si se enseña), y las lineas de la unidad que se mira. */
  update(): void {
    const { session, viewer, marks } = this.host;
    this.reaches.clear();
    marks.showThreat(this.isOn ? threatTiles(session.state, viewer) : []);
    this.showLines();
  }

  /** Las lineas de quien podria atacar a esa unidad, si es de quien mira y esta en el tablero (null: ninguna). */
  focus(unit: Unit | null): void {
    const mine = unit && unit.team === this.host.viewer && isOnMap(unit) ? unit : null;
    if (mine === this.focused) return;
    this.focused = mine;
    this.showLines();
  }

  private showLines(): void {
    const { session, viewer, marks } = this.host;
    const s = session.state;
    const reachOf: ReachOf = (enemy) => this.reaches.get(enemy.uid) ?? this.remember(enemy.uid, unitThreat(s, enemy));
    marks.showThreatLines(this.focused ? threatLinesTo(s, viewer, this.focused, reachOf) : []);
  }

  private remember(uid: number, reach: Grid<boolean>): Grid<boolean> {
    this.reaches.set(uid, reach);
    return reach;
  }
}
