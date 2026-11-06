/**
 * Como sale el daño de un ataque: la tirada y la probabilidad de cada resultado, escritas una vez por
 * modelo (`DamageModel`) para que la tirada del combate y la prevision no se separen. La partida
 * elige el suyo con el ajuste `damageModel` (`DAMAGE_MODELS`); se construye una vez por partida, con
 * sus modulos de reglas (`damageModelOf`, ruleModules/ruleset.ts).
 */
import type { DamageModelId, Dice, MatchSettings } from '../model';

/** Un modelo de daño: un atacante con `life` puntos de vida que acierta cada uno con probabilidad `chance` (0..1). */
export interface DamageModel {
  /** El daño de una tirada (sin tope: la vida del defensor la pone quien llama). */
  roll(life: number, chance: number, dice: Dice): number;
  /** La probabilidad de cada daño: `distribution[k]` = P(daño = k), sin tope. */
  distribution(life: number, chance: number): number[];
}

/** El reparto despues de un disparo mas que acierta con probabilidad `chance`. */
function afterOneMoreShot(distribution: readonly number[], chance: number): number[] {
  // Lo que habia con `hits` aciertos pasa a `hits` si este falla y a `hits + 1` si acierta. Cada
  // casilla suma primero lo que llega acertando y luego lo que llega fallando (el orden de siempre).
  const next = new Array<number>(distribution.length + 1).fill(0);
  for (let hits = 0; hits < distribution.length; hits++) {
    next[hits]! += distribution[hits]! * (1 - chance);
    next[hits + 1]! += distribution[hits]! * chance;
  }
  return next;
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

/** Cada modelo de daño por su nombre (el ajuste `damageModel`), construido con los ajustes de la partida. */
export const DAMAGE_MODELS: { readonly [Id in DamageModelId]: (settings: Readonly<MatchSettings>) => DamageModel } = {
  shotByShot: () => SHOT_BY_SHOT,
  spread: (settings) => spreadAround(settings.damageSpread),
};

/** Los nombres de los modelos de daño (los que valen en el ajuste `damageModel`). */
export const DAMAGE_MODEL_IDS = Object.keys(DAMAGE_MODELS) as readonly DamageModelId[];

/** El modelo de daño de unos ajustes. */
export const damageModelFor = (settings: Readonly<MatchSettings>): DamageModel => DAMAGE_MODELS[settings.damageModel](settings);

/** La probabilidad de cada daño con ese modelo, con `life` llevada a no negativa y `chance` a 0..1. */
export function boundedDistribution(model: DamageModel, life: number, chance: number): number[] {
  return model.distribution(Math.max(0, life), Math.min(1, Math.max(0, chance)));
}
