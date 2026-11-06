/**
 * Cuanto vale cada cosa que puede hacer una unidad (al cumplir una orden o en el turno de la IA): de
 * momento, cada ataque posible.
 * El valor de un ataque es la suma de ATTACK_SCORE_TERMS: una razon nueva para preferir (o evitar)
 * un ataque es una entrada mas en la lista.
 */

import { unitTypeOf, isHq, weightsOf } from '../gameContent';
import { canCounter, expectedDamage } from '../rules/combat';
import { engagement, reversed } from '../rules/engagement';
import { captureProgress } from '../rules/capture';
import { buildingAt } from '../rules/queries';
import { bountyFor } from '../ruleModules/bounty';
import { posOf } from '../geom';
import type { Building, GameState, Pos, Unit } from '../model';
import type { PlayCtx } from './context';

/** Un ataque que se esta valorando, con lo que comparten todos los terminos. */
export interface AttackPlan {
  s: GameState;
  play: PlayCtx;
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

/** Lo que vale una unidad de ese tipo al comparar ataques (su precio, escalado). */
export const unitValue = (s: GameState, unit: Pick<Unit, 'type'>): number => unitTypeOf(s, unit).cost / weightsOf(s).COSTSCALE;

/** Lo que vale `money` en la escala de unitValue (lo que vale una unidad entera es su precio). */
const moneyValue = (s: GameState, money: number): number => (100 * money) / weightsOf(s).COSTSCALE;

const kills = (attack: AttackPlan): boolean => attack.damage >= attack.target.life;

/**
 * Cuanto pesa echar a alguien segun el dano que le hace: nunca menos de la mitad, para que se
 * intente aunque el golpe sea flojo.
 */
const evictionWeight = (attack: AttackPlan): number => Math.max(0.5, attack.damage / weightsOf(attack.s).BONUSDAMAGE);

/** Lo que devolveria el objetivo al contraatacar, con la vida que le queda, en valor del atacante. */
function counterattackLoss({ s, attacker, from, target, damage }: AttackPlan): number {
  const afterTheHit = engagement(attacker, target, { from, defenderLife: Math.max(1, Math.round(target.life - damage)) });
  if (!canCounter(s, afterTheHit)) return 0;
  return expectedDamage(s, reversed(afterTheHit)) * unitValue(s, attacker);
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
    // Extra si lo destruye. [CAMBIO] Con botin, destruirla ademas da el dinero que cobra (bountyFor), en la misma escala.
    id: 'kill',
    value: (attack) =>
      kills(attack)
        ? weightsOf(attack.s).KILLBONUS * unitValue(attack.s, attack.target) + moneyValue(attack.s, bountyFor(attack.s, attack.target))
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
      return defendsOwnHq ? weightsOf(attack.s).HQDEFENDER * evictionWeight(attack) : 0;
    },
  },
  {
    // Echar a quien esta capturando un edificio propio (sobre todo la Base).
    id: 'stopCapture',
    value: (attack) => {
      const building = attack.targetBuilding;
      if (!building || building.owner !== attack.play.me || !captureProgress(attack.s, building)) return 0;
      return (isHq(attack.s, building) ? weightsOf(attack.s).STOPCAPTUREHQ : weightsOf(attack.s).STOPCAPTURE) * evictionWeight(attack);
    },
  },
];

/** Valor de que `attacker` dispare a `target` desde `from` (por defecto, desde donde esta). */
export function attackScore(s: GameState, play: PlayCtx, attacker: Unit, target: Unit, from: Pos = attacker): number {
  const attack: AttackPlan = {
    s,
    play,
    attacker,
    from: posOf(from),
    target,
    damage: expectedDamage(s, engagement(attacker, target, { from })),
    targetBuilding: buildingAt(s, target),
  };
  return ATTACK_SCORE_TERMS.reduce((score, term) => score + term.value(attack), 0);
}
