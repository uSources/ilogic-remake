/** Avisos: lineas del resumen de la ronda. */

export interface ReportLineVM {
  icon: string;
  text: string;
  /** id de clima: se pinta su icono en vez de `icon`. */
  weather?: string;
  tone: 'gold' | 'green' | 'red' | 'plain';
}

/**
 * Cambio de persona en la misma pantalla (varias personas por turnos): tapa la partida hasta que la
 * siguiente dice que esta lista, para que no vea lo de la anterior.
 */
export interface HandoffVM {
  /** El equipo al que le toca, como se enseña (su numero contando desde 1). */
  team: number;
}
