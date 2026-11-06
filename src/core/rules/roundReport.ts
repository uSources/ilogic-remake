/**
 * El resumen de una ronda que enseña la escena (lo cobrado, pagado, curado, el clima...), sacado de
 * los sucesos del fin de ronda. Solo tipos: lo rellenan las partes del resumen (`ROUND_REPORT_PARTS`
 * en rules/round.ts y las `roundReportParts` de los modulos), cada una con los sucesos que son suyos.
 */
import type { WeatherType } from '../content';
import type { TeamId } from '../model';

/** Lo que ha cambiado el clima al empezar la ronda. */
export interface WeatherChange {
  from: WeatherType;
  to: WeatherType;
}

/** Lo que han dado los puntos de control en una ronda (ver RoundReport.control). */
export interface ControlReport {
  /** Dinero que ha dado a cada equipo, por numero de equipo (ya sumado en RoundReport.income). */
  income: number[];
  /** Cuantos puntos le han pagado a cada equipo. */
  held: number[];
  /** Cuantos estan disputados (no pagan a nadie). */
  contested: number;
}

export interface RoundReport {
  /** Lo que ha cobrado cada equipo, por numero de equipo. */
  income: number[];
  /** Mantenimiento pagado por cada equipo (si no llega el dinero, se paga lo que hay). */
  upkeep: number[];
  /** Unidades curadas en un edificio propio (uid, equipo, vida recuperada). */
  healed: { uid: number; team: TeamId; amount: number }[];
  /** [CAMBIO] Cambio de clima al empezar esta ronda (lo apunta el modulo del clima; si no, no esta). */
  weather?: WeatherChange | null;
  /**
   * [CAMBIO] Puntos de control (lo apunta su modulo): dinero que ha dado a cada equipo (ya sumado en
   * income), cuantos le han pagado y cuantos estan disputados.
   */
  control?: ControlReport;
}
