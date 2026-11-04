/** Bando: 0 = jugador, 1 = IA. */
export type Team = 0 | 1;

/** Los dos bandos, en orden (para recorrerlos sin escribir `[0, 1] as const`). */
export const TEAMS: readonly Team[] = [0, 1];
