/**
 * Una sala: una partida por la red, como logica pura. La lleva el servidor (un Durable Object en
 * Cloudflare Workers, o el que sea): el le pasa cada mensaje que llega (`join`, `handle`) y manda
 * por donde toque lo que la sala devuelve (`Outgoing`: que mensaje va a que asiento). La sala no sabe
 * de conexiones ni de relojes (los tiempos de espera y los abandonos los decide el servidor, que
 * llama a `abandon`), y se guarda y se recupera entera como JSON (`snapshot`, `restore`).
 *
 * Dentro es una `GameSession` como la de la pantalla: cada persona es un `remoteController` (la
 * sesion espera sus acciones), cada equipo de la IA juega en el servidor con `aiController` y los
 * dados son los de la partida. Todo lo que manda una persona pasa por `session.act`, con las mismas
 * comprobaciones que lo de cualquiera: la sala solo mira lo suyo (que la ficha sea de un asiento,
 * que la sala este jugando, que se le espere a el).
 *
 * Nadie recibe la partida entera: tras cada paso, cada persona recibe los sucesos que su equipo ve
 * (eventFog.ts) y su vista al dia (la niebla de FOG), y al entrar o al pedirla, su vista. Las fichas
 * de los asientos (`token`) son el unico secreto: el servidor las pone en los enlaces de invitacion
 * (una por persona) y las genera el (`RoomContext.newToken`: el nucleo no tira de ningun azar).
 *
 * Estados: 'waiting' hasta que han entrado todas las personas; 'playing' mientras la partida sigue;
 * 'ended' cuando se decide. Quien se va puede volver con su ficha (su vista al dia); quien abandona
 * (lo decide el servidor) se rinde.
 */
import { isAnyTime } from '../actions/dispatch';
import { aiController } from '../controllers/aiController';
import { defaultAiProfile } from '../ai/defaultProfile';
import type { AiProfile } from '../ai/profile';
import type { GameContent } from '../content';
import { savedPart } from '../gameContent';
import { buildMatch, type MatchConfig } from '../match';
import { GAME_MODES, type GameModeRegistry } from '../modes';
import type { GameAction, GameState, SavedGameState, TeamId } from '../model';
import { readSave, type SaveError } from '../save';
import { remoteController, type Controller } from '../session/controller';
import { GameSession, runMatch, type ActedStep } from '../session/gameSession';
import { teamIds, teamState } from '../teams';
import { isObject } from '../util/validation';
import { eventsSeenBy, knowledgeOf, type Knowledge } from './eventFog';
import {
  CURRENT_PROTOCOL,
  isCurrentProtocol,
  isToken,
  isValidMessage,
  PROTOCOL_VERSION,
  type ClientMessageOf,
  type NetError,
  type RoomStatus,
  type SeatId,
  type ServerMessage,
} from './protocol';

/** Un asiento de una persona: su equipo, la ficha con la que entra y si esta dentro ahora. */
export interface PersonSeat {
  kind: 'person';
  team: TeamId;
  token: string;
  joined: boolean;
}

/** Un asiento de la IA: juega el servidor, con ese perfil (por su nombre; si no, el del juego). */
export interface AiSeat {
  kind: 'ai';
  team: TeamId;
  profile?: string;
}

export type Seat = PersonSeat | AiSeat;

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
  /** El perfil de la IA que se llama asi (si no se da, o no lo conoce, el del juego). */
  aiProfile?: (name: string, content: GameContent) => AiProfile | undefined;
}

/** Un mensaje para un asiento. */
export interface Outgoing {
  seat: SeatId;
  message: ServerMessage;
}

/** La sala entera como JSON, para guardarla (`restore` la recupera). */
export interface RoomSnapshot {
  version: number;
  status: RoomStatus;
  seats: Seat[];
  state: SavedGameState;
}

export type JoinResult = { ok: true; seat: SeatId; messages: Outgoing[] } | { ok: false; error: NetError };
export type RestoreResult = { ok: true; room: Room } | { ok: false; error: 'badSnapshot' | SaveError };

/** Bytes de azar de cada ficha (192 bits: nadie la adivina). */
const TOKEN_BYTES = 24;

const ROOM_STATUSES: readonly RoomStatus[] = ['waiting', 'playing', 'ended'];
const isRoomStatus = (value: unknown): value is RoomStatus => (ROOM_STATUSES as readonly unknown[]).includes(value);

/** Un asiento guardado bien formado, del equipo `team` de la partida `s`, y de quien juega ese equipo (persona o IA). */
function isSeatOf(s: GameState, value: unknown, team: TeamId): value is Seat {
  if (!isObject(value) || value.team !== team) return false;
  const isPersonsTeam = teamState(s, team).controller === 'human';
  if (value.kind === 'person') return isPersonsTeam && isToken(value.token) && typeof value.joined === 'boolean';
  return value.kind === 'ai' && !isPersonsTeam && (value.profile === undefined || typeof value.profile === 'string');
}

/** El asiento de cada equipo segun quien lo juega: las personas, con su ficha; la IA, con su perfil. */
function seatsFor(s: GameState, config: RoomConfig, context: RoomContext): Seat[] {
  const seats = s.teams.map((team): Seat => {
    if (team.controller === 'ai') {
      const profile = config.aiProfiles?.[team.id];
      return { kind: 'ai', team: team.id, ...(profile === undefined ? {} : { profile }) };
    }
    return { kind: 'person', team: team.id, token: context.newToken(TOKEN_BYTES), joined: false };
  });
  const tokens = seats.flatMap((seat) => (seat.kind === 'person' ? [seat.token] : []));
  if (new Set(tokens).size !== tokens.length) throw new Error('Dos asientos con la misma ficha: newToken no da fichas distintas');
  return seats;
}

export class Room {
  private readonly session: GameSession;
  /** Lo que sabia cada persona que esta dentro tras el ultimo paso (el antes del siguiente). */
  private readonly known = new Map<SeatId, Knowledge>();
  /** Lo que ha salido en lo que va de mensaje, en orden. */
  private outbox: Outgoing[] = [];
  /** El ultimo turno anunciado (para no repetirlo). */
  private announced: { team: TeamId; day: number } | null = null;

  private constructor(
    state: GameState,
    private readonly roomSeats: Seat[],
    private roomStatus: RoomStatus,
    private readonly context: RoomContext,
  ) {
    this.session = new GameSession(
      state,
      roomSeats.map((seat) => this.controllerFor(seat)),
    );
    this.session.subscribe((step) => this.tell(step));
    for (const seat of this.people()) if (seat.joined) this.known.set(seat.team, knowledgeOf(state, seat.team));
    // Una sala recuperada en juego vuelve al punto en que se espera a alguien (lo que ya se habia anunciado no se repite).
    if (roomStatus === 'playing') {
      this.advance();
      this.outbox = [];
    }
  }

  /** Una sala nueva con esa partida: esperando a que entren sus personas. */
  static create(config: RoomConfig, context: RoomContext): Room {
    const state = buildMatch(config.match, { content: context.content, modes: context.modes });
    return new Room(state, seatsFor(state, config, context), 'waiting', context);
  }

  /** La sala guardada con `snapshot`, tal como estaba (la partida se comprueba como una guardada). */
  static restore(snapshot: unknown, context: RoomContext): RestoreResult {
    if (!isObject(snapshot) || snapshot.version !== PROTOCOL_VERSION || !isRoomStatus(snapshot.status))
      return { ok: false, error: 'badSnapshot' };
    const read = readSave(JSON.stringify(snapshot.state), context.content, context.modes ?? GAME_MODES);
    if (!read.ok) return read;
    const { seats } = snapshot;
    const teams = teamIds(read.state);
    if (!Array.isArray(seats) || seats.length !== teams.length || !teams.every((team) => isSeatOf(read.state, seats[team], team)))
      return { ok: false, error: 'badSnapshot' };
    // Cada asiento se acaba de comprobar; TypeScript no puede seguirlo por la lista.
    return { ok: true, room: new Room(read.state, seats as Seat[], snapshot.status, context) };
  }

  /** La sala entera, para guardarla (lo que llevaba la partida en juego; el registro de la sesion no hace falta: la partida decide igual). */
  snapshot(): RoomSnapshot {
    return structuredClone({ version: PROTOCOL_VERSION, status: this.roomStatus, seats: this.roomSeats, state: savedPart(this.state) });
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
    return this.roomSeats.filter((seat): seat is PersonSeat => seat.kind === 'person');
  }

  /** El asiento de una persona (un asiento que no es de una persona es un fallo del servidor). */
  private personSeat(seat: SeatId): PersonSeat {
    const found = this.roomSeats[seat];
    if (!found || found.kind !== 'person') throw new Error(`El asiento ${seat} no es de una persona`);
    return found;
  }

  private controllerFor(seat: Seat): Controller {
    if (seat.kind === 'person') return remoteController();
    const named = seat.profile === undefined ? undefined : this.context.aiProfile?.(seat.profile, this.context.content);
    return aiController(named ?? defaultAiProfile(this.context.content));
  }

  /**
   * Alguien entra con su ficha (un saludo: `hello`, con su version). Si la ficha es de un asiento,
   * entra en el (tambien para volver tras irse) y recibe su asiento, su vista y a quien se espera; si
   * con el ya estan todos, la partida empieza y todos reciben lo que pase hasta que le toque a una persona.
   */
  join(message: unknown): JoinResult {
    if (!isValidMessage(message) || message.kind !== 'hello') return { ok: false, error: 'badMessage' };
    if (!isCurrentProtocol(message)) return { ok: false, error: 'badVersion' };
    const seat = this.people().find((person) => person.token === message.token);
    if (!seat) return { ok: false, error: 'badToken' };
    seat.joined = true;
    this.known.set(seat.team, knowledgeOf(this.state, seat.team));
    const greeting: ServerMessage = { kind: 'welcome', seat: seat.team, team: seat.team, ...CURRENT_PROTOCOL, status: this.roomStatus };
    this.send(seat.team, greeting);
    this.sendSituation(seat.team);
    if (this.roomStatus === 'waiting' && this.people().every((person) => person.joined)) this.start();
    return { ok: true, seat: seat.team, messages: this.flush() };
  }

  /** La persona de ese asiento se ha ido (su conexion). Puede volver con su ficha. */
  leave(seat: SeatId): void {
    this.personSeat(seat).joined = false;
    this.known.delete(seat);
  }

  /**
   * Un mensaje de una persona que esta dentro: lo que hay que mandar por el (a ella y a los demas).
   * Un saludo repetido es volver a entrar; lo que no tiene forma de mensaje, 'badMessage'.
   */
  handle(seat: SeatId, message: unknown): Outgoing[] {
    const person = this.personSeat(seat);
    if (!isValidMessage(message)) return this.refuse(seat, 'badMessage');
    if (message.kind === 'hello') return this.rejoin(person, message);
    if (!person.joined) return this.refuse(seat, 'notJoined');
    switch (message.kind) {
      case 'resync':
        this.sendSituation(seat);
        return this.flush();
      case 'act':
        return this.act(person, message.action);
      case 'surrender':
        return this.act(person, { kind: 'surrender' });
      case 'endTurn':
        return this.finishTurn(person);
    }
  }

  /** El servidor da por ido a quien no vuelve: su equipo se rinde (si la partida esta en juego) y su asiento queda libre. */
  abandon(seat: SeatId): Outgoing[] {
    const person = this.personSeat(seat);
    const messages = this.roomStatus === 'playing' ? this.act(person, { kind: 'surrender' }) : [];
    this.leave(seat);
    return messages.filter((outgoing) => outgoing.seat !== seat);
  }

  /** Un saludo de quien ya tiene asiento: vale si la ficha es la suya (vuelve a entrar). */
  private rejoin(person: PersonSeat, hello: ClientMessageOf<'hello'>): Outgoing[] {
    if (hello.token !== person.token) return this.refuse(person.team, 'badToken');
    const result = this.join(hello);
    return result.ok ? result.messages : this.refuse(person.team, result.error);
  }

  /** Todos dentro: la partida empieza y avanza hasta que le toque a una persona. */
  private start(): void {
    this.roomStatus = 'playing';
    this.advance();
  }

  /** Una accion de una persona, por la sesion: su resultado para ella y, si cambia algo, lo que ven todos. */
  private act(person: PersonSeat, action: GameAction): Outgoing[] {
    if (this.roomStatus !== 'playing') return this.refuse(person.team, 'notPlaying');
    if (this.session.awaitingInput !== person.team && !isAnyTime(action)) return this.refuse(person.team, 'notYourTurn');
    const pending = this.outbox;
    this.outbox = [];
    const result = this.session.act(person.team, action);
    // El resultado antes que lo que ha cambiado (que ya ha salido por el paso).
    this.outbox = [...pending, { seat: person.team, message: { kind: 'result', result } }, ...this.outbox];
    this.advance();
    return this.flush();
  }

  /** La persona ha acabado su turno: la sesion sigue (sus ordenes permanentes, los demas equipos) hasta la siguiente persona. */
  private finishTurn(person: PersonSeat): Outgoing[] {
    if (this.roomStatus !== 'playing') return this.refuse(person.team, 'notPlaying');
    if (this.session.awaitingInput !== person.team) return this.refuse(person.team, 'notYourTurn');
    this.session.finishInput(person.team);
    this.advance();
    return this.flush();
  }

  /** Lleva la partida hasta que haya que esperar a una persona (y lo anuncia) o se acabe (y lo anuncia). */
  private advance(): void {
    if (this.roomStatus !== 'playing') return;
    const step = runMatch(this.session);
    if (step.kind === 'over') {
      this.roomStatus = 'ended';
      this.broadcast({ kind: 'ended', result: step.result });
      return;
    }
    if (step.kind === 'awaitingInput') this.announceTurn(step.team);
  }

  /** A quien se espera, una vez por turno. */
  private announceTurn(team: TeamId): void {
    const turn = { team, day: this.state.day };
    if (this.announced?.team === turn.team && this.announced.day === turn.day) return;
    this.announced = turn;
    this.broadcast({ kind: 'turn', ...turn });
  }

  /** Un paso de la sesion: a cada persona que esta dentro, lo que ve de el y como queda su vista. */
  private tell(step: ActedStep): void {
    for (const seat of this.people()) {
      const before = this.known.get(seat.team);
      if (!seat.joined || !before) continue;
      const after = knowledgeOf(this.state, seat.team);
      this.known.set(seat.team, after);
      const events = eventsSeenBy(step.events, { before, after });
      this.send(seat.team, { kind: 'events', actor: step.team, events, view: savedPart(after.state) });
    }
  }

  /** La vista del asiento y en que punto esta la partida (a quien se espera, o que ha acabado). */
  private sendSituation(seat: SeatId): void {
    const knowledge = this.known.get(seat) ?? knowledgeOf(this.state, seat);
    this.send(seat, { kind: 'view', view: savedPart(knowledge.state) });
    const result = this.session.result;
    if (result.status !== 'playing') this.send(seat, { kind: 'ended', result });
    else if (this.announced) this.send(seat, { kind: 'turn', ...this.announced });
  }

  private refuse(seat: SeatId, error: NetError): Outgoing[] {
    this.send(seat, { kind: 'error', error });
    return this.flush();
  }

  private send(seat: SeatId, message: ServerMessage): void {
    this.outbox.push({ seat, message });
  }

  /** A todas las personas que estan dentro. */
  private broadcast(message: ServerMessage): void {
    for (const seat of this.people()) if (seat.joined) this.send(seat.team, message);
  }

  private flush(): Outgoing[] {
    const sent = this.outbox;
    this.outbox = [];
    return sent;
  }
}
