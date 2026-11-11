/**
 * Una sala: una partida por la red, como logica pura. La lleva el servidor (un Durable Object en
 * Cloudflare Workers, o el que sea): el le pasa cada mensaje que llega (`join`, `handle`) y manda
 * por donde toque lo que la sala devuelve (`Outgoing`: que mensaje va a que asiento). La sala no sabe
 * de conexiones ni de relojes: el servidor le dice quien se va (`leave`), a quien da por ido
 * (`abandon`, `replaceWithAi`) y a quien se le acaba el tiempo de su turno (`endTurnOf`); y se
 * guarda y se recupera entera como JSON (`snapshot`, `restore`).
 *
 * Dentro es una `GameSession` como la de la pantalla: cada persona es un `remoteController` (la
 * sesion espera sus acciones), cada equipo de la IA juega en el servidor con `aiController` y los
 * dados son los de la partida. Todo lo que manda una persona pasa por `session.act`, con las mismas
 * comprobaciones que lo de cualquiera: la sala solo mira lo suyo (`mayAct`: que la ficha sea de un
 * asiento, que este dentro, que la sala este jugando, que se le espere a el) y que la accion no
 * nombre nada que su equipo no conozca (actionReferences.ts: si no, 'missing', sin preguntar a la
 * partida, que diria que existe).
 *
 * Nadie recibe la partida entera: cada persona recibe su vista (la niebla de FOG) y los sucesos que
 * su equipo ve (eventFog.ts), llevados por el `Courier` (courier.ts: los pasos de los demas van
 * juntos en un mensaje, para no contar cuantos han sido). Las fichas de los asientos (`token`) son
 * el unico secreto: el servidor las pone en los enlaces de invitacion (una por persona) y las genera
 * el (`RoomContext.newToken`: el nucleo no tira de ningun azar).
 *
 * Estados: 'waiting' hasta que han entrado todas las personas (quien abandona antes se rinde y ya no
 * se le espera); 'playing' mientras la partida sigue; 'ended' cuando se decide. Quien se va puede
 * volver con su ficha (su vista al dia); quien abandona (lo decide el servidor) se rinde, o su
 * asiento pasa a la IA (`replaceWithAi`).
 */
import { isAnyTime } from '../actions/dispatch';
import { aiController } from '../controllers/aiController';
import { defaultAiProfile } from '../ai/defaultProfile';
import type { AiProfile } from '../ai/profile';
import type { GameContent } from '../content';
import { savedPart } from '../gameContent';
import { buildMatch, type MatchConfig } from '../match';
import { GAME_MODES, type GameModeRegistry } from '../modes';
import type { ActionResult, GameAction, GameEvent, GameState, SavedGameState, TeamId } from '../model';
import { readSaved, type SaveError } from '../save';
import { remoteController, type Controller } from '../session/controller';
import { GameSession, runMatch, type ActedStep } from '../session/gameSession';
import { teamIds, teamState } from '../teams';
import { isInt, isObject } from '../util/validation';
import { refersOnlyToKnown } from './actionReferences';
import { Courier, Outbox, type Outgoing } from './courier';
import { knowledgeOf } from './eventFog';
import {
  CURRENT_PROTOCOL,
  isCurrentProtocol,
  isValidMessage,
  type ClientMessageOf,
  type NetError,
  type RoomStatus,
  type SeatId,
  type ServerMessage,
} from './protocol';
import {
  aiSeat,
  isJoined,
  isSeatOf,
  people,
  personSeat,
  personWithToken,
  seatsFor,
  type PersonSeat,
  type Seat,
  type TokenCompare,
} from './seats';

export type { Outgoing } from './courier';
export type { AiSeat, PersonSeat, Seat } from './seats';

/** Lo que se elige de una sala: la partida y el perfil de la IA de cada equipo de la IA (por su nombre). */
export interface RoomConfig {
  match: MatchConfig;
  aiProfiles?: Readonly<Partial<Record<TeamId, string>>>;
}

/** Lo que el servidor le da a la sala para trabajar. */
export interface RoomContext {
  content: GameContent;
  modes?: GameModeRegistry;
  /** Una ficha que no se pueda adivinar, de `bytes` bytes de azar (el nucleo no tira de ninguno). */
  newToken: (bytes: number) => string;
  /** Si dos fichas son la misma (en tiempo constante, si el servidor quiere; si no, `===`). */
  sameToken?: TokenCompare;
  /** El perfil de la IA que se llama asi (si no se da, o no lo conoce, el del juego). */
  aiProfile?: (name: string, content: GameContent) => AiProfile | undefined;
}

/** La version de la sala guardada (sube cuando cambia lo que guarda; aparte del protocolo). */
export const ROOM_SNAPSHOT_VERSION = 1;

/** La sala entera como JSON, para guardarla (`restore` la recupera). */
export interface RoomSnapshot {
  version: number;
  status: RoomStatus;
  seats: Seat[];
  state: SavedGameState;
  /** El numero de la siguiente conexion que entre. */
  nextConnection: number;
}

export type JoinResult = { ok: true; seat: SeatId; connection: number; messages: Outgoing[] } | { ok: false; error: NetError };
export type RestoreResult = { ok: true; room: Room } | { ok: false; error: 'badSnapshot' | SaveError };

const ROOM_STATUSES: readonly RoomStatus[] = ['waiting', 'playing', 'ended'];
const isRoomStatus = (value: unknown): value is RoomStatus => (ROOM_STATUSES as readonly unknown[]).includes(value);

/** Un mensaje del cliente con numero de orden (lo que tiene efecto). */
type OrderedMessage = ClientMessageOf<'act' | 'endTurn' | 'surrender'>;

export class Room {
  private readonly session: GameSession;
  private readonly outbox = new Outbox();
  private readonly courier: Courier;
  /** El ultimo turno anunciado (para no repetirlo). */
  private announced: { team: TeamId; day: number } | null = null;
  /** Lo que vio quien acaba de actuar de su propia accion (lo deja `carry`, lo lleva su resultado). */
  private seenByActor: GameEvent[] | null = null;
  /** Cuantos mensajes se le han rechazado a cada asiento (de una ficha, o de la partida): para que el servidor frene a quien insiste. */
  private readonly rejections = new Map<SeatId, number>();
  private readonly sameToken: TokenCompare;

  private constructor(
    state: GameState,
    private readonly roomSeats: Seat[],
    private roomStatus: RoomStatus,
    private readonly context: RoomContext,
    private nextConnection: number,
  ) {
    this.sameToken = context.sameToken ?? ((given, stored) => given === stored);
    this.session = new GameSession(
      state,
      roomSeats.map((seat) => this.controllerFor(seat)),
    );
    this.courier = new Courier(state, this.outbox);
    this.session.subscribe((step) => this.carry(step));
  }

  /** Una sala nueva con esa partida: esperando a que entren sus personas. */
  static create(config: RoomConfig, context: RoomContext): Room {
    const state = buildMatch(config.match, { content: context.content, modes: context.modes });
    return new Room(state, seatsFor(state, config.aiProfiles ?? {}, context.newToken), 'waiting', context, 1);
  }

  /**
   * La sala guardada con `snapshot`, tal como estaba (la partida se comprueba como una guardada).
   * Nadie esta dentro al recuperarla: cada cliente vuelve a saludar (y recibe su vista entera).
   */
  static restore(snapshot: unknown, context: RoomContext): RestoreResult {
    if (!isObject(snapshot) || snapshot.version !== ROOM_SNAPSHOT_VERSION || !isRoomStatus(snapshot.status))
      return { ok: false, error: 'badSnapshot' };
    const read = readSaved(structuredClone(snapshot.state), context.content, { modes: context.modes ?? GAME_MODES });
    if (!read.ok) return read;
    const seats = restoredSeats(read.state, snapshot.seats);
    if (!seats || !isInt(snapshot.nextConnection, 1, Number.MAX_SAFE_INTEGER)) return { ok: false, error: 'badSnapshot' };
    const room = new Room(read.state, seats, snapshot.status, context, snapshot.nextConnection);
    room.resume();
    return { ok: true, room };
  }

  /** La sala entera, para guardarla (el registro de la sesion no hace falta: la partida decide igual al recuperarla). */
  snapshot(): RoomSnapshot {
    const snapshot: RoomSnapshot = {
      version: ROOM_SNAPSHOT_VERSION,
      status: this.roomStatus,
      seats: this.roomSeats,
      state: savedPart(this.state),
      nextConnection: this.nextConnection,
    };
    return structuredClone(snapshot);
  }

  /** La partida de verdad (solo para el servidor: a los clientes va su vista). */
  get state(): GameState {
    return this.session.state;
  }

  get status(): RoomStatus {
    return this.roomStatus;
  }

  get seats(): readonly Seat[] {
    return this.roomSeats;
  }

  /** Las personas de la sala (sus asientos). */
  people(): PersonSeat[] {
    return people(this.roomSeats);
  }

  /** A quien se espera ahora (una persona), o null. */
  get awaiting(): PersonSeat | null {
    const team = this.session.awaitingInput;
    return this.people().find((seat) => seat.team === team) ?? null;
  }

  /** Cuantos mensajes se le han rechazado al asiento (para frenar a quien insiste). */
  rejectionsOf(seat: SeatId): number {
    return this.rejections.get(seat) ?? 0;
  }

  /**
   * Alguien entra con su ficha (un saludo: `hello`, con su version). Si la ficha es de un asiento,
   * entra en el por una conexion nueva (`connection`; tambien para volver tras irse: la conexion de
   * antes queda fuera, `leave` con ella ya no hace nada) y recibe su asiento, su vista y a quien se
   * espera; si con el ya estan todos, la partida empieza y todos reciben lo que pase hasta que le
   * toque a una persona.
   */
  join(message: unknown): JoinResult {
    if (!isValidMessage(message) || message.kind !== 'hello') return { ok: false, error: 'badMessage' };
    if (!isCurrentProtocol(message)) return { ok: false, error: 'badVersion' };
    const seat = personWithToken(this.roomSeats, message.token, this.sameToken);
    if (!seat) return { ok: false, error: 'badToken' };
    const connection = this.nextConnection++;
    seat.connection = connection;
    const greeting: ServerMessage = {
      kind: 'welcome',
      seat: seat.id,
      team: seat.team,
      ...CURRENT_PROTOCOL,
      status: this.roomStatus,
      lastSeq: seat.lastSeq,
    };
    this.outbox.send(seat.id, greeting);
    this.sendSituation(seat);
    if (this.roomStatus === 'waiting') this.startIfComplete();
    return { ok: true, seat: seat.id, connection, messages: this.outbox.flush() };
  }

  /** La persona de ese asiento se ha ido por esa conexion (si entro por otra despues, no pasa nada). Puede volver con su ficha. */
  leave(seat: SeatId, connection: number): void {
    const person = personSeat(this.roomSeats, seat);
    if (!person || person.connection !== connection) return;
    person.connection = null;
    this.courier.forget(person);
  }

  /**
   * Un mensaje de un asiento: lo que hay que mandar por el (a el y a los demas). Un saludo es volver
   * a entrar; lo que no tiene forma de mensaje, 'badMessage'; un asiento que no es de una persona, 'noSeat'.
   */
  handle(seat: SeatId, message: unknown): Outgoing[] {
    const person = personSeat(this.roomSeats, seat);
    if (!person) return this.refuse(seat, 'noSeat');
    if (!isValidMessage(message)) return this.refuse(seat, 'badMessage');
    if (message.kind === 'hello') return this.rejoin(person, message);
    if (!isJoined(person)) return this.refuse(seat, 'notJoined', 'seq' in message ? message.seq : undefined);
    if (message.kind === 'resync') {
      this.sendSituation(person);
      return this.outbox.flush();
    }
    if (message.seq <= person.lastSeq) return this.refuse(seat, 'stale', message.seq);
    person.lastSeq = message.seq;
    return this.attend(person, message);
  }

  /** Un mensaje con efecto, ya en orden: una accion, rendirse o acabar el turno. */
  private attend(person: PersonSeat, message: OrderedMessage): Outgoing[] {
    switch (message.kind) {
      case 'act':
        return this.act(person, message.seq, message.action);
      case 'surrender':
        return this.act(person, message.seq, { kind: 'surrender' });
      case 'endTurn': {
        const problem = this.mayAct(person, { kind: 'endTurn' });
        if (problem) return this.refuse(person.id, problem, message.seq);
        return this.finishTurn(person);
      }
    }
  }

  /**
   * El servidor da por ido a quien no vuelve: su equipo se rinde (tambien si la sala aun espera:
   * entonces ya no se le espera) y su asiento queda libre. Lo que hay que mandar a los demas.
   */
  abandon(seat: SeatId): Outgoing[] {
    const person = personSeat(this.roomSeats, seat);
    if (!person) return this.refuse(seat, 'noSeat');
    if (this.roomStatus !== 'ended') this.session.act(person.team, { kind: 'surrender' });
    person.connection = null;
    this.courier.forget(person);
    if (this.roomStatus === 'waiting') this.startIfComplete();
    else this.advance();
    return this.outbox.flush().filter((outgoing) => outgoing.seat !== seat);
  }

  /**
   * El asiento pasa a jugarlo la IA (quien no vuelve, si los demas prefieren seguir contra la IA a
   * ganar por abandono): desde su turno en curso, si es el suyo. Lo que hay que mandar a los demas.
   */
  replaceWithAi(seat: SeatId, profile?: string): Outgoing[] {
    const person = personSeat(this.roomSeats, seat);
    if (!person) return this.refuse(seat, 'noSeat');
    this.courier.forget(person);
    const replacement = aiSeat(person.id, person.team, profile);
    this.roomSeats[person.id] = replacement;
    this.session.replaceController(person.team, this.controllerFor(replacement));
    if (this.roomStatus === 'waiting') this.startIfComplete();
    else this.advance();
    return this.outbox.flush().filter((outgoing) => outgoing.seat !== seat);
  }

  /**
   * Se le acaba el tiempo a quien se espera (el reloj del turno lo lleva el servidor): su turno acaba
   * como si hubiera pulsado «Fin de turno», este dentro o no. Si no se le esperaba, nada.
   */
  endTurnOf(seat: SeatId): Outgoing[] {
    const person = personSeat(this.roomSeats, seat);
    if (!person || this.roomStatus !== 'playing' || this.session.awaitingInput !== person.team) return [];
    return this.finishTurn(person);
  }

  private controllerFor(seat: Seat): Controller {
    if (seat.kind === 'person') return remoteController();
    const named = seat.profile === undefined ? undefined : this.context.aiProfile?.(seat.profile, this.context.content);
    return aiController(named ?? defaultAiProfile(this.context.content));
  }

  /** Un saludo de quien ya tiene asiento: vale si la ficha es la suya (vuelve a entrar). */
  private rejoin(person: PersonSeat, hello: ClientMessageOf<'hello'>): Outgoing[] {
    if (!this.sameToken(hello.token, person.token)) return this.refuse(person.id, 'badToken');
    const result = this.join(hello);
    return result.ok ? result.messages : this.refuse(person.id, result.error);
  }

  /** Una sala recuperada en juego vuelve al punto en que se espera a alguien (sin mandar nada: nadie esta dentro). */
  private resume(): void {
    for (const person of this.people()) person.connection = null;
    if (this.roomStatus !== 'playing') return;
    this.advance();
    this.outbox.flush();
  }

  /** Si ya estan todas las personas que hacen falta (dentro, o rendidas), la partida empieza. */
  private startIfComplete(): void {
    const isIn = (seat: PersonSeat) => isJoined(seat) || teamState(this.state, seat.team).resigned;
    if (!this.people().every(isIn)) return;
    this.roomStatus = 'playing';
    this.advance();
  }

  /** Por que la sala no atiende ahora una accion de esta persona (null: la atiende). */
  private mayAct(person: PersonSeat, action: GameAction): NetError | null {
    if (this.roomStatus !== 'playing') return 'notPlaying';
    if (this.session.awaitingInput !== person.team && !isAnyTime(action)) return 'notYourTurn';
    return null;
  }

  /** Una accion de una persona, por la sesion: su resultado para ella (antes que lo que ha cambiado) y, si cambia algo, lo que ven todos. */
  private act(person: PersonSeat, seq: number, action: GameAction): Outgoing[] {
    const problem = this.mayAct(person, action);
    if (problem) return this.refuse(person.id, problem, seq);
    const before = this.outbox.flush();
    const result = this.dispatchKnown(person, action);
    const stepMessages = this.outbox.flush();
    if (!result.ok) this.countRejection(person.id);
    this.advance();
    return [...before, { seat: person.id, message: { kind: 'result', seq, result } }, ...stepMessages, ...this.outbox.flush()];
  }

  /**
   * La accion por la sesion, si solo nombra lo que su equipo conoce (si no, 'missing' sin preguntar a
   * la partida). Si vale, sus sucesos tal como los ve su equipo (los mismos que le llegan en 'events').
   */
  private dispatchKnown(person: PersonSeat, action: GameAction): ActionResult {
    const known = this.courier.knownOf(person) ?? knowledgeOf(this.state, person.team).state;
    if (!refersOnlyToKnown(action, known)) return { ok: false, reason: 'missing' };
    this.seenByActor = null;
    const result = this.session.act(person.team, action);
    if (!result.ok) return result;
    return { ok: true, events: this.seenByActor ?? [] };
  }

  /** La persona ha acabado su turno: la sesion sigue (sus ordenes permanentes, los demas equipos) hasta la siguiente persona. */
  private finishTurn(person: PersonSeat): Outgoing[] {
    this.session.finishInput(person.team);
    this.advance();
    return this.outbox.flush();
  }

  /**
   * Lleva la partida hasta que haya que esperar a una persona (y lo anuncia) o se acabe (y lo
   * anuncia). Al parar, cada persona recibe lo que le quedaba por ver (todo junto).
   */
  private advance(): void {
    if (this.roomStatus !== 'playing') return;
    const step = runMatch(this.session);
    if (step.kind === 'over') this.roomStatus = 'ended';
    this.courier.deliverAll(this.joinedPeople());
    if (step.kind === 'over') for (const seat of this.joinedPeople()) this.outbox.send(seat.id, { kind: 'ended', result: step.result });
    if (step.kind === 'awaitingInput') this.announceTurn(step.team);
  }

  /** A quien se espera, una vez por turno (con lo pendiente de cada uno antes). */
  private announceTurn(team: TeamId): void {
    const turn = { team, day: this.state.day };
    if (this.announced?.team === turn.team && this.announced.day === turn.day) return;
    this.announced = turn;
    for (const seat of this.joinedPeople()) this.courier.sendTurn(seat, turn.team, turn.day);
  }

  /** Un paso de la sesion: a cada persona, lo que ve (el correo lo lleva); lo de quien actuo, para su resultado. */
  private carry(step: ActedStep): void {
    const seenBy = this.courier.carry(step, this.joinedPeople());
    const actor = this.people().find((seat) => seat.team === step.team);
    if (actor) this.seenByActor = seenBy.get(actor.id) ?? null;
  }

  /** La vista del asiento y en que punto esta la partida (a quien se espera, o que ha acabado). */
  private sendSituation(seat: PersonSeat): void {
    this.courier.sendView(seat);
    const result = this.session.result;
    if (result.status !== 'playing') this.outbox.send(seat.id, { kind: 'ended', result });
    else if (this.announced && this.roomStatus === 'playing') this.courier.sendTurn(seat, this.announced.team, this.announced.day);
  }

  private joinedPeople(): PersonSeat[] {
    return this.people().filter(isJoined);
  }

  private refuse(seat: SeatId, error: NetError, seq?: number): Outgoing[] {
    this.countRejection(seat);
    this.outbox.send(seat, { kind: 'error', error, ...(seq === undefined ? {} : { seq }) });
    return this.outbox.flush();
  }

  private countRejection(seat: SeatId): void {
    this.rejections.set(seat, this.rejectionsOf(seat) + 1);
  }
}

/** Los asientos guardados, si estan bien (uno por equipo de la partida, en orden); si no, null. */
function restoredSeats(s: GameState, value: unknown): Seat[] | null {
  const teams = teamIds(s);
  if (!Array.isArray(value) || value.length !== teams.length) return null;
  const seats = value.filter((seat, id): seat is Seat => isSeatOf(s, seat, id));
  return seats.length === teams.length ? seats : null;
}
