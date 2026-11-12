/**
 * El protocolo de una partida por la red, como datos: lo que manda un cliente (`ClientMessage`) y lo
 * que le contesta el servidor (`ServerMessage`). Todo es JSON (uids, casillas, acciones y sucesos:
 * nunca objetos de la partida), para que lo lleve cualquier transporte (WebSocket, HTTP) y lo guarde
 * cualquier almacen. La sala (room.ts) es quien lo habla; aqui solo esta su forma y como se comprueba
 * lo que llega de fuera (`isValidMessage`, campo a campo como `isGameAction`, y con topes de tamaño:
 * un cliente roto o malintencionado no puede colar nada que no tenga la forma de un mensaje). Los
 * bytes de cada mensaje, antes de convertirlo de JSON, los tiene que acotar el servidor (aqui ya
 * llega convertido).
 *
 * El servidor manda siempre la vista del equipo (`ViewSnapshot`: la partida con la niebla de FOG,
 * lo mismo que guarda una partida; se lee con `loadView`, clientState.ts) y de cada paso los sucesos
 * que ese equipo ve (eventFog.ts), nunca la partida entera: un cliente solo sabe lo que sabe su equipo.
 * Para no repetir lo que no cambia, un `events` lleva solo lo que puede cambiar de la vista
 * (`ViewChange`); lo fijo (el mapa, las reglas) llega con la vista entera (`view`) y el cliente lo junta
 * (`mergeView`).
 *
 * Orden y repeticiones: lo que tiene efecto (`act`, `endTurn`, `surrender`) lleva un numero de
 * orden del cliente (`seq`, creciente; el servidor contesta con el mismo en `result` y no repite lo
 * que ya hizo: 'stale'), asi un mensaje reenviado tras un corte no compra dos veces ni acaba dos
 * turnos. Un mensaje rechazado (un error de la sala o un `result` que no vale) tambien gasta su
 * numero: se vuelve a intentar con el siguiente, nunca con el mismo. Lo que manda el servidor a cada asiento lleva su `step` (creciente): si al cliente le
 * falta uno, pide su vista (`resync`).
 *
 * Version: `PROTOCOL_VERSION` sube cuando cambia la forma de un mensaje; la de las partidas
 * (`SAVE_VERSION`) va aparte en el saludo, porque la vista es una partida guardada. Un cliente con
 * otra version de cualquiera de las dos no entra ('badVersion').
 */
import { isGameAction } from '../actions/shape';
import { SAVE_VERSION } from '../saveVersion';
import type { ActionResult, GameAction, GameEvent, MatchResult, SavedGameState, TeamId } from '../model';
import { isInt, isObject } from '../util/validation';

/** La version de este protocolo (la forma de los mensajes). */
export const PROTOCOL_VERSION = 2;

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

/** Un asiento de la sala (su puesto en la lista de asientos): una persona por asiento, con su equipo. */
export type SeatId = number;

/** La partida tal como la sabe un equipo (su vista con niebla, en la forma de una partida guardada). */
export type ViewSnapshot = SavedGameState;

/**
 * Lo que no cambia en toda la partida (y las semillas, que en una vista son siempre 0): llega una vez
 * con la vista entera y no se repite en cada paso.
 */
export const FIXED_VIEW_KEYS = ['version', 'map', 'theme', 'settings', 'mode', 'turnOrder', 'dice', 'decisionSeed'] as const;
export type FixedViewKey = (typeof FIXED_VIEW_KEYS)[number];

/** Lo que puede cambiar de una vista de un paso a otro (lo que lleva cada `events`). */
export type ViewChange = Omit<ViewSnapshot, FixedViewKey>;

/** Como esta la sala: esperando a que entren todos, jugando o acabada. */
export type RoomStatus = 'waiting' | 'playing' | 'ended';

/** Lo que manda un cliente. */
export type ClientMessage =
  /** Entrar en la sala con la ficha de su asiento (la que le dio el enlace) y su version. */
  | { kind: 'hello'; token: string; protocol: number; save: number }
  /** Una accion de su equipo (la comprueba la partida, como la de cualquiera). */
  | { kind: 'act'; seq: number; action: GameAction }
  /** Ha acabado su turno (como «Fin de turno»). */
  | { kind: 'endTurn'; seq: number }
  /** Se rinde (vale en cualquier momento). */
  | { kind: 'surrender'; seq: number }
  /** Pide su vista otra vez (se ha perdido algo). */
  | { kind: 'resync' };

export type ClientMessageKind = ClientMessage['kind'];
export type ClientMessageOf<K extends ClientMessageKind> = Extract<ClientMessage, { kind: K }>;

/** Por que la sala no atiende un mensaje (ademas de lo que diga la partida de una accion: `result`). */
export type NetError =
  /** No tiene la forma de un mensaje (o se pasa de tamaño). */
  | 'badMessage'
  /** Otra version del protocolo o de las partidas. */
  | 'badVersion'
  /** La ficha no es de ningun asiento de esta sala. */
  | 'badToken'
  /** El asiento no es de una persona (o no existe). */
  | 'noSeat'
  /** El asiento no ha saludado (o se fue). */
  | 'notJoined'
  /** La sala no esta jugando (espera a los demas, o la partida ha acabado). */
  | 'notPlaying'
  /** No se le espera a el: no es su turno (lo que vale fuera de turno, rendirse, si). */
  | 'notYourTurn'
  /** Un numero de orden que ya se atendio (un mensaje repetido): no se vuelve a hacer. */
  | 'stale';

/** Lo que manda el servidor a un asiento. */
export type ServerMessage =
  /**
   * Ha entrado: su asiento, su equipo, la version con la que habla el servidor, como esta la sala y el
   * ultimo numero de orden suyo que se atendio (para seguir contando tras un corte).
   */
  | { kind: 'welcome'; seat: SeatId; team: TeamId; protocol: number; save: number; status: RoomStatus; lastSeq: number }
  /** La partida tal como la sabe su equipo, entera (al entrar, al volver y al pedirla). */
  | { kind: 'view'; step: number; view: ViewSnapshot }
  /**
   * Lo que ha pasado desde lo ultimo que se le mando, tal como lo ve su equipo, y como queda lo que
   * cambia de su vista. `actor`, el equipo del ultimo paso que lleva.
   */
  | { kind: 'events'; step: number; actor: TeamId; events: GameEvent[]; view: ViewChange }
  /** Lo que ha dicho la partida de una accion suya (`seq`, la suya; si vale, sus sucesos tal como los ve). */
  | { kind: 'result'; seq: number; result: ActionResult }
  /** A quien se espera ahora (su turno, o el de otra persona), y el dia. */
  | { kind: 'turn'; step: number; team: TeamId; day: number }
  /**
   * La sala ha acabado: la partida se ha decidido (`result`), o ya no juega ninguna persona
   * (`abandoned`: todas se han rendido o se han ido; la partida, si sigue, se queda sin jugar).
   */
  | { kind: 'ended'; result: MatchResult; abandoned: boolean }
  /** `seq`, el del mensaje rechazado si lo llevaba. */
  | { kind: 'error'; error: NetError; seq?: number };

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

/** Un numero de orden del cliente: entero desde 1 (el 0 es «ninguno todavia»). */
export const MAX_SEQ = Number.MAX_SAFE_INTEGER;
export const isSeq = (value: unknown): value is number => isInt(value, 1, MAX_SEQ);

/**
 * Topes de lo que puede traer una accion: una lista (un camino, unos uids) no pasa de MAX_LIST
 * entradas, un texto (un tipo de unidad, un poder, un nombre de escuadra) de MAX_TEXT letras, y nada
 * va mas hondo que MAX_DEPTH (una accion es llana: casillas y listas de casillas). Mas que eso no es
 * una accion que pueda valer: es alguien probando a cargar el servidor.
 */
export const MAX_LIST = 256;
export const MAX_TEXT = 64;
const MAX_DEPTH = 3;
const MAX_FIELDS = 16;

/** El valor cabe en los topes (ver MAX_LIST, MAX_TEXT, MAX_DEPTH), con todo lo que lleva dentro. */
export function isWithinBounds(value: unknown, depth = 0): boolean {
  if (depth > MAX_DEPTH) return false;
  if (typeof value === 'string') return value.length <= MAX_TEXT;
  if (Array.isArray(value)) return value.length <= MAX_LIST && value.every((entry) => isWithinBounds(entry, depth + 1));
  if (!isObject(value)) return true;
  const fields = Object.values(value);
  return fields.length <= MAX_FIELDS && fields.every((field) => isWithinBounds(field, depth + 1));
}

const isBoundedAction: FieldCheck = (value) => isWithinBounds(value) && isGameAction(value);

/** Por cada tipo de mensaje del cliente, la forma de cada uno de sus campos (el tipo exige una por campo). */
export const CLIENT_MESSAGE_SHAPES: { readonly [K in ClientMessageKind]: ShapeOf<K> } = {
  hello: { token: isToken, protocol: isVersionNumber, save: isVersionNumber },
  act: { seq: isSeq, action: isBoundedAction },
  endTurn: { seq: isSeq },
  surrender: { seq: isSeq },
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

/** Lo que puede cambiar de una vista (lo que va en cada `events`). */
export function viewChangeOf(view: ViewSnapshot): ViewChange {
  const change: Partial<ViewSnapshot> = { ...view };
  for (const key of FIXED_VIEW_KEYS) delete change[key];
  // Se acaban de quitar justo las claves fijas; TypeScript no sigue un `delete` por una lista.
  return change as ViewChange;
}

/** La vista entera a partir de la ultima entera (lo fijo) y lo que ha cambiado. */
export function mergeView(fixed: ViewSnapshot, change: ViewChange): ViewSnapshot {
  const kept: Partial<ViewSnapshot> = {};
  for (const key of FIXED_VIEW_KEYS) Object.assign(kept, { [key]: fixed[key] });
  // Lo fijo, de la vista entera; lo demas, de lo que cambio (lo opcional que ya no esta, fuera).
  return { ...kept, ...change } as ViewSnapshot;
}
