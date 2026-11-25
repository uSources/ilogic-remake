/** Barra de arriba: desglose del dinero y del dia, el clima y el reloj del turno. */
import type { BySide, Side } from './common';

/** Una fila del desglose: "3 × Ciudad   +3.000". */
export interface BreakdownLineVM {
  label: string;
  count: number;
  /** Cantidad total de la fila (dinero o puntos). */
  amount: number;
}

/** Desglose del dinero al pasar por encima (barra de arriba). */
export interface EconomyVM {
  income: { lines: BreakdownLineVM[]; total: number; /** Multiplicador de la regla incomeScale (1 = normal). */ scale: number };
  /** null = regla de mantenimiento apagada. */
  upkeep: { lines: BreakdownLineVM[]; total: number; /** Tanto por uno del valor del ejercito. */ rate: number } | null;
  net: number;
  /** Dinero al empezar el proximo turno propio (ingresos, mantenimiento y tope de dinero). */
  next: number;
  /** El mantenimiento no se puede pagar entero: se paga solo esto. */
  shortfall: number | null;
  /** null = regla de puntos de mando apagada. */
  commandPoints: { lines: BreakdownLineVM[]; used: number; max: number } | null;
}

/** Desglose del dia al pasar por encima. */
export interface DayInfoVM {
  day: number;
  limit: number | null;
  /** Dias que quedan contando el de hoy (null sin limite). */
  left: number | null;
  /** Puntos de su alianza y de la mejor alianza enemiga si la partida acabase ahora (solo con limite de dias). */
  score: BySide | null;
}

/** Clima de la partida en la barra de arriba. */
export interface WeatherVM {
  /** id de weather.json (para el color del indicador). */
  id: string;
  name: string;
  /** Efectos, en corto ("Vehículos −1 mov. · Visión −1"). */
  effects: string;
  /** Pronostico: el clima que entra mañana, o null si sigue igual. */
  next: string | null;
}

/**
 * Como va el reloj: el turno propio con tiempo de sobra (azul), sus ultimos segundos (rojo, con un tic
 * cada segundo y «Fin del turno» que parpadea) o el turno de otro (oscuro: no es su momento).
 */
export type TurnClockMood = 'calm' | 'hurry' | 'waiting';

/** El reloj del turno de una partida en linea con reloj (la pastilla bajo el dia). */
export interface TurnClockVM {
  /** Lo que queda: «1:26» (en un turno de horas, «23:59:12»). */
  time: string;
  /** Lo que queda del turno, de 1 (entero) a 0: lo lleno del anillo. */
  left: number;
  mood: TurnClockMood;
  /** Debajo del tiempo: «Día 4 · Te toca», «Se acaba tu turno», «Juega el rojo». */
  caption: string;
  /** De quien es el turno (el color del anillo mientras juega otro). */
  side: Side;
}
