/**
 * Como juega quien decide por un equipo con los pasos de autopilot/ (las ordenes permanentes y la
 * IA): con que pesos (ai.json) y por que razones prefiere un ataque a otro. Se le da a quien juega
 * (`PlayCtx.profile`), nunca se lee de un sitio comun: asi dos IAs con otros pesos (`balance --vs`) juegan
 * a la vez en el mismo proceso. Las ordenes de la partida usan el de su contenido
 * (`autopilotProfileOf`, defaultProfile.ts); la IA, el suyo (`AiProfile`, ai/profile.ts).
 */
import type { AiWeights } from '../content';
import type { Building, GameState, Pos, TeamId, Unit } from '../model';

/** Un ataque que se esta valorando, con lo que comparten todos los terminos. */
export interface AttackPlan {
  s: GameState;
  /** El equipo que ataca. */
  me: TeamId;
  /** Los pesos de quien decide. */
  weights: Readonly<AiWeights>;
  attacker: Unit;
  /** La casilla desde la que dispara. */
  from: Pos;
  target: Unit;
  /** Vida que se espera quitar. */
  damage: number;
  /** Edificio bajo el objetivo, si lo hay. */
  targetBuilding: Building | undefined;
  /** Los mapas de influencia de quien decide, si los tiene (la IA; las ordenes, no). */
  influence: Influence | undefined;
}

/**
 * Lo que la IA sabe del mapa entero en su turno (mapas de influencia, ai/influence.ts): donde le
 * pueden hacer daño, que zona es suya y donde esta el frente.
 */
export interface Influence {
  /** La vida que le pueden quitar a `unit` en `at` los enemigos que conoce, en su proximo turno. */
  dangerFor(unit: Unit, at: Pos): number;
  /** Fuerza propia menos la enemiga que llega a `at` (positiva: zona propia). */
  control(at: Pos): number;
  /** En la linea entre los dos ejercitos. */
  isFront(at: Pos): boolean;
  /** Las casillas del frente (vacio si no hay enemigos a la vista). */
  readonly front: readonly Pos[];
}

/** Una casilla a la que podria ir una unidad, con lo que comparten las razones para elegirla. */
export interface PlaceOption {
  s: GameState;
  weights: Readonly<AiWeights>;
  unit: Unit;
  at: Pos;
  influence: Influence;
}

/**
 * Una razon con nombre que hace menos (o mas) atractivo acabar en una casilla, en pasos: elegir
 * destino suma estos costes a los pasos que faltan hasta el objetivo.
 */
export interface PlaceScoreTerm {
  id: string;
  cost(place: PlaceOption): number;
}

/** Una razon con nombre que suma (o resta) al valor de un ataque. */
export interface AttackScoreTerm {
  id: string;
  value(attack: AttackPlan): number;
}

/** Los pesos y las razones con las que juega quien usa autopilot/. */
export interface AutopilotProfile {
  readonly weights: Readonly<AiWeights>;
  /** Terminos del valor de un ataque, en orden (se suman de arriba abajo: el orden cambia el redondeo). */
  readonly scoreTerms: readonly AttackScoreTerm[];
  /**
   * Razones para elegir la casilla a la que ir (solo cuentan con mapas de influencia: la IA). Vacio:
   * solo cuentan los pasos hasta el objetivo, como siempre.
   */
  readonly placeTerms: readonly PlaceScoreTerm[];
}
