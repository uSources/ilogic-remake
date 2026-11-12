/**
 * Los asientos de una sala: quien ocupa cada uno (una persona con su ficha, o la IA con su perfil),
 * por que equipo juega, y lo que la sala apunta de cada persona (si esta dentro y por que conexion,
 * el ultimo numero de orden suyo y el ultimo mensaje que se le mando). Aqui esta lo que los
 * comprueba: la ficha de un saludo (`personWithToken`), un asiento guardado (`isSeatOf`) y los
 * asientos de una partida nueva (`seatsFor`). La sala (room.ts) solo los usa.
 */
import type { GameState, TeamId } from '../model';
import { teamState } from '../teams';
import { isInt, isObject } from '../util/validation';
import { isToken, type SeatId } from './protocol';

/** Un asiento de una persona: su equipo, la ficha con la que entra y lo que la sala le lleva contado. */
export interface PersonSeat {
  kind: 'person';
  id: SeatId;
  team: TeamId;
  token: string;
  /** La conexion por la que esta dentro, o null si no esta (ver `Room.join`). */
  connection: number | null;
  /** El ultimo numero de orden suyo que se atendio (0: ninguno). */
  lastSeq: number;
  /** El numero del ultimo mensaje que se le mando (0: ninguno). */
  step: number;
}

/** Un asiento de la IA: juega el servidor, con ese perfil (por su nombre; si no, el del juego). */
export interface AiSeat {
  kind: 'ai';
  id: SeatId;
  team: TeamId;
  profile?: string;
}

export type Seat = PersonSeat | AiSeat;

/** La persona esta dentro (tiene una conexion). */
export const isJoined = (seat: PersonSeat): boolean => seat.connection !== null;

/** Los asientos de personas, en orden. */
export const people = (seats: readonly Seat[]): PersonSeat[] => seats.filter((seat): seat is PersonSeat => seat.kind === 'person');

/** El asiento de una persona por su numero, o null si no hay tal asiento o no es de una persona. */
export function personSeat(seats: readonly Seat[], id: SeatId): PersonSeat | null {
  const seat = seats[id];
  return seat?.kind === 'person' ? seat : null;
}

/** Si dos fichas son la misma (el servidor puede dar una comparacion en tiempo constante). */
export type TokenCompare = (given: string, stored: string) => boolean;

/** La persona cuya ficha es `token`, o undefined. */
export const personWithToken = (seats: readonly Seat[], token: string, sameToken: TokenCompare): PersonSeat | undefined =>
  people(seats).find((seat) => sameToken(token, seat.token));

/** Bytes de azar de cada ficha (192 bits: nadie la adivina). */
export const TOKEN_BYTES = 24;

/** Un asiento de la IA para ese equipo (con su perfil, si lo tiene). */
export const aiSeat = (id: SeatId, team: TeamId, profile?: string): AiSeat => ({
  kind: 'ai',
  id,
  team,
  ...(profile === undefined ? {} : { profile }),
});

/**
 * El asiento de cada equipo segun quien lo juega: las personas, con su ficha (de `newToken`); la IA,
 * con su perfil (`aiProfiles`, por equipo). Hoy un asiento por equipo, en su orden.
 */
export function seatsFor(s: GameState, aiProfiles: Readonly<Partial<Record<TeamId, string>>>, newToken: (bytes: number) => string): Seat[] {
  const seats = s.teams.map((team): Seat => {
    if (team.controller === 'ai') return aiSeat(team.id, team.id, aiProfiles[team.id]);
    return { kind: 'person', id: team.id, team: team.id, token: newToken(TOKEN_BYTES), connection: null, lastSeq: 0, step: 0 };
  });
  const tokens = people(seats).map((seat) => seat.token);
  if (new Set(tokens).size !== tokens.length) throw new Error('Dos asientos con la misma ficha: newToken no da fichas distintas');
  return seats;
}

const MAX_COUNT = Number.MAX_SAFE_INTEGER;

/**
 * Un asiento guardado bien formado, el numero `id` de la partida `s`: de un equipo de la partida; si
 * es de una persona, de un equipo que juega una persona (uno de la IA puede ser de cualquiera: quien
 * abandona pasa a la IA).
 */
export function isSeatOf(s: GameState, value: unknown, id: SeatId): value is Seat {
  if (!isObject(value) || value.id !== id || !isInt(value.team, 0, s.teams.length - 1)) return false;
  if (value.kind === 'ai') return value.profile === undefined || typeof value.profile === 'string';
  if (value.kind !== 'person' || teamState(s, value.team).controller !== 'human') return false;
  const hasConnection = value.connection === null || isInt(value.connection, 1, MAX_COUNT);
  return isToken(value.token) && hasConnection && isInt(value.lastSeq, 0, MAX_COUNT) && isInt(value.step, 0, MAX_COUNT);
}
