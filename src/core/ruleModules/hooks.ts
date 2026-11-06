/**
 * Lo que un modulo de reglas puede aportar a la partida (solo tipos). Cada lista que miran las reglas
 * (los modificadores del acierto, los pasos del fin de ronda...) es la de las reglas de siempre mas
 * lo que aporten los modulos que la partida lleva enchufados (`RULE_MODULES`, registry.ts): las
 * reglas no preguntan "¿esta puesta la veterania?"; si lo esta, su modulo ha puesto su entrada.
 *
 * Una lista nueva que se pueda ampliar es un campo mas de `RuleHooks`, con el tipo de sus entradas.
 */
import type { GameEvent, GameState, MatchSettings, Pos, TeamId, Unit } from '../model';
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

/**
 * Momentos del fin de ronda, en orden (ROUND_STAGES, rules/round.ts): empezar (las unidades y los
 * generales vuelven a poder actuar), cobrar, pagar, el dia nuevo y apuntar como acaba.
 */
export type RoundStage = 'start' | 'income' | 'costs' | 'newDay' | 'record';

/** Un paso del fin de ronda: cambia el estado y devuelve sus sucesos (los que tenga). */
export interface RoundPhase {
  /** Nombre corto (para depurar). */
  readonly id: string;
  /** En que momento va (dentro de cada uno, los de siempre primero y luego los de los modulos). */
  readonly stage: RoundStage;
  run(s: GameState): GameEvent[];
}

/** Algo que se prepara al empezar una partida nueva (el clima del primer dia). */
export interface MatchSetupStep {
  readonly id: string;
  run(s: GameState): void;
}

/** Una razon por la que una unidad no se cura en un edificio al acabar el dia. */
export interface HealingBlock {
  readonly id: string;
  blocks(s: GameState, unit: Unit): boolean;
}

/** Lo que cambia el radio de vision de una unidad (el clima). */
export interface VisionRadiusRule {
  readonly id: string;
  /** El radio con este cambio, partiendo de `radius` (el de su tipo, o el que han dejado los de antes). */
  radius(s: GameState, unit: Unit, radius: number): number;
}

/** Algo por lo que un equipo ve todo el mapa (sin niebla, el reconocimiento de un general). */
export interface RevealRule {
  readonly id: string;
  revealsAll(s: GameState, team: TeamId): boolean;
}

/** Algo que esconde una casilla: solo se ve desde al lado (el bosque). */
export interface Concealment {
  readonly id: string;
  conceals(s: GameState, pos: Pos): boolean;
}

/** Algo por lo que una unidad ve lo que se esconde (Concealment) en todo su radio (scout). */
export interface CoverSight {
  readonly id: string;
  seesIntoCover(s: GameState, unit: Unit): boolean;
}

/** Lo que multiplica lo que resta una unidad al capturar (quickCapture). */
export interface CaptureFactor {
  readonly id: string;
  factor(s: GameState, unit: Unit): number;
}

/** Las entradas que aporta un modulo a cada lista (las que no dice, ninguna). */
export interface RuleHooks {
  /** Modificadores del acierto, detras del poder y la proteccion (ver `hitModifiersOf`, rules/combat.ts). */
  readonly hitModifiers?: readonly HitModifier[];
  /** Perforar la proteccion (cuenta la mayor). */
  readonly coverPiercing?: readonly CoverPiercing[];
  /** Pasos del fin de ronda (ver ROUND_PHASES, rules/round.ts). */
  readonly roundPhases?: readonly RoundPhase[];
  /** Lo que se prepara al crear la partida (buildMatch). */
  readonly matchSetup?: readonly MatchSetupStep[];
  /** Quien no se cura al acabar el dia (`unhealable`). */
  readonly healingBlocks?: readonly HealingBlock[];
  /** Vision (rules/visibility.ts): radio, ver todo, lo que se esconde y quien lo ve igual. */
  readonly visionRadius?: readonly VisionRadiusRule[];
  readonly revealRules?: readonly RevealRule[];
  readonly concealment?: readonly Concealment[];
  readonly coverSight?: readonly CoverSight[];
  /** Captura (rules/capture.ts, `captureStrength`). */
  readonly captureFactors?: readonly CaptureFactor[];
}

/** Los modulos de reglas que hay (los interruptores de los ajustes de la partida los enchufan). */
export type RuleModuleId =
  'abilities' | 'veterancy' | 'flank' | 'generals' | 'weather' | 'controlPoints' | 'upkeep' | 'noHealUnderFire' | 'noFog' | 'forestHides';

/** Un modulo de reglas: una pieza del juego que se enchufa o no segun los ajustes de la partida. */
export interface RuleModule {
  readonly id: RuleModuleId;
  /** La partida lo lleva con estos ajustes. */
  isOn(settings: MatchSettings): boolean;
  readonly hooks: RuleHooks;
}
