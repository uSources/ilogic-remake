/**
 * Como juega quien decide por un equipo con los pasos de autopilot/ (las ordenes permanentes y la
 * IA): con que pesos (ai.json) y por que razones prefiere un ataque a otro. Se le da a quien juega
 * (`PlayCtx.profile`), nunca se lee de un sitio comun: asi dos IAs con otros pesos (la arena) juegan
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
}
