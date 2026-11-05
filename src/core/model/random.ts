/** Generador de numeros aleatorios en [0, 1): el de quien decide (IA, generador de mapas, herramientas). */
export type Rng = () => number;

/**
 * Los dados de las reglas (la tirada de un combate): cada `roll` da un numero en [0, 1). Los de la
 * partida (`diceOf(s)`, core/dice.ts) guardan su estado en `GameState.dice`, separados de las
 * decisiones de quien juega: elegir otra cosa no cambia lo que saldra en los dados.
 */
export interface Dice {
  roll(): number;
}
