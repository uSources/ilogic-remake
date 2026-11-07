/**
 * Un combate como datos: quien lucha con quien (Engagement, Fighter), lo que va dejando un ataque
 * mientras se resuelve (AttackRecord, con las partes de los modulos) y como sale el daño (DamageModel).
 * Solo tipos: las reglas (rules/engagement.ts, rules/attackRecord.ts, damage.ts) y los modulos de
 * reglas los usan sin depender unos de otros.
 */
import type { Dice } from './random';
import type { Pos } from './geometry';
import type { Unit } from './unit';

/** Una unidad en un combate tal como lucharia: en que casilla y con cuanta vida. */
export interface Fighter {
  readonly unit: Unit;
  readonly at: Pos;
  readonly life: number;
}

/** Un combate: `attacker` dispara a `defender` (el contraataque, si lo hay, es el mismo al reves). */
export interface Engagement {
  readonly attacker: Fighter;
  readonly defender: Fighter;
}

/**
 * Lo que apunta cada modulo en un ataque, por su nombre (el botin, la carga de los generales). Esta
 * vacia aqui: cada modulo que apunta algo la amplia (`declare module '../model/combat' { interface
 * AttackRecordParts { bounty: number } }`). El suceso del ataque lleva las que se han apuntado.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- se amplia con declare module
export interface AttackRecordParts {}

/** Un ataque a medio resolver: lo que van dejando sus pasos (COMBAT_RESOLUTION) y acaba en su suceso. */
export interface AttackRecord {
  readonly attacker: Unit;
  readonly defender: Unit;
  /** Vida que ha perdido el defensor. */
  damage: number;
  /** Vida que ha perdido el atacante en el contraataque. */
  counter: number;
  /** Lo que han apuntado los modulos (solo lo que de verdad ha pasado: un botin de 0 no se apunta). */
  parts: Partial<AttackRecordParts>;
}

/** Un modelo de daño: un atacante con `life` puntos de vida que acierta cada uno con probabilidad `chance` (0..1). */
export interface DamageModel {
  /** El daño de una tirada (sin tope: la vida del defensor la pone quien llama). */
  roll(life: number, chance: number, dice: Dice): number;
  /** La probabilidad de cada daño: `distribution[k]` = P(daño = k), sin tope. */
  distribution(life: number, chance: number): number[];
}
