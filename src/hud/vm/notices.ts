/** Avisos que tapan la partida: «¡Rival encontrado!» y el cambio de persona en la misma pantalla. */

/**
 * «¡Rival encontrado!»: lo que enseña la carga de una partida que sale de «Buscar rival», en vez de la
 * barra sola (src/net/matchIntro.ts). Quien mira es siempre el azul; el rival, el rojo.
 */
export interface MatchIntroVM {
  /** Empieza quien mira (si no, el rival). */
  youStart: boolean;
  /** Lo que se juega, ya en texto: «20×20 · Desierto», «2 min por turno», «Niebla de guerra»… */
  chips: string[];
}

/**
 * Cambio de persona en la misma pantalla (varias personas por turnos): tapa la partida hasta que la
 * siguiente dice que esta lista, para que no vea lo de la anterior (view3d/systems/turn/hotSeat.ts).
 */
export interface HandoffVM {
  /** El equipo al que le toca, como se enseña (su numero contando desde 1). */
  team: number;
}
