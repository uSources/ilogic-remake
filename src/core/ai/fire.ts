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

/** uid del tirador -> (uid del objetivo -> dano esperado). Solo objetivos a los que llega este turno. */
type DamageTable = Map<number, Map<number, number>>;

/** Puede disparar este turno y no tiene que irse a curar. */
const isShooter = (unit: Unit): boolean => unit.carrier === null && unit.canFire && UNIT.canfight[unit.type]! && !needsRepair(unit);

/** Dano esperado de cada tirador contra cada enemigo al que llega este turno (moviendose si puede). */
function damageTable(s: GameState, shooters: Unit[], foes: Unit[]): DamageTable {
  const table: DamageTable = new Map();
  for (const shooter of shooters) {
    const reach = strikeReach(shooter);
    const nearby = foes.filter((foe) => manhattan(shooter, foe) <= reach && canDamage(shooter, foe));
    if (!nearby.length) continue;
    const origins = fireOrigins(shooter, isRanged(shooter.type) ? null : moveRange(s, shooter));
    const damageByTarget = new Map<number, number>();
    for (const foe of nearby)
      if (origins.some((from) => inAttackRange(shooter.type, from, foe))) damageByTarget.set(foe.uid, expectedDamage(s, shooter, foe));
    if (damageByTarget.size) table.set(shooter.uid, damageByTarget);
  }
  return table;
}

/**
 * Los tiradores libres que destruyen a `foe` entre todos, de mas a menos dano, o null si no basta o
 * bastaria con uno solo (eso ya lo hace cada unidad por su cuenta).
 */
function squadToDestroy(foe: Unit, free: Set<number>, damage: DamageTable): number[] | null {
  const damageTo = (shooterUid: number) => damage.get(shooterUid)!.get(foe.uid)!;
  const candidates = [...free].filter((uid) => damage.get(uid)!.has(foe.uid)).sort((a, b) => damageTo(b) - damageTo(a));
  let total = 0;
  const squad: number[] = [];
  for (const uid of candidates) {
    if (total >= foe.life) break;
    // Despues del primero, el objetivo ya esta flanqueado.
    total += damageTo(uid) * (squad.length ? 1 + RULES.flankBonus : 1);
    squad.push(uid);
  }
  return total >= foe.life && squad.length >= 2 ? squad : null;
}

/** Lo que vale quitar a un enemigo: su precio por la vida que le queda (los mas valiosos, primero). */
const remainingValue = (unit: Unit): number => UNIT.cost[unit.type]! * unit.life;

/** Turno de juego: primero las del plan a distancia (no se mueven y dejan al objetivo flanqueado), luego las del plan, luego el resto. */
function playRank(unit: Unit, plan: Map<number, number>): number {
  if (!plan.has(unit.uid)) return 2;
  return isRanged(unit.type) ? 0 : 1;
}

/**
 * [CAMBIO] Fuego concentrado: antes de mover, busca enemigos visibles que se pueden destruir este
 * turno sumando el dano esperado de varias unidades propias (las que siguen ya disparan con el
 * flanqueo) y reparte a quien dispara a cada uno, empezando por el que mas vale. Devuelve el plan y
 * el orden de juego: primero las del plan (las de distancia antes), despues el resto en el orden de
 * siempre.
 */
export function planFire(s: GameState, me: Team): FirePlan {
  const plan = new Map<number, number>();
  const mine = teamUnits(s, me);
  const foes = visibleFoes(s, me);
  const damage = damageTable(s, mine.filter(isShooter), foes);
  const free = new Set(damage.keys());
  const mostValuableFirst = [...foes].sort((a, b) => remainingValue(b) - remainingValue(a));
  for (const foe of mostValuableFirst) {
    const squad = squadToDestroy(foe, free, damage);
    if (!squad) continue;
    for (const uid of squad) {
      plan.set(uid, foe.uid);
      free.delete(uid);
    }
  }
  // sort es estable: dentro de cada grupo se conserva el orden de siempre.
  const order = [...mine].sort((a, b) => playRank(a, plan) - playRank(b, plan)).map((unit) => unit.uid);
  return { plan, order };
}
