/**
 * Cuanto vale cada cosa que puede hacer una unidad (al cumplir una orden o en el turno de la IA): de
 * momento, cada ataque posible.
 * El valor de un ataque es la suma de los terminos del perfil de quien decide (`scoreTerms`; los de
 * siempre, ATTACK_SCORE_TERMS): una razon nueva para preferir (o evitar) un ataque es una entrada mas.
 */

import type { AiWeights } from '../content';
import { unitTypeOf, isHq } from '../gameContent';
import { canCounter, expectedDamage } from '../rules/combat';
import { engagement, reversed } from '../rules/engagement';
import { captureProgress } from '../rules/capture';
import { buildingAt } from '../rules/queries';
import { killReward } from '../rules/economy';
import { posOf } from '../geom';
import { MAX_LIFE } from '../data';
import type { GameState, Pos, Unit } from '../model';
import type { PlayCtx } from './context';
import type { AttackPlan, AttackScoreTerm } from './profile';

/** Lo que vale una unidad de ese tipo al comparar ataques (su precio, escalado). */
export const unitValue = (s: GameState, weights: Readonly<AiWeights>, unit: Pick<Unit, 'type'>): number =>
  unitTypeOf(s, unit).cost / weights.costPerPoint;

/** Lo que vale `money` en la escala de unitValue (lo que vale una unidad entera es su precio). */
const moneyValue = (weights: Readonly<AiWeights>, money: number): number => (MAX_LIFE * money) / weights.costPerPoint;

const kills = (attack: AttackPlan): boolean => attack.damage >= attack.target.life;

/**
 * Cuanto pesa echar a alguien segun el dano que le hace: nunca menos de minEvictionWeight, para que se
 * intente aunque el golpe sea flojo.
 */
const evictionWeight = (attack: AttackPlan): number =>
  Math.max(attack.weights.minEvictionWeight, attack.damage / attack.weights.fullBonusDamage);

/** Lo que devolveria el objetivo al contraatacar, con la vida que le queda, en valor del atacante. */
function counterattackLoss({ s, weights, attacker, from, target, damage }: AttackPlan): number {
  const afterTheHit = engagement(attacker, target, { from, defenderLife: Math.max(1, Math.round(target.life - damage)) });
  if (!canCounter(s, afterTheHit)) return 0;
  return expectedDamage(s, reversed(afterTheHit)) * unitValue(s, weights, attacker);
}

/**
 * Terminos del valor de un ataque de siempre (los de `autopilotProfileOf`), en este orden (se suman
 * de arriba abajo: cambiar el orden cambia el redondeo y con el las decisiones de la IA).
 */
export const ATTACK_SCORE_TERMS: readonly AttackScoreTerm[] = [
  {
    // Dano esperado ponderado por el precio del objetivo.
    id: 'damage',
    value: (attack) => attack.damage * unitValue(attack.s, attack.weights, attack.target),
  },
  {
    // Extra si lo destruye. [CAMBIO] Con botin, destruirla ademas da el dinero que cobra (killReward), en la misma escala.
    id: 'kill',
    value: (attack) =>
      kills(attack)
        ? attack.weights.killBonus * unitValue(attack.s, attack.weights, attack.target) +
          moneyValue(attack.weights, killReward(attack.s, attack.target))
        : 0,
  },
  {
    // [CAMBIO] Reglas nuevas: restar lo que devolveria el contraataque (si la partida lo tiene: canCounter).
    id: 'counterattack',
    value: (attack) => (kills(attack) ? 0 : -counterattackLoss(attack)),
  },
  {
    // Quien defiende su Base encima de ella impide capturarla: hay que echarlo aunque cueste.
    id: 'hqDefender',
    value: (attack) => {
      const building = attack.targetBuilding;
      const defendsOwnHq = !!building && isHq(attack.s, building) && building.owner === attack.target.team;
      return defendsOwnHq ? attack.weights.hqDefenderBonus * evictionWeight(attack) : 0;
    },
  },
  {
    // Echar a quien esta capturando un edificio propio (sobre todo la Base).
    id: 'stopCapture',
    value: (attack) => {
      const building = attack.targetBuilding;
      if (!building || building.owner !== attack.me || !captureProgress(attack.s, building)) return 0;
      return (isHq(attack.s, building) ? attack.weights.stopHqCaptureBonus : attack.weights.stopCaptureBonus) * evictionWeight(attack);
    },
  },
];

/** Valor de que `attacker` dispare a `target` desde `from` (por defecto, desde donde esta). */
export function attackScore(s: GameState, play: PlayCtx, attacker: Unit, target: Unit, from: Pos = attacker): number {
  const attack: AttackPlan = {
    s,
    me: play.me,
    weights: play.profile.weights,
    attacker,
    from: posOf(from),
    target,
    damage: expectedDamage(s, engagement(attacker, target, { from })),
    targetBuilding: buildingAt(s, target),
  };
  return play.profile.scoreTerms.reduce((score, term) => score + term.value(attack), 0);
}
