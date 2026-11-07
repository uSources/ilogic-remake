/**
 * Lo que un modulo de reglas puede aportar a la partida (solo tipos). Cada lista que miran las reglas
 * (los modificadores del acierto, los pasos del fin de ronda...) es la de las reglas de siempre mas
 * lo que aporten los modulos que la partida lleva enchufados (`RULE_MODULES`, registry.ts): las
 * reglas no preguntan "¿esta puesta la veterania?"; si lo esta, su modulo ha puesto su entrada.
 *
 * Una lista nueva que se pueda ampliar es un campo mas de `RuleHooks`, con el tipo de sus entradas.
 */
import type { MoveType, UnitType } from '../content';
import type {
  AttackRecord,
  Dice,
  Engagement,
  GameEvent,
  GameState,
  InterruptionKind,
  MatchSettings,
  Pos,
  RoundReport,
  TeamId,
  Unit,
} from '../model';

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

/** El defensor puede responder al ataque (el contraataque); basta con que una regla lo deje. */
export interface CounterRule {
  readonly id: string;
  allows(s: GameState, fight: Engagement): boolean;
}

/**
 * Momentos de un ataque, en orden (COMBAT_STAGES, actions/combat.ts): el golpe, el contraataque, lo
 * que pasa por herir (la carga de los generales) y lo que pasa si una cae (bajas, botin).
 */
export type CombatStage = 'strike' | 'counter' | 'wound' | 'kill';

/** Un paso de la resolucion de un ataque: cambia la partida y apunta lo suyo en el ataque. */
export interface CombatStep {
  readonly id: string;
  readonly stage: CombatStage;
  run(s: GameState, attack: AttackRecord, dice: Dice): void;
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

/** Una parte del resumen de la ronda: apunta en el resumen los sucesos que son suyos (y no hace nada con los demas). */
export interface RoundReportPart {
  readonly id: string;
  add(s: GameState, report: RoundReport, event: GameEvent): void;
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

/** Lo que cobra quien destruye una unidad de ese tipo (el botin). */
export interface KillReward {
  readonly id: string;
  amount(s: GameState, lost: Pick<Unit, 'type'>): number;
}

/** Lo que multiplica lo que resta una unidad al capturar (quickCapture). */
export interface CaptureFactor {
  readonly id: string;
  factor(s: GameState, unit: Unit): number;
}

/** Lo que cuesta entrar en una casilla a un tipo de movimiento (el coste del terreno). */
export interface EnterCostRule {
  readonly id: string;
  /** El coste con esta regla, partiendo de `cost` (1, o lo que han dejado las de antes). */
  cost(s: GameState, movement: MoveType, pos: Pos, cost: number): number;
}

/** Lo que puede gastar en un turno una unidad de ese tipo (el clima frena). */
export interface MoveBudgetRule {
  readonly id: string;
  /** Lo que puede gastar con esta regla, partiendo de `budget` (el `move` de su tipo, o lo de las de antes). */
  budget(s: GameState, unitType: UnitType, budget: number): number;
}

/** Lo que es otra unidad para quien se mueve: le cierra el paso, la atraviesa sin pararse encima o no sabe que esta. */
export type Passage = 'blocks' | 'passThrough' | 'unnoticed';

/** Lo que una regla de paso sabe de quien se mueve. */
export interface PassContext {
  readonly s: GameState;
  readonly mover: Unit;
  /** Lo que ve ahora su equipo (los aliados incluidos). */
  readonly sees: (pos: Pos) => boolean;
}

/** Que es otra unidad para quien se mueve (null = esta regla no dice nada: la siguiente). */
export interface PassRule {
  readonly id: string;
  passage(context: PassContext, other: Unit): Passage | null;
  /**
   * Lo que dice de cualquier unidad aliada (de la alianza de quien se mueve), sin mirar cual: asi se
   * pregunta sin una unidad de ejemplo (letsAlliesThrough). Contrato, para que las dos preguntas
   * digan lo mismo: si la regla lo pone, `passage` da eso para cualquier aliado; si no lo pone,
   * `passage` no dice nada (null) de ningun aliado. Lo mira tests/passage.test.ts con todas las
   * reglas de paso del juego.
   */
  readonly allies?: Passage;
}

/** Donde tiene que pararse quien se mueve por los enemigos de los que sabe (la zona de control). */
export interface StopRule {
  readonly id: string;
  stopTiles(s: GameState, mover: Unit, noticedFoes: readonly Unit[]): Pos[];
}

/** Algo que corta un camino a mitad al recorrerlo (traverse, rules/traverse.ts). */
export interface PathInterruption {
  readonly kind: InterruptionKind;
  /**
   * El primer paso del camino (su puesto en `path`, de 1 en adelante: la casilla de salida no se
   * corta) que ya no se puede dar, o null si no corta. Otro numero es un fallo (traverse lo dice).
   */
  cutAt(s: GameState, unit: Unit, path: readonly Pos[]): number | null;
}

/** Las entradas que aporta un modulo a cada lista (las que no dice, ninguna). */
export interface RuleHooks {
  /** Modificadores del acierto, detras del poder y la proteccion (ver `hitModifiersOf`, rules/combat.ts). */
  readonly hitModifiers?: readonly HitModifier[];
  /** Perforar la proteccion (cuenta la mayor). */
  readonly coverPiercing?: readonly CoverPiercing[];
  /** Quien contraataca (`canCounter`, rules/combat.ts) y lo que pasa en cada ataque (COMBAT_RESOLUTION). */
  readonly counterRules?: readonly CounterRule[];
  readonly combatSteps?: readonly CombatStep[];
  /** Lo que se cobra por destruir una unidad (ver `killReward`, rules/economy.ts). */
  readonly killRewards?: readonly KillReward[];
  /** Pasos del fin de ronda (ver ROUND_PHASES, rules/round.ts). */
  readonly roundPhases?: readonly RoundPhase[];
  /** Partes del resumen de la ronda (ver ROUND_REPORT_PARTS, rules/round.ts). */
  readonly roundReportParts?: readonly RoundReportPart[];
  /** Lo que se prepara al crear la partida (buildMatch). */
  readonly matchSetup?: readonly MatchSetupStep[];
  /** Quien no se cura al acabar el dia (`unhealable`). */
  readonly healingBlocks?: readonly HealingBlock[];
  /** Vision (rules/visibility.ts): radio, ver todo, lo que se esconde y quien lo ve igual. */
  readonly visionRadius?: readonly VisionRadiusRule[];
  readonly revealRules?: readonly RevealRule[];
  readonly concealment?: readonly Concealment[];
  readonly coverSight?: readonly CoverSight[];
  /** Movimiento (rules/movementProfile.ts): coste de cada casilla y lo que se puede gastar. */
  readonly enterCosts?: readonly EnterCostRule[];
  readonly moveBudgets?: readonly MoveBudgetRule[];
  /** Quien hay en cada casilla (rules/passage.ts): por donde se pasa y donde hay que pararse. */
  readonly passRules?: readonly PassRule[];
  readonly stopRules?: readonly StopRule[];
  /** Lo que corta un camino a mitad (rules/traverse.ts). */
  readonly pathInterruptions?: readonly PathInterruption[];
  /** Captura (rules/capture.ts, `captureStrength`). */
  readonly captureFactors?: readonly CaptureFactor[];
}

/**
 * Los nombres de los modulos de reglas que hay: los del juego aqui; un modo que trae los suyos
 * (`GameMode.ruleModules`) anade su nombre ampliando esta interfaz (`declare module
 * '.../ruleModules/hooks' { interface RuleModuleIds { miModulo: true } }`). Los nombres no se
 * repiten en una partida (lo mira resolveRuleset).
 */
export interface RuleModuleIds {
  abilities: true;
  veterancy: true;
  flank: true;
  generals: true;
  weather: true;
  controlPoints: true;
  upkeep: true;
  noHealUnderFire: true;
  noFog: true;
  forestHides: true;
  terrainCost: true;
  passAllies: true;
  ambush: true;
  counterattack: true;
  bounty: true;
}

/**
 * El nombre de un modulo de reglas (ver RuleModuleIds). Como la lista se puede ampliar (un modo, las
 * pruebas de tests/modeHooks.test.ts), una tabla indexada por nombre es Partial, nunca exhaustiva.
 */
export type RuleModuleId = keyof RuleModuleIds;

/** Un modulo de reglas: una pieza del juego que se enchufa o no segun los ajustes de la partida. */
export interface RuleModule {
  readonly id: RuleModuleId;
  /** La partida lo lleva con estos ajustes. */
  isOn(settings: MatchSettings): boolean;
  readonly hooks: RuleHooks;
}
