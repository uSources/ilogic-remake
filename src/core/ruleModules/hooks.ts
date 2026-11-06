/**
 * Lo que un modulo de reglas puede aportar a la partida (solo tipos). Cada lista que miran las reglas
 * (los modificadores del acierto, los pasos del fin de ronda...) es la de las reglas de siempre mas
 * lo que aporten los modulos que la partida lleva enchufados (`RULE_MODULES`, registry.ts): las
 * reglas no preguntan "¿esta puesta la veterania?"; si lo esta, su modulo ha puesto su entrada.
 *
 * Una lista nueva que se pueda ampliar es un campo mas de `RuleHooks`, con el tipo de sus entradas.
 */
import type { GameState, MatchSettings, Unit } from '../model';
import type { Engagement } from '../rules/engagement';

/**
 * Algo que cambia la probabilidad de acierto (el poder del atacante, la proteccion, habilidades,
 * veterania, generales, clima...). Devuelve un multiplicador: 1 = nada.
 */
export interface HitModifier {
  /** Nombre corto (para depurar o enseñar el desglose). */
  readonly id: string;
  factor(s: GameState, fight: Engagement): number;
}

/** La parte (0..1) de la proteccion de la casilla del objetivo que no cuenta contra este atacante. */
export interface CoverPiercing {
  readonly id: string;
  ignoredCover(s: GameState, attacker: Unit): number;
}

/** Las entradas que aporta un modulo a cada lista (las que no dice, ninguna). */
export interface RuleHooks {
  /** Modificadores del acierto, detras del poder y la proteccion (ver `hitModifiersOf`, rules/combat.ts). */
  readonly hitModifiers?: readonly HitModifier[];
  /** Perforar la proteccion (cuenta la mayor). */
  readonly coverPiercing?: readonly CoverPiercing[];
}

/** Los modulos de reglas que hay (los interruptores de los ajustes de la partida los enchufan). */
export type RuleModuleId = 'abilities' | 'veterancy' | 'flank' | 'generals' | 'weather';

/** Un modulo de reglas: una pieza del juego que se enchufa o no segun los ajustes de la partida. */
export interface RuleModule {
  readonly id: RuleModuleId;
  /** La partida lo lleva con estos ajustes. */
  isOn(settings: MatchSettings): boolean;
  readonly hooks: RuleHooks;
}
