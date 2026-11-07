/**
 * El protocolo de una partida por la red, como datos: lo que manda un cliente (`ClientMessage`) y lo
 * que le contesta el servidor (`ServerMessage`). Todo es JSON (uids, casillas, acciones y sucesos:
 * nunca objetos de la partida), para que lo lleve cualquier transporte (WebSocket, HTTP) y lo guarde
 * cualquier almacen. La sala (room.ts) es quien lo habla; aqui solo esta su forma y como se comprueba
 * lo que llega de fuera (`isValidMessage`, campo a campo como `isGameAction`: un cliente roto o
 * malintencionado no puede colar nada que no tenga la forma de un mensaje).
 *
 * El servidor manda siempre la vista del equipo (`ViewSnapshot`: la partida con la niebla de FOG,
 * lo mismo que guarda una partida; se lee con `loadView`, clientState.ts) y de cada paso los sucesos
 * que ese equipo ve (eventFog.ts), nunca la partida entera: un cliente solo sabe lo que sabe su equipo.
 *
 * Version: `PROTOCOL_VERSION` sube cuando cambia la forma de un mensaje; la de las partidas
 * (`SAVE_VERSION`) va aparte en el saludo, porque la vista es una partida guardada. Un cliente con
 * otra version de cualquiera de las dos no entra ('badVersion').
 */
import { isGameAction } from '../actions/shape';
import { SAVE_VERSION } from '../saveVersion';
import type { ActionResult, GameAction, GameEvent, MatchResult, SavedGameState, TeamId } from '../model';
import { isObject } from '../util/validation';

/** La version de este protocolo (la forma de los mensajes). */
export const PROTOCOL_VERSION = 1;

/** Las dos versiones con las que se entienden cliente y servidor: la del protocolo y la del formato de la partida. */
export interface ProtocolVersion {
  protocol: number;
  save: number;
}

/** La version con la que habla este nucleo. */
export const CURRENT_PROTOCOL: Readonly<ProtocolVersion> = Object.freeze({ protocol: PROTOCOL_VERSION, save: SAVE_VERSION });

/** El cliente habla la version de este nucleo (las dos). */
export const isCurrentProtocol = (version: ProtocolVersion): boolean =>
  version.protocol === CURRENT_PROTOCOL.protocol && version.save === CURRENT_PROTOCOL.save;

/** Un asiento de la sala: hoy, el equipo que ocupa (una persona por asiento; los de la IA no se ocupan). */
export type SeatId = TeamId;

/** La partida tal como la sabe un equipo (su vista con niebla, en la forma de una partida guardada). */
export type ViewSnapshot = SavedGameState;

/** Como esta la sala: esperando a que entren todos, jugando o acabada. */
export type RoomStatus = 'waiting' | 'playing' | 'ended';

/** Lo que manda un cliente. */
export type ClientMessage =
  /** Entrar en la sala con la ficha de su asiento (la que le dio el enlace) y su version. */
  | { kind: 'hello'; token: string; protocol: number; save: number }
  /** Una accion de su equipo (la comprueba la partida, como la de cualquiera). */
  | { kind: 'act'; action: GameAction }
  /** Ha acabado su turno (como «Fin de turno»). */
  | { kind: 'endTurn' }
  /** Se rinde (vale en cualquier momento). */
  | { kind: 'surrender' }
  /** Pide su vista otra vez (se ha perdido algo). */
  | { kind: 'resync' };

export type ClientMessageKind = ClientMessage['kind'];
export type ClientMessageOf<K extends ClientMessageKind> = Extract<ClientMessage, { kind: K }>;

/** Por que la sala no atiende un mensaje (ademas de lo que diga la partida de una accion: `result`). */
export type NetError =
  /** No tiene la forma de un mensaje. */
  | 'badMessage'
  /** Otra version del protocolo o de las partidas. */
  | 'badVersion'
  /** La ficha no es de ningun asiento de esta sala. */
  | 'badToken'
  /** El asiento no ha saludado (o se fue). */
  | 'notJoined'
  /** La sala no esta jugando (espera a los demas, o la partida ha acabado). */
  | 'notPlaying'
  /** No se le espera a el: no es su turno (lo que vale fuera de turno, rendirse, si). */
  | 'notYourTurn';

/** Lo que manda el servidor a un asiento. */
export type ServerMessage =
  /** Ha entrado: su asiento, su equipo, la version con la que habla el servidor y como esta la sala. */
  | { kind: 'welcome'; seat: SeatId; team: TeamId; protocol: number; save: number; status: RoomStatus }
  /** La partida tal como la sabe su equipo (al entrar, al volver y al pedirla). */
  | { kind: 'view'; view: ViewSnapshot }
  /** Un paso de la partida: lo que ha hecho `actor` tal como lo ve su equipo, y como queda su vista. */
  | { kind: 'events'; actor: TeamId; events: GameEvent[]; view: ViewSnapshot }
  /** Lo que ha dicho la partida de una accion suya (si vale, sus sucesos vienen ademas en 'events'). */
  | { kind: 'result'; result: ActionResult }
  /** A quien se espera ahora (su turno, o el de otra persona), y el dia. */
  | { kind: 'turn'; team: TeamId; day: number }
  /** La partida ha acabado. */
  | { kind: 'ended'; result: MatchResult }
  | { kind: 'error'; error: NetError };

export type ServerMessageKind = ServerMessage['kind'];
export type ServerMessageOf<K extends ServerMessageKind> = Extract<ServerMessage, { kind: K }>;

/** Si un campo tiene la forma que toca. */
type FieldCheck = (value: unknown) => boolean;
/** Una comprobacion por cada campo del mensaje de ese tipo (menos `kind`). */
type ShapeOf<K extends ClientMessageKind> = { readonly [Field in Exclude<keyof ClientMessageOf<K>, 'kind'>]-?: FieldCheck };

/** Una ficha de asiento: un texto no vacio y de un largo razonable (su contenido lo pone quien la genera). */
const MAX_TOKEN_LENGTH = 256;
export const isToken = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= MAX_TOKEN_LENGTH;

const isVersionNumber: FieldCheck = (value) => Number.isInteger(value);

/** Por cada tipo de mensaje del cliente, la forma de cada uno de sus campos (el tipo exige una por campo). */
export const CLIENT_MESSAGE_SHAPES: { readonly [K in ClientMessageKind]: ShapeOf<K> } = {
  hello: { token: isToken, protocol: isVersionNumber, save: isVersionNumber },
  act: { action: isGameAction },
  endTurn: {},
  surrender: {},
  resync: {},
};

const isClientMessageKind = (kind: unknown): kind is ClientMessageKind =>
  typeof kind === 'string' && Object.hasOwn(CLIENT_MESSAGE_SHAPES, kind);

/** El valor tiene la forma de un mensaje del cliente (no dice si la sala lo atiende ahora: eso lo dice ella). */
export function isValidMessage(value: unknown): value is ClientMessage {
  if (!isObject(value) || !isClientMessageKind(value.kind)) return false;
  const shape: Readonly<Record<string, FieldCheck>> = CLIENT_MESSAGE_SHAPES[value.kind];
  return Object.entries(shape).every(([field, check]) => check(value[field]));
}
