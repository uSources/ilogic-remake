/**
 * Ver la amenaza enemiga (T o el icono de la bandeja): las casillas a las que puede disparar este
 * turno algun enemigo que quien mira ve. Lo calcula el nucleo (threatMap: no delata a los que estan
 * en la niebla); aqui solo se decide si se enseña y se pide al motor por `ThreatMarks`.
 */
import type { GameState, Pos, TeamId } from '../../../core/model';
import { threatMap } from '../../../core/rules';
import type { GameSession } from '../../../core/session';
import type { ThreatMarks } from '../../ports/threat';

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

export class ThreatZone {
  private isOn = false;

  constructor(private readonly host: ThreatZoneHost) {}

  get isShowing(): boolean {
    return this.isOn;
  }

  toggle(): void {
    this.isOn = !this.isOn;
    this.update();
  }

  /** La partida ha cambiado: volver a marcar (si se enseña). */
  update(): void {
    const { session, viewer, marks } = this.host;
    marks.showThreat(this.isOn ? threatTiles(session.state, viewer) : []);
  }
}
