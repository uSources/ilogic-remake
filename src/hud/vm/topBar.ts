/** Barra de arriba: desglose del dinero y del dia, y el clima. */

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
  command: { lines: BreakdownLineVM[]; used: number; max: number } | null;
}

/** Desglose del dia al pasar por encima. */
export interface DayInfoVM {
  day: number;
  limit: number | null;
  /** Dias que quedan contando el de hoy (null sin limite). */
  left: number | null;
  /** Puntos de cada bando si la partida acabase ahora (solo con limite de dias). */
  score: [number, number] | null;
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
