/** Clima de la partida (indices de weather.json). */
export interface WeatherState {
  kind: number;
  /** Dias que quedan contando el de hoy (al llegar a 0 entra `next`). */
  left: number;
  next: number;
}
