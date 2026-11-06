/**
 * Los dados de la partida: las reglas tiran de ellos (el combate) y su estado va en `GameState.dice`,
 * asi que se guarda y se repite con la partida. Las decisiones de quien juega (la IA, el generador de
 * mapas) llevan su propio `Rng`: lo que decide no cambia lo que sale en los dados ni al reves.
 */
import type { Dice, GameState } from './model';
import { randomStep } from './util/random';

/** Los dados de la partida: cada tirada avanza `s.dice`. */
export function diceOf(s: GameState): Dice {
  return {
    roll: () => {
      const step = randomStep(s.dice);
      s.dice = step.next;
      return step.value;
    },
  };
}
