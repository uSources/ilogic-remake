/**
 * Cuanto vale para la IA cada cosa que puede hacer: de momento, cada ataque posible.
 * El valor de un ataque es la suma de ATTACK_SCORE_TERMS: una razon nueva para preferir (o evitar)
 * un ataque es una entrada mas en la lista.
 */

import { unitTypeOf, isHq, weightsOf } from '../gameContent';
import { canCounter, expectedDamage } from '../rules/combat';
import { captureProgress } from '../rules/capture';
import { buildingAt } from '../rules/queries';
import type { Building, GameState, Pos, Unit } from '../model';
import type { PlayCtx } from './context';

/** Un ataque que se esta valorando, con lo que comparten todos los terminos. */
export interface AttackPlan {
  s: GameState;
  ai: PlayCtx;
  /** El atacante, ya colocado en la casilla desde la que dispara. */
  attacker: Unit;
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

/** Lo que vale una unidad de ese tipo en la escala de la IA (su precio, escalado). */
export const unitValue = (s: GameState, unit: Pick<Unit, 'type'>): number => unitTypeOf(s, unit).cost / weightsOf(s).COSTSCALE;

const kills = (attack: AttackPlan): boolean => attack.damage >= attack.target.life;

/**
 * Cuanto pesa echar a alguien segun el dano que le hace: nunca menos de la mitad, para que se
 * intente aunque el golpe sea flojo.
 */
const evictionWeight = (attack: AttackPlan): number => Math.max(0.5, attack.damage / weightsOf(attack.s).BONUSDAMAGE);

/** Lo que devolveria el objetivo al contraatacar, con la vida que le queda, en valor del atacante. */
function counterattackLoss({ s, attacker, target, damage }: AttackPlan): number {
  const survivor = { ...target, life: Math.max(1, Math.round(target.life - damage)) };
  if (!canCounter(s, survivor, attacker)) return 0;
  return expectedDamage(s, survivor, attacker) * unitValue(s, attacker);
}

/**
 * Terminos del valor de un ataque, en este orden (se suman de arriba abajo: cambiar el orden
 * cambia el redondeo y con el las decisiones de la IA).
 */
export const ATTACK_SCORE_TERMS: readonly AttackScoreTerm[] = [
  {
    // Dano esperado ponderado por el precio del objetivo.
    id: 'damage',
    value: (attack) => attack.damage * unitValue(attack.s, attack.target),
  },
  {
    // Extra si lo destruye. [CAMBIO] Con botin, destruirla ademas da dinero (100 de vida = su precio entero).
    id: 'kill',
    value: (attack) =>
      kills(attack) ? (weightsOf(attack.s).KILLBONUS + 100 * attack.s.rules.bounty) * unitValue(attack.s, attack.target) : 0,
  },
  {
    // [CAMBIO] Reglas nuevas: restar lo que devolveria el contraataque.
    id: 'counterattack',
    value: (attack) => (attack.s.rules.counterattack && !kills(attack) ? -counterattackLoss(attack) : 0),
  },
  {
    // Quien defiende su Base encima de ella impide capturarla: hay que echarlo aunque cueste.
    id: 'hqDefender',
    value: (attack) => {
      const building = attack.targetBuilding;
      const defendsOwnHq = !!building && isHq(attack.s, building) && building.owner === attack.target.team;
      return defendsOwnHq ? weightsOf(attack.s).HQDEFENDER * evictionWeight(attack) : 0;
    },
  },
  {
    // Echar a quien esta capturando un edificio propio (sobre todo la Base).
    id: 'stopCapture',
    value: (attack) => {
      const building = attack.targetBuilding;
      if (!building || building.owner !== attack.ai.me || !captureProgress(attack.s, building)) return 0;
      return (isHq(attack.s, building) ? weightsOf(attack.s).STOPCAPTUREHQ : weightsOf(attack.s).STOPCAPTURE) * evictionWeight(attack);
    },
  },
];

/** Valor de que `attacker` dispare a `target` desde `from` (por defecto, desde donde esta). */
export function attackScore(s: GameState, ai: PlayCtx, attacker: Unit, target: Unit, from: Pos = attacker): number {
  const attackerThere = { ...attacker, x: from.x, y: from.y };
  const attack: AttackPlan = {
    s,
    ai,
    attacker: attackerThere,
    target,
    damage: expectedDamage(s, attackerThere, target),
    targetBuilding: buildingAt(s, target),
  };
  return ATTACK_SCORE_TERMS.reduce((score, term) => score + term.value(attack), 0);
}
