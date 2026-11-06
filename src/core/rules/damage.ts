/**
 * Como sale el daño de un ataque: la tirada y la probabilidad de cada resultado, escritas una vez por
 * modelo (`DamageModel`) para que la tirada del combate y la prevision no se separen. La partida
 * elige el suyo con el ajuste `damageSpread` (`damageModelOf`).
 */
import type { Dice, GameState } from '../model';

/** Un modelo de daño: un atacante con `life` puntos de vida que acierta cada uno con probabilidad `chance` (0..1). */
export interface DamageModel {
  /** El daño de una tirada (sin tope: la vida del defensor la pone quien llama). */
  roll(life: number, chance: number, dice: Dice): number;
  /** La probabilidad de cada daño: `distribution[k]` = P(daño = k), sin tope. */
  distribution(life: number, chance: number): number[];
}

/** El reparto despues de un disparo mas que acierta con probabilidad `chance`. */
function afterOneMoreShot(distribution: readonly number[], chance: number): number[] {
  return Array.from(
    { length: distribution.length + 1 },
    (_, hits) => (distribution[hits - 1] ?? 0) * chance + (distribution[hits] ?? 0) * (1 - chance),
  );
}

/** Original: cada punto de vida es un disparo que acierta con probabilidad `chance` (binomial). */
export const SHOT_BY_SHOT: DamageModel = {
  roll(life, chance, dice) {
    let hits = 0;
    for (let shot = 0; shot < life; shot++) if (dice.roll() < chance) hits++;
    return hits;
  },
  distribution(life, chance) {
    let distribution = [1];
    for (let shot = 0; shot < life; shot++) distribution = afterOneMoreShot(distribution, chance);
    return distribution;
  },
};

/** Puntos con los que se muestrea el reparto del daño con `spreadAround`. */
const SPREAD_SAMPLES = 401;

/** Un reparto con 0 en los daños que no salen nunca. */
const withoutHoles = (distribution: readonly (number | undefined)[]): number[] =>
  Array.from(distribution, (probability) => probability ?? 0);

/**
 * [CAMBIO] El daño esperado (vida × acierto) +- `spread` (en tanto por uno), uniforme. La prevision lo
 * muestrea con SPREAD_SAMPLES puntos repartidos.
 */
export function spreadAround(spread: number): DamageModel {
  const damageAt = (expected: number, offset: number) => Math.max(0, Math.round(expected * (1 + offset * spread)));
  return {
    roll: (life, chance, dice) => damageAt(life * chance, dice.roll() * 2 - 1),
    distribution(life, chance) {
      const distribution: (number | undefined)[] = [];
      for (let i = 0; i < SPREAD_SAMPLES; i++) {
        const damage = damageAt(life * chance, (i / (SPREAD_SAMPLES - 1)) * 2 - 1);
        distribution[damage] = (distribution[damage] ?? 0) + 1 / SPREAD_SAMPLES;
      }
      return withoutHoles(distribution);
    },
  };
}

/** El modelo de daño de la partida: el original (disparo a disparo) o, con `damageSpread`, el esperado +- ese tanto. */
export function damageModelOf(s: GameState): DamageModel {
  return s.settings.damageSpread === null ? SHOT_BY_SHOT : spreadAround(s.settings.damageSpread);
}

/** La probabilidad de cada daño en esta partida (`life` no negativa y `chance` entre 0 y 1). */
export function damageDistribution(s: GameState, life: number, chance: number): number[] {
  return damageModelOf(s).distribution(Math.max(0, life), Math.min(1, Math.max(0, chance)));
}
