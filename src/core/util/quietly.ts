/** Un paso que solo deja la partida en orden, sin sucesos (una invariante, un paso del fin de ronda). */
import type { GameEvent, GameState } from '../model';

/** El paso `step`, como uno que devuelve sus sucesos (ninguno). */
export const quietly =
  (step: (s: GameState) => void) =>
  (s: GameState): GameEvent[] => {
    step(s);
    return [];
  };
