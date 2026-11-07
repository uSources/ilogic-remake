import type { GameEvent, GameEventKind, GameEventOf, Pos, TeamId } from '@core/model';

/**
 * Lo que nombra un suceso, para comprobar la niebla de los sucesos (eventFog.ts): las unidades
 * (uids) y las casillas que un equipo tiene que conocer para verlo, y los equipos cuya intimidad
 * toca (sus ordenes, sus ingresos). Una entrada por tipo, para que un suceso nuevo no se quede sin
 * comprobar.
 */
export interface EventReferences {
  uids: readonly number[];
  tiles: readonly Pos[];
  /** Equipos de los que el suceso cuenta algo privado: solo los ven sus aliados. */
  privateTo: readonly TeamId[];
}

type ReferencesOf<K extends GameEventKind> = (event: GameEventOf<K>) => Partial<EventReferences>;

const NOTHING: Partial<EventReferences> = {};

/**
 * El atacante no esta: quien dispara se delata en el suceso (su tipo y su vida), no donde esta; lo
 * que hace falta ver es donde cae el disparo (ver EVENT_FOG.attack).
 */
const EVENT_REFERENCES: { readonly [K in GameEventKind]: ReferencesOf<K> } = {
  move: (event) => ({ uids: [event.uid], tiles: [...event.path, ...(event.interruption ? [event.interruption.at] : [])] }),
  attack: (event) => ({ uids: [event.target], tiles: [event.at] }),
  capture: (event) => ({ uids: [event.uid], tiles: [event.at] }),
  merge: (event) => ({ uids: [event.uid, event.into], tiles: event.path }),
  load: (event) => ({ uids: [event.uid, event.into], tiles: event.path }),
  unload: (event) => ({ uids: [event.uid, event.passenger], tiles: [event.to] }),
  spawn: (event) => ({ uids: [event.uid], tiles: [event.at] }),
  wait: (event) => ({ uids: [event.uid] }),
  supply: (event) => ({ uids: [event.uid, ...event.repairs.map((repair) => repair.uid)] }),
  remove: (event) => ({ uids: [event.uid] }),
  undoMove: (event) => ({ uids: [event.uid], tiles: [event.to] }),
  standingOrder: (event) => ({ uids: event.uids, privateTo: [event.actor] }),
  standingOrderDone: (event) => ({ uids: [event.uid], privateTo: [event.actor] }),
  squad: (event) => ({ uids: event.uids }),
  power: (event) => ({
    uids: [...event.hits.map((hit) => hit.uid), ...(event.heals ?? []).map((heal) => heal.uid)],
    tiles: event.target ? [event.target] : [],
  }),
  cargoLost: (event) => ({ uids: [event.transport, ...event.passengers] }),
  captureDropped: (event) => ({ uids: [event.uid], tiles: [event.at] }),
  fundsCapped: (event) => ({ privateTo: [event.team] }),
  income: (event) => ({ privateTo: [event.team] }),
  heal: (event) => ({ uids: [event.uid] }),
  newDay: () => NOTHING,
  surrender: () => NOTHING,
  teamDefeated: () => NOTHING,
  turnStart: () => NOTHING,
  turnEnd: () => NOTHING,
  weather: () => NOTHING,
  upkeep: (event) => ({ privateTo: [event.team] }),
  controlPoint: () => NOTHING,
};

/** Lo que nombra el suceso (ver EventReferences). */
export function referencesOf(event: GameEvent): EventReferences {
  const extract = EVENT_REFERENCES[event.kind] as ReferencesOf<GameEventKind>;
  return { uids: [], tiles: [], privateTo: [], ...extract(event) };
}

/** Los sucesos que solo ven los aliados de quien los protagoniza, aunque no haya niebla. */
export const PRIVATE_KINDS: ReadonlySet<GameEventKind> = new Set<GameEventKind>([
  'standingOrder',
  'standingOrderDone',
  'squad',
  'income',
  'upkeep',
  'fundsCapped',
  // Quien iba dentro de un transporte enemigo no se sabe ni sin niebla.
  'cargoLost',
]);
