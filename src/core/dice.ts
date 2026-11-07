/**
 * Los dados de la partida: las reglas tiran de ellos (el combate) y su estado va en `GameState.dice`,
 * asi que se guarda y se repite con la partida. Las decisiones de la IA van aparte (su semilla de cada
 * turno, `turnSeeds.ts`; quien decide la lee de su vista: `decisionRngOf`), asi que lo que decide no
 * cambia lo que sale en los dados ni al reves. El generador de mapas lleva su propio `Rng` (lo da
 * quien crea la partida).
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
