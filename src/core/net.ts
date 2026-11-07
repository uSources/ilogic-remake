/**
 * Una partida por la red, sin red: el protocolo como datos (`net/protocol`), la sala que lo habla
 * sobre una `GameSession` (`net/room`), la niebla de los sucesos que decide lo que ve cada equipo de
 * cada paso (`net/eventFog`) y la partida de un cliente a partir de su vista (`net/clientState`). El
 * servidor (Cloudflare Workers) y la pantalla lo usan desde aqui; ni la IA ni las ordenes lo conocen
 * (ESLint lo vigila: net/ lee la partida y manda por la sesion, nunca la cambia a mano).
 *
 * | Modulo | Que va |
 * |---|---|
 * | `net/protocol` | `ClientMessage`, `ServerMessage`, `PROTOCOL_VERSION`, `isValidMessage` |
 * | `net/room` | `Room`: asientos con ficha, `join`, `handle`, `snapshot`/`restore`, `abandon` |
 * | `net/eventFog` | `eventsSeenBy`: los sucesos de un paso tal como los ve un equipo (`Knowledge`, `Vantage`) |
 * | `net/clientState` | `viewSnapshotOf` (lo que se manda) y `loadView` (lo que lee el cliente) |
 */
export {
  CLIENT_MESSAGE_SHAPES,
  CURRENT_PROTOCOL,
  isCurrentProtocol,
  isToken,
  isValidMessage,
  PROTOCOL_VERSION,
  type ClientMessage,
  type ClientMessageKind,
  type ClientMessageOf,
  type NetError,
  type ProtocolVersion,
  type RoomStatus,
  type SeatId,
  type ServerMessage,
  type ServerMessageKind,
  type ServerMessageOf,
  type ViewSnapshot,
} from './net/protocol';
export {
  Room,
  type AiSeat,
  type JoinResult,
  type Outgoing,
  type PersonSeat,
  type RestoreResult,
  type RoomConfig,
  type RoomContext,
  type RoomSnapshot,
  type Seat,
} from './net/room';
export { eventsSeenBy, knowledgeOf, type Knowledge, type Vantage } from './net/eventFog';
export { loadView, viewSnapshotOf } from './net/clientState';
