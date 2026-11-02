/** Avisos: lineas del resumen de la ronda. */

export interface ReportLineVM {
  icon: string;
  text: string;
  /** id de clima: se pinta su icono en vez de `icon`. */
  weather?: string;
  tone: 'gold' | 'green' | 'red' | 'plain';
}
