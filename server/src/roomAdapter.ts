/**
 * El unico sitio del servidor que habla con la sala del nucleo (`Room`, src/core/net): lo que el
 * Durable Object necesita de ella, con nombres del servidor (entrar, atender, irse, el reloj, la IA
 * por quien no vuelve, guardar y recuperar) y nada de la partida: solo salen los mensajes que la
 * sala manda a cada asiento (`Outgoing`) y lo que puede saber cualquiera (`lobby`). Asi un cambio en
 * la sala se absorbe aqui, y el resto del servidor no sabe ni que existe una `GameSession`.
 */
import { defaultContent } from '@core/content/default';
import { skirmishConfig } from '@core/match';
import type { TeamId } from '@core/model';
import {
  CURRENT_PROTOCOL,
  Room,
  type JoinResult,
  type Outgoing,
  type RoomContext,
  type RoomSnapshot,
  type RoomStatus,
  type SeatId,
} from '@core/net';
import { newToken, sameToken } from './codes';
import type { RoomRequest } from './roomRequest';

/** Lo que puede saber cualquiera de un asiento: quien lo juega y si la persona esta dentro. */
export interface LobbySeat {
  seat: SeatId;
  team: TeamId;
  kind: 'person' | 'ai';
  joined: boolean;
}

/** Lo que puede saber cualquiera de la sala (`GET /rooms/:code`): nada de la partida. */
export interface LobbyInfo {
  status: RoomStatus;
  protocol: number;
  save: number;
  seats: LobbySeat[];
}

/** La ficha de un asiento, para el enlace de invitacion (solo la ve quien crea la sala). */
export interface Invitation {
  seat: SeatId;
  team: TeamId;
  token: string;
}

/** Por que no se da un asiento a la IA: la ficha no es de quien creo la sala, la sala ya juega, el asiento no es de otra persona, o ya esta dentro. */
export type HandToAiError = 'badToken' | 'notWaiting' | 'noSeat' | 'seatTaken';

/** A quien se espera ahora: su asiento y el dia (otro dia del mismo asiento es otro turno). */
export interface Awaited {
  seat: SeatId;
  day: number;
}

/** Lo que el servidor le da a la sala: el contenido del juego, su azar y (en tests) cuantos pasos seguidos. */
export const roomContext = (stepBudget?: number): RoomContext => ({ content: defaultContent(), newToken, sameToken, stepBudget });

export class RoomAdapter {
  private constructor(private readonly room: Room) {}

  /** Una sala nueva con la escaramuza pedida, esperando a sus personas. */
  static create(request: RoomRequest, stepBudget?: number): RoomAdapter {
    return new RoomAdapter(Room.create({ match: skirmishConfig(request.match) }, roomContext(stepBudget)));
  }

  /** La sala guardada, o null si lo guardado no es una sala (otra version, o roto). */
  static restore(snapshot: unknown): RoomAdapter | null {
    const restored = Room.restore(snapshot, roomContext());
    return restored.ok ? new RoomAdapter(restored.room) : null;
  }

  snapshot(): RoomSnapshot {
    return this.room.snapshot();
  }

  get status(): RoomStatus {
    return this.room.status;
  }

  /** Las fichas de las personas (para los enlaces de invitacion, al crear la sala). */
  invitations(): Invitation[] {
    return this.room.people().map((seat) => ({ seat: seat.id, team: seat.team, token: seat.token }));
  }

  lobby(): LobbyInfo {
    const seats = this.room.seats.map((seat) => ({
      seat: seat.id,
      team: seat.team,
      kind: seat.kind,
      joined: seat.kind === 'person' && seat.connection !== null,
    }));
    return { status: this.room.status, ...CURRENT_PROTOCOL, seats };
  }

  /** Los asientos de las personas que no estan dentro (para darselos a la IA si no llegan). */
  absentSeats(): SeatId[] {
    return this.room
      .people()
      .filter((seat) => seat.connection === null)
      .map((seat) => seat.id);
  }

  /** A quien se espera (una persona), o null si a nadie (la IA juega, o la partida ha acabado o no ha empezado). */
  awaiting(): Awaited | null {
    const seat = this.room.awaiting;
    return seat && this.room.status === 'playing' ? { seat: seat.id, day: this.room.state.day } : null;
  }

  /** Un saludo (`hello`) de una conexion nueva. */
  join(hello: unknown): JoinResult {
    return this.room.join(hello);
  }

  /** Vuelve a entrar quien ya estaba (tras recuperar la sala: su conexion sigue viva, la sala no lo sabia). */
  rejoin(token: string): JoinResult {
    return this.room.join({ kind: 'hello', token, ...CURRENT_PROTOCOL });
  }

  handle(seat: SeatId, message: unknown): Outgoing[] {
    return this.room.handle(seat, message);
  }

  leave(seat: SeatId, connection: number): void {
    this.room.leave(seat, connection);
  }

  /** Quien no ha llegado (o no vuelve) pasa a la IA. */
  replaceWithAi(seat: SeatId): Outgoing[] {
    return this.room.replaceWithAi(seat);
  }

  /**
   * Quien creo la sala (la ficha del primer asiento de persona) da a la IA un asiento de persona
   * que no ha entrado, mientras la sala espera: lo que hay que mandar, o por que no.
   */
  handToAi(token: string, seat: SeatId): { ok: true; outgoing: Outgoing[] } | { ok: false; error: HandToAiError } {
    const creator = this.room.people()[0];
    if (!creator || !sameToken(token, creator.token)) return { ok: false, error: 'badToken' };
    if (this.room.status !== 'waiting') return { ok: false, error: 'notWaiting' };
    const target = this.room.people().find((person) => person.id === seat);
    if (!target || target.id === creator.id) return { ok: false, error: 'noSeat' };
    if (target.connection !== null) return { ok: false, error: 'seatTaken' };
    return { ok: true, outgoing: this.room.replaceWithAi(seat) };
  }

  /** Se le ha acabado el tiempo de su turno. */
  timeOut(seat: SeatId): Outgoing[] {
    return this.room.endTurnOf(seat);
  }

  /** La partida sigue sin esperar a nadie (la IA se quedo a medias por el presupuesto de pasos): hay que `continueMatch`. */
  pending(): boolean {
    return this.room.pending();
  }

  /** Sigue la partida que se quedo a medias: lo que hay que mandar. */
  continueMatch(): Outgoing[] {
    return this.room.continueMatch();
  }

  /** Cuantos mensajes se le han rechazado al asiento desde que la sala esta en memoria. */
  rejectionsOf(seat: SeatId): number {
    return this.room.rejectionsOf(seat);
  }
}
