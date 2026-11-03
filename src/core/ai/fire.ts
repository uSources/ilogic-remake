/**
 * [CAMBIO] Fuego concentrado: el plan de quien remata a quien entre varias unidades, antes de mover.
 */
import { RULES, UNIT } from '../data';
import { manhattan } from '../geom';
import { isRanged } from '../abilities';
import { canDamage, expectedDamage, fireOrigins, inAttackRange } from '../rules/combat';
import { moveRange } from '../rules/movement';
import { teamUnits } from '../rules/queries';
import type { GameState, Team, Unit } from '../types';
import { needsRepair, strikeReach, visibleFoes } from './context';

/** Plan de fuego del turno y orden en que juegan las unidades. */
export interface FirePlan {
  /** uid de la unidad propia -> uid del objetivo que remata entre varias. */
  plan: Map<number, number>;
  /** uids de las unidades propias, en el orden en que juegan. */
  order: number[];
}

/**
 * [CAMBIO] Fuego concentrado: antes de mover, busca enemigos visibles que se pueden destruir este
 * turno sumando el dano esperado de varias unidades propias (las que siguen ya disparan con el
 * flanqueo) y reparte a quien dispara a cada uno, empezando por el que mas vale. Devuelve el plan y
 * el orden de juego: primero las del plan (las de distancia antes, no se mueven y dejan al objetivo
 * flanqueado), despues el resto en el orden de siempre.
 */
export function planFire(s: GameState, me: Team): FirePlan {
  const plan = new Map<number, number>();
  const mine = teamUnits(s, me);
  const foes = visibleFoes(s, me);
  const shooters = mine.filter((u) => u.carrier === null && u.canFire && UNIT.canfight[u.type] && !needsRepair(u));
  // Dano esperado de cada unidad contra cada objetivo al que llega este turno.
  const dmg = new Map<number, Map<number, number>>();
  for (const u of shooters) {
    const reach = strikeReach(u);
    const near = foes.filter((t) => manhattan(u, t) <= reach && canDamage(u, t));
    if (!near.length) continue;
    const froms = fireOrigins(u, isRanged(u.type) ? null : moveRange(s, u));
    const m = new Map<number, number>();
    for (const t of near) if (froms.some((f) => inAttackRange(u.type, f, t))) m.set(t.uid, expectedDamage(s, u, t));
    if (m.size) dmg.set(u.uid, m);
  }
  const free = new Set(dmg.keys());
  const byValue = [...foes].sort((a, b) => UNIT.cost[b.type]! * b.life - UNIT.cost[a.type]! * a.life);
  for (const t of byValue) {
    const can = [...free].filter((id) => dmg.get(id)!.has(t.uid)).sort((a, b) => dmg.get(b)!.get(t.uid)! - dmg.get(a)!.get(t.uid)!);
    let sum = 0;
    const team: number[] = [];
    for (const id of can) {
      if (sum >= t.life) break;
      // Despues del primero, el objetivo ya esta flanqueado.
      sum += dmg.get(id)!.get(t.uid)! * (team.length ? 1 + RULES.flankBonus : 1);
      team.push(id);
    }
    if (sum < t.life || team.length < 2) continue;
    for (const id of team) {
      plan.set(id, t.uid);
      free.delete(id);
    }
  }
  const key = (u: Unit, i: number) => (plan.has(u.uid) ? (isRanged(u.type) ? 0 : 1) : 2) * 10000 + i;
  const order = mine
    .map((u, i) => ({ uid: u.uid, k: key(u, i) }))
    .sort((a, b) => a.k - b.k)
    .map((o) => o.uid);
  return { plan, order };
}
