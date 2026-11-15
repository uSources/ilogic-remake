/**
 * Los relojes de una sala, como datos puros (el Durable Object los guarda y pone una sola alarma,
 * la del primero que vence): cuando caduca la sala si nadie la toca, cuando se le acaba el turno a
 * quien se espera (si el creador pidio reloj), cuando los que no han llegado pasan a la IA (si lo
 * pidio) y cuando hay que seguir una partida que se quedo a medias (la IA gasto el presupuesto de
 * pasos de una llamada: se sigue en otra, desde la alarma, con su tiempo de CPU aparte). Aqui se
 * calcula; quien lo cumple es roomObject.ts.
 */
import type { SeatId } from '@core/net';
import { ROOM_EXPIRY_MS } from './limits';
import type { Awaited } from './roomAdapter';

/** El reloj del turno de alguien: su asiento y su dia (otro dia es otro turno, con reloj nuevo) y cuando vence. */
export interface TurnTimer extends Awaited {
  at: number;
}

export interface Timers {
  /** Cuando se borra la sala si nadie la toca antes. */
  expiresAt: number;
  turn: TurnTimer | null;
  /** Cuando los asientos vacios pasan a la IA (null: se les espera siempre). */
  waitingUntil: number | null;
  /** Cuando hay que seguir la partida que se quedo a medias (null: no esta a medias). */
  continueAt: number | null;
}

/** Lo que pidio el creador de los relojes (segundos; sin uno, no hay ese reloj). */
export interface TimerSettings {
  turnSeconds?: number;
  waitingSeconds?: number;
}

export type TimerKind = 'expiry' | 'waiting' | 'turn' | 'continue';

/** Los relojes de una sala recien creada. */
export function initialTimers(settings: TimerSettings, now: number): Timers {
  const waitingUntil = settings.waitingSeconds === undefined ? null : now + settings.waitingSeconds * 1000;
  return { expiresAt: now + ROOM_EXPIRY_MS, turn: null, waitingUntil, continueAt: null };
}

/** Alguien ha tocado la sala: caduca mas tarde. */
export const touched = (timers: Timers, now: number): Timers => ({ ...timers, expiresAt: now + ROOM_EXPIRY_MS });

/** Ya no hace falta esperar a nadie (la partida empezo, o se les dio a la IA). */
export const doneWaiting = (timers: Timers): Timers => ({ ...timers, waitingUntil: null });

/**
 * El reloj del turno segun a quien se espera ahora: el mismo turno conserva su reloj; otro turno (u
 * otro asiento) lo empieza; si no se espera a nadie, o no hay reloj, ninguno.
 */
export function withTurnOf(timers: Timers, awaited: Awaited | null, settings: TimerSettings, now: number): Timers {
  if (!awaited || settings.turnSeconds === undefined) return { ...timers, turn: null };
  const sameTurn = timers.turn?.seat === awaited.seat && timers.turn.day === awaited.day;
  return sameTurn ? timers : { ...timers, turn: { ...awaited, at: now + settings.turnSeconds * 1000 } };
}

/** La partida se ha quedado a medias (o no): seguirla cuanto antes, en otra llamada. */
export const withContinuation = (timers: Timers, isPending: boolean, now: number): Timers => ({
  ...timers,
  continueAt: isPending ? now : null,
});

/** Cuando tiene que sonar la alarma: el primer reloj que vence. */
export function nextAlarm(timers: Timers): number {
  const deadlines = [timers.expiresAt, timers.turn?.at, timers.waitingUntil, timers.continueAt].filter(
    (at): at is number => at !== undefined && at !== null,
  );
  return Math.min(...deadlines);
}

/** Los relojes que ya han vencido, con la caducidad delante (si la sala caduca, lo demas da igual). */
export function dueTimers(timers: Timers, now: number): TimerKind[] {
  const due: TimerKind[] = [];
  if (timers.expiresAt <= now) due.push('expiry');
  if (timers.waitingUntil !== null && timers.waitingUntil <= now) due.push('waiting');
  if (timers.turn && timers.turn.at <= now) due.push('turn');
  if (timers.continueAt !== null && timers.continueAt <= now) due.push('continue');
  return due;
}

/** El asiento al que se le ha acabado el turno (si el reloj del turno ha vencido). */
export const timedOutSeat = (timers: Timers): SeatId | null => timers.turn?.seat ?? null;
