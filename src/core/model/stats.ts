/** Estadisticas de un equipo en la partida (para la pantalla final). */
export interface TeamStats {
  built: number;
  spent: number;
  /** Unidades perdidas (destruidas o estrelladas). */
  lost: number;
  /** Edificios ganados o neutralizados. */
  captured: number;
  /** Valor de su ejercito al empezar cada dia (para la grafica final): una muestra por dia. */
  army: number[];
}
