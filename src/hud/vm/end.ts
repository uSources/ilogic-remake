/** Pantalla final: lo que ha hecho quien mira y lo que han hecho sus enemigos, juntos: [suyo, enemigos]. */
export type BySide = [own: number, enemies: number];

export interface EndStatsVM {
  built: BySide;
  spent: BySide;
  /** Unidades perdidas. */
  lost: BySide;
  /** Edificios ganados o neutralizados. */
  captured: BySide;
}
