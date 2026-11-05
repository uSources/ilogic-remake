/** Clima de la partida (ids de weather.json, ver weatherTypeOf). */
export interface WeatherState {
  kind: string;
  /** Dias que quedan contando el de hoy (al llegar a 0 entra `next`). */
  left: number;
  next: string;
}
