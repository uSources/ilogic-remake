/**
 * El reloj del turno de una partida en linea (la pastilla bajo el dia): que se enseña segun de quien
 * es el turno y lo que le queda. Lo cuenta, segundo a segundo, view3d/systems/net/turnClock.ts.
 */
import type { Side, TurnClockMood, TurnClockVM } from '../../hud/store';
import { t } from '../../settings';

/** En el turno propio, con esto o menos (segundos) el reloj se pone rojo, hace tic y «Fin del turno» parpadea. */
export const HURRY_SECONDS = 15;

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;

/** El turno que se ve: de quien es (su lado), su dia, lo que le queda y lo que dura (segundos). */
export interface ClockedTurn {
  side: Side;
  day: number;
  secondsLeft: number;
  totalSeconds: number;
}

/**
 * Los segundos enteros que le quedan a un reloj que vence a `endsAt` (ms), redondeando hacia arriba:
 * con medio segundo aun se ve «0:01», y «0:00» es que se ha acabado.
 */
export const secondsLeftOf = (endsAt: number, now: number): number => Math.max(0, Math.ceil((endsAt - now) / MS_PER_SECOND));

const twoDigits = (value: number): string => String(value).padStart(2, '0');

/** «1:26»; en un turno de horas (el de un dia), «23:59:12». */
export function clockText(seconds: number): string {
  const hours = Math.floor(seconds / SECONDS_PER_HOUR);
  const minutes = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const rest = twoDigits(seconds % SECONDS_PER_MINUTE);
  return hours > 0 ? `${hours}:${twoDigits(minutes)}:${rest}` : `${minutes}:${rest}`;
}

function moodOf(turn: ClockedTurn): TurnClockMood {
  if (turn.side !== 'own') return 'waiting';
  return turn.secondsLeft <= HURRY_SECONDS ? 'hurry' : 'calm';
}

function captionOf(turn: ClockedTurn, mood: TurnClockMood): string {
  if (mood === 'calm') return t('onlineClockOwn').replace('{day}', String(turn.day));
  if (mood === 'hurry') return t('onlineClockHurry');
  return t(turn.side === 'ally' ? 'onlineClockAlly' : 'onlineClockEnemy');
}

/** La pastilla del reloj para ese turno. */
export function turnClockVM(turn: ClockedTurn): TurnClockVM {
  const mood = moodOf(turn);
  const left = turn.totalSeconds > 0 ? Math.min(1, turn.secondsLeft / turn.totalSeconds) : 0;
  return { time: clockText(turn.secondsLeft), left, mood, caption: captionOf(turn, mood), side: turn.side };
}
