/**
 * El azar de la partida, en dos partes que no se mezclan. Los dados: las reglas tiran de ellos (el
 * combate) y su estado va en `GameState.dice`, asi que se guarda y se repite con la partida. Las
 * decisiones de la IA: su azar de cada turno sale de `GameState.decisionSeed`, del dia y del equipo
 * (`decisionRng`), asi que tambien se repite (al cargar, en una repeticion, por la red), y lo que
 * decide no cambia lo que sale en los dados ni al reves. El generador de mapas lleva su propio
 * `Rng` (lo da quien crea la partida).
 */
import type { Dice, GameState, Rng, TeamId } from './model';
import { randomStep, seededRng, turnSeed } from './util/random';

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

/** La semilla de las decisiones del equipo `team` en su turno de hoy: la misma cada vez que se juegue ese turno. */
export const turnSeedOf = (s: GameState, team: TeamId): number => turnSeed(s.decisionSeed, s.day, team);

/** El azar de las decisiones del equipo `team` en su turno de hoy (el que le da su vista: `PlayerView.turnSeed`). */
export const decisionRng = (s: GameState, team: TeamId): Rng => seededRng(turnSeedOf(s, team));
