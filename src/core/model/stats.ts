/** Estadisticas de la partida, por bando [jugador, IA] (para la pantalla final). */
export interface GameStats {
  built: [number, number];
  spent: [number, number];
  /** Unidades perdidas (destruidas o estrelladas). */
  lost: [number, number];
  /** Edificios ganados o neutralizados. */
  captured: [number, number];
  /** Valor del ejercito de cada bando al empezar cada dia (para la grafica final). */
  army?: [number, number][];
}
