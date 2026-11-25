/**
 * El unico sitio del servidor que habla con la sala del nucleo (`Room`, src/core/net): lo que el
 * Durable Object necesita de ella, con nombres del servidor (entrar, atender, irse, el reloj, la IA
 * por quien no vuelve, guardar y recuperar) y nada de la partida: solo salen los mensajes que la
 * sala manda a cada asiento (`Outgoing`), lo que puede saber cualquiera (`lobby`), el asiento que se
 * da a quien llega con el codigo (`claimSeat`) y si quien la creo puede cerrarla (`canClose`). Asi un cambio en
 * la sala se absorbe aqui, y el resto del servidor no sabe ni que existe una `GameSession`.
 */
import { defaultContent } from '@core/content/default';
import { skirmishConfig } from '@core/match';
import type { TeamId } from '@core/model';
import {
  CURRENT_PROTOCOL,
  Room,
  type ClaimError,
  type JoinResult,
  type Outgoing,
  type RoomContext,
  type RoomSnapshot,
  type RoomStatus,
  type SeatId,
  type ServerMessage,
  type TurnTimeLeft,
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

/** A quien se espera ahora: su asiento y el dia (otro dia del mismo asiento es otro turno). */
export interface AwaitedSeat {
  seat: SeatId;
  day: number;
}

/**
 * De quien es el turno: una persona (a la IA no se la espera), el dia y cuando se le acaba (null si
 * la sala no tiene reloj). Lo sabe todo el mundo: la partida anuncia cada turno a todos los equipos.
 */
export interface LobbyTurn extends AwaitedSeat {
  endsAt: number | null;
}

/** Lo que puede saber cualquiera de la sala (`GET /rooms/:code`): nada de la partida. */
export interface LobbyInfo {
  status: RoomStatus;
  protocol: number;
  save: number;
  seats: LobbySeat[];
  /** A quien se espera ahora (null si a nadie: la sala espera a que entren, juega la IA o acabo). */
  turn: LobbyTurn | null;
}

/** El asiento de quien crea la sala o llega con el codigo: su ficha es lo que le deja entrar (y volver). */
export interface Invitation {
  seat: SeatId;
  team: TeamId;
  token: string;
}

/** Por que no se da un asiento a la IA: la ficha no es de quien creo la sala, la sala ya juega, el asiento no es de otra persona, o ya esta dentro. */
export type HandToAiError = 'badToken' | 'notWaiting' | 'noSeat' | 'seatTaken';

/** El asiento dado y lo que hay que mandar (si con el la sala empieza, a quien ya este dentro), o por que no. */
export type ClaimSeatResult = { ok: true; seat: Invitation; outgoing: Outgoing[] } | { ok: false; error: ClaimError };

/** Por que no se cierra una sala: la ficha no es de quien la creo, o ya ha empezado. */
export type CloseError = 'badToken' | 'notWaiting';

/** Lo que el servidor le da a la sala: el contenido del juego, su azar y (en tests) cuantos pasos seguidos. */
export const roomContext = (stepBudget?: number): RoomContext => ({ content: defaultContent(), newToken, sameToken, stepBudget });

export class RoomAdapter {
  private constructor(private readonly room: Room) {}

  /** Una sala nueva con la escaramuza pedida, esperando a sus personas. */
  static create(request: RoomRequest, stepBudget?: number): RoomAdapter {
    const config = { match: skirmishConfig(request.match), start: request.start };
    return new RoomAdapter(Room.create(config, roomContext(stepBudget)));
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

  /** El primer asiento de persona que no es de nadie pasa a ser de quien lo pide (quien crea la sala, o llega con el codigo). */
  claimSeat(): ClaimSeatResult {
    const claimed = this.room.claimSeat();
    if (!claimed.ok) return claimed;
    return { ok: true, seat: { seat: claimed.seat, team: claimed.team, token: claimed.token }, outgoing: claimed.messages };
  }

  /**
   * Quien creo la sala (la ficha del primer asiento de persona) la cierra antes de que empiece: se
   * cancela la busqueda de rival, o ya no se espera a nadie. Una sala que ya juega no se cierra asi
   * (se rinde quien quiera irse).
   */
  canClose(token: string): { ok: true } | { ok: false; error: CloseError } {
    if (!this.isCreator(token)) return { ok: false, error: 'badToken' };
    return this.room.status === 'waiting' ? { ok: true } : { ok: false, error: 'notWaiting' };
  }

  /** Lo que puede saber cualquiera, con la hora a la que se le acaba el turno a quien se espera (null: sin reloj). */
  lobby(turnEndsAt: number | null): LobbyInfo {
    const seats = this.room.seats.map((seat) => ({
      seat: seat.id,
      team: seat.team,
      kind: seat.kind,
      joined: seat.kind === 'person' && seat.connection !== null,
    }));
    const awaited = this.awaiting();
    const turn = awaited ? { ...awaited, endsAt: turnEndsAt } : null;
    return { status: this.room.status, ...CURRENT_PROTOCOL, seats, turn };
  }

  /** Los asientos de las personas que no estan dentro (para darselos a la IA si no llegan). */
  absentSeats(): SeatId[] {
    return this.room
      .personSeats()
      .filter((seat) => seat.connection === null)
      .map((seat) => seat.id);
  }

  /** A quien se espera (una persona), o null si a nadie (la IA juega, o la partida ha acabado o no ha empezado). */
  awaiting(): AwaitedSeat | null {
    const seat = this.room.awaiting;
    return seat && this.room.status === 'playing' ? { seat: seat.id, day: this.room.state.day } : null;
  }

  /**
   * Los mensajes, con el reloj en los `turn` del turno en curso (la sala no sabe de relojes: los lleva
   * el servidor). Un `turn` de un turno que ya ha pasado en el mismo lote se queda sin el: ya no corre.
   */
  withTurnClock(outgoing: Outgoing[], clock: TurnTimeLeft | null): Outgoing[] {
    const awaited = this.room.awaiting;
    if (!clock || !awaited || this.room.status !== 'playing') return outgoing;
    const isCurrentTurn = (message: ServerMessage) =>
      message.kind === 'turn' && message.team === awaited.team && message.day === this.room.state.day;
    return outgoing.map((sent) => (isCurrentTurn(sent.message) ? { ...sent, message: { ...sent.message, clock } } : sent));
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
    if (!this.isCreator(token)) return { ok: false, error: 'badToken' };
    if (this.room.status !== 'waiting') return { ok: false, error: 'notWaiting' };
    const target = this.room.personSeats().find((person) => person.id === seat);
    if (!target || this.isCreator(target.token)) return { ok: false, error: 'noSeat' };
    if (target.connection !== null) return { ok: false, error: 'seatTaken' };
    return { ok: true, outgoing: this.room.replaceWithAi(seat) };
  }

  /** Se le ha acabado el tiempo de su turno. */
  timeOut(seat: SeatId): Outgoing[] {
    return this.room.endTurnOf(seat);
  }

  /** La partida se ha quedado a medias (la IA, por el presupuesto de pasos) sin esperar a nadie: hay que `continueMatch`. */
  isMidway(): boolean {
    return this.room.isMidway();
  }

  /** Sigue la partida que se quedo a medias: lo que hay que mandar. */
  continueMatch(): Outgoing[] {
    return this.room.continueMatch();
  }

  /** Cuantos mensajes se le han rechazado al asiento desde que la sala esta en memoria. */
  rejectionsOf(seat: SeatId): number {
    return this.room.rejectionsOf(seat);
  }

  /** La ficha es la de quien creo la sala (el primer asiento de persona). */
  private isCreator(token: string): boolean {
    const creator = this.room.personSeats()[0];
    return creator !== undefined && sameToken(token, creator.token);
  }
}
