/**
 * Una partida por la red, sin red: el protocolo como datos (`net/protocol`), la sala que lo habla
 * sobre una `GameSession` (`net/room`, con sus asientos en `net/seats` y el correo que lleva a cada
 * persona lo que ve en `net/courier`), la niebla de los sucesos que decide lo que ve cada equipo de
 * cada paso (`net/eventFog`) y la partida de un cliente a partir de su vista (`net/clientState`). El servidor (Cloudflare Workers) y la pantalla lo
 * usan desde aqui; ni la IA ni las ordenes lo conocen (ESLint lo vigila: net/ lee la partida y manda
 * por la sesion, nunca la cambia a mano).
 *
 * | Modulo | Que va |
 * |---|---|
 * | `net/protocol` | `ClientMessage`, `ServerMessage`, `PROTOCOL_VERSION`, `isValidMessage`, lo que cambia de una vista (`viewChangeOf`, `mergeView`) |
 * | `net/room` | `Room`: asientos con ficha, `join`, `claimSeat`, `handle`, `snapshot`/`restore`, `abandon`, `replaceWithAi`, `endTurnOf`, `isMidway`/`continueMatch`; cuando empieza (`StartRule`) |
 * | `net/seats` | los asientos (`Seat`): quien los ocupa y lo que se apunta de cada persona |
 * | `net/roomCode` | la forma del codigo de una sala (`isRoomCode`), la misma en el servidor y en la pantalla |
 * | `net/search` | los ritmos de la busqueda de rival (`SearchPace`, `PACE_RULES`), los mismos en el servidor y en la pantalla |
 * | `net/courier` | `Courier`: lo que se lleva a cada persona, por lotes, con su numero; `Outbox` |
 * | `net/eventFog` | `eventsSeenBy`: los sucesos de un paso tal como los ve un equipo (`Knowledge`, `Vantage`) |
 * | `net/clientState` | `viewSnapshotOf` (lo que se manda), `loadView` (lo que lee el cliente) y `fillWith` (meter la vista nueva en la misma partida) |
 */
export {
  CLIENT_MESSAGE_SHAPES,
  CURRENT_PROTOCOL,
  FIXED_VIEW_KEYS,
  isCurrentProtocol,
  isSeq,
  isToken,
  isValidMessage,
  isWithinBounds,
  MAX_LIST,
  MAX_TEXT,
  mergeView,
  PROTOCOL_VERSION,
  viewChangeOf,
  type ClientMessage,
  type ClientMessageKind,
  type ClientMessageOf,
  type FixedViewKey,
  type NetError,
  type ProtocolVersion,
  type RoomStatus,
  type SeatId,
  type ServerMessage,
  type ServerMessageKind,
  type ServerMessageOf,
  type TurnTimeLeft,
  type ViewChange,
  type ViewSnapshot,
} from './net/protocol';
export {
  ADVANCE_STEP_BUDGET,
  Room,
  ROOM_SNAPSHOT_VERSION,
  type AiSeat,
  type ClaimError,
  type ClaimResult,
  type JoinResult,
  type Outgoing,
  type PersonSeat,
  type RestoreResult,
  type RoomConfig,
  type RoomContext,
  type RoomSnapshot,
  type Seat,
  type StartRule,
} from './net/room';
export { type TokenCompare } from './net/seats';
export { isRoomCode, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from './net/roomCode';
export { isSearchPace, MAX_AVOIDED_ROOMS, PACE_RULES, SEARCH_PACES, type PaceRules, type SearchPace } from './net/search';
export { eventsSeenBy, knowledgeOf, type Knowledge, type Vantage } from './net/eventFog';
export { fillWith, loadView, viewSnapshotOf } from './net/clientState';
