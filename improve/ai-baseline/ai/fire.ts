// Copia de la IA guardada por npm run arena -- --snapshot (2026-11-05). No editar, salvo para adaptarla a un cambio del nucleo (docs/ARQUITECTURA.md, IA).
/**
 * [CAMBIO] Fuego concentrado: el plan de quien remata a quien entre varias unidades, antes de mover.
 */

import { unitTypeOf } from '@core/gameContent';
import { manhattan } from '@core/geom';
import { isRanged } from '@core/abilities';
import { canDamage, expectedDamage, fireOrigins, inAttackRange } from '@core/rules/combat';
import { engagement } from '@core/rules/engagement';
import { moveRange } from '@core/rules/movement';
import { teamUnits } from '@core/rules/queries';
import { canStillFire } from '@core/rules/unitTurn';
import type { GameState, TeamId, Unit } from '@core/model';
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
const isShooter = (s: GameState, unit: Unit): boolean =>
  unit.carrier === null && canStillFire(s, unit) && unitTypeOf(s, unit).attack !== null && !needsRepair(s, unit);

/** Dano esperado de cada tirador contra cada enemigo al que llega este turno (moviendose si puede). */
function damageTable(s: GameState, shooters: Unit[], foes: Unit[]): DamageTable {
  const table: DamageTable = new Map();
  for (const shooter of shooters) {
    const reach = strikeReach(s, shooter);
    const nearby = foes.filter((foe) => manhattan(shooter, foe) <= reach && canDamage(s, shooter, foe));
    if (!nearby.length) continue;
    const origins = fireOrigins(s, shooter, isRanged(s, shooter) ? null : moveRange(s, shooter));
    const damageByTarget = new Map<number, number>();
    for (const foe of nearby)
      if (origins.some((from) => inAttackRange(s, shooter, from, foe))) damageByTarget.set(foe.uid, expectedDamage(s, engagement(shooter, foe)));
    if (damageByTarget.size) table.set(shooter.uid, damageByTarget);
  }
  return table;
}

/**
 * Los tiradores libres que destruyen a `foe` entre todos, de mas a menos dano, o null si no basta o
 * bastaria con uno solo (eso ya lo hace cada unidad por su cuenta).
 */
function squadToDestroy(s: GameState, foe: Unit, free: Set<number>, damage: DamageTable): number[] | null {
  const damageTo = (shooterUid: number) => damage.get(shooterUid)!.get(foe.uid)!;
  const candidates = [...free].filter((uid) => damage.get(uid)!.has(foe.uid)).sort((first, second) => damageTo(second) - damageTo(first));
  let total = 0;
  const squad: number[] = [];
  for (const uid of candidates) {
    if (total >= foe.life) break;
    // Despues del primero, el objetivo ya esta flanqueado.
    total += damageTo(uid) * (squad.length ? 1 + s.rules.flankBonus : 1);
    squad.push(uid);
  }
  return total >= foe.life && squad.length >= 2 ? squad : null;
}

/** Lo que vale quitar a un enemigo: su precio por la vida que le queda (los mas valiosos, primero). */
const remainingValue = (s: GameState, unit: Unit): number => unitTypeOf(s, unit).cost * unit.life;

/** Turno de juego: primero las del plan a distancia (no se mueven y dejan al objetivo flanqueado), luego las del plan, luego el resto. */
function playRank(s: GameState, unit: Unit, plan: Map<number, number>): number {
  if (!plan.has(unit.uid)) return 2;
  return isRanged(s, unit) ? 0 : 1;
}

/**
 * [CAMBIO] Fuego concentrado: antes de mover, busca enemigos visibles que se pueden destruir este
 * turno sumando el dano esperado de varias unidades propias (las que siguen ya disparan con el
 * flanqueo) y reparte a quien dispara a cada uno, empezando por el que mas vale. Devuelve el plan y
 * el orden de juego: primero las del plan (las de distancia antes), despues el resto en el orden de
 * siempre.
 */
export function planFire(s: GameState, me: TeamId): FirePlan {
  const plan = new Map<number, number>();
  const mine = teamUnits(s, me);
  const foes = visibleFoes(s, me);
  const damage = damageTable(
    s,
    mine.filter((unit) => isShooter(s, unit)),
    foes,
  );
  const free = new Set(damage.keys());
  const mostValuableFirst = [...foes].sort((firstUnit, secondUnit) => remainingValue(s, secondUnit) - remainingValue(s, firstUnit));
  for (const foe of mostValuableFirst) {
    const squad = squadToDestroy(s, foe, free, damage);
    if (!squad) continue;
    for (const uid of squad) {
      plan.set(uid, foe.uid);
      free.delete(uid);
    }
  }
  // sort es estable: dentro de cada grupo se conserva el orden de siempre.
  const order = [...mine]
    .sort((firstUnit, secondUnit) => playRank(s, firstUnit, plan) - playRank(s, secondUnit, plan))
    .map((unit) => unit.uid);
  return { plan, order };
}
