/**
 * [CAMBIO] Fuego concentrado: el plan de quien remata a quien entre varias unidades, antes de mover.
 */

import { unitTypeOf } from '../gameContent';
import { manhattan } from '../geom';
import { expectedDamage, fireOrigins } from '../rules/combat';
import { canDamage, inAttackRange } from '../rules/weapons';
import { engagement } from '../rules/engagement';
import { moveRange } from '../rules/movement';
import { canFight, firesAfterMove, isOnMap } from '../util/predicates';
import { teamUnits } from '../rules/queries';
import { canStillFire } from '../rules/unitTurn';
import type { GameState, Unit } from '../model';
import { needsRepair, strikeReach, type PlayCtx } from '../autopilot/context';
import { knownFoes } from '../playerView';

/** Plan de fuego del turno y orden en que juegan las unidades. */
export interface FirePlan {
  /** uid de la unidad propia -> uid del objetivo que remata entre varias. */
  plan: Map<number, number>;
  /** uids de las unidades propias, en el orden en que juegan. */
  order: number[];
}

/** Tiradores que hacen falta para que sea fuego concentrado: si basta con uno, ya lo hace cada unidad por su cuenta. */
const MIN_FOCUS_SHOOTERS = 2;

/** El dano esperado de un tirador a un objetivo: si es el primero en darle hoy y si otro ya le ha dado (el flanqueo). */
interface ShotDamage {
  first: number;
  followUp: number;
}

/** uid del tirador -> (uid del objetivo -> su dano esperado). Solo objetivos a los que llega este turno. */
type DamageTable = Map<number, Map<number, ShotDamage>>;

/** Lo que le haria `shooter` a `foe`, preguntado a las reglas: tal como esta y si otro ya le hubiera dado hoy. */
const shotDamage = (s: GameState, shooter: Unit, foe: Unit): ShotDamage => ({
  first: expectedDamage(s, engagement(shooter, foe)),
  followUp: expectedDamage(s, engagement(shooter, foe, { defenderHitToday: true })),
});

/** Puede disparar este turno y no tiene que irse a curar. */
const isShooter = (s: GameState, play: PlayCtx, unit: Unit): boolean =>
  isOnMap(unit) && canStillFire(s, unit) && canFight(s, unit) && !needsRepair(play, unit);

/** Dano esperado de cada tirador contra cada enemigo al que llega este turno (moviendose si puede). */
function damageTable(s: GameState, shooters: Unit[], foes: Unit[]): DamageTable {
  const table: DamageTable = new Map();
  for (const shooter of shooters) {
    const reach = strikeReach(s, shooter);
    const nearby = foes.filter((foe) => manhattan(shooter, foe) <= reach && canDamage(s, shooter, foe));
    if (!nearby.length) continue;
    const origins = fireOrigins(s, shooter, () => moveRange(s, shooter));
    const damageByTarget = new Map<number, ShotDamage>();
    for (const foe of nearby)
      if (origins.some((from) => inAttackRange(s, shooter, from, foe))) damageByTarget.set(foe.uid, shotDamage(s, shooter, foe));
    if (damageByTarget.size) table.set(shooter.uid, damageByTarget);
  }
  return table;
}

/**
 * Los tiradores libres que destruyen a `foe` entre todos, de mas a menos dano, o null si no basta o
 * bastaria con uno solo (eso ya lo hace cada unidad por su cuenta).
 */
function squadToDestroy(foe: Unit, free: Set<number>, damage: DamageTable): number[] | null {
  // Lo que le haria cada tirador libre (solo los que le llegan).
  const damageTo = (shooterUid: number): ShotDamage | undefined => damage.get(shooterUid)?.get(foe.uid);
  const candidates = [...free]
    .flatMap((uid) => {
      const dealt = damageTo(uid);
      return dealt === undefined ? [] : [{ uid, dealt }];
    })
    .sort((first, second) => second.dealt.first - first.dealt.first);
  let total = 0;
  const squad: number[] = [];
  for (const candidate of candidates) {
    if (total >= foe.life) break;
    // Despues del primero, el objetivo ya esta flanqueado.
    total += squad.length ? candidate.dealt.followUp : candidate.dealt.first;
    squad.push(candidate.uid);
  }
  return total >= foe.life && squad.length >= MIN_FOCUS_SHOOTERS ? squad : null;
}

/** Lo que vale quitar a un enemigo: su precio por la vida que le queda (los mas valiosos, primero). */
const remainingValue = (s: GameState, unit: Unit): number => unitTypeOf(s, unit).cost * unit.life;

/** Turno de juego: primero las del plan que no se mueven para disparar (dejan al objetivo flanqueado), luego las del plan, luego el resto. */
function playRank(s: GameState, unit: Unit, plan: Map<number, number>): number {
  if (!plan.has(unit.uid)) return 2;
  return firesAfterMove(s, unit) ? 1 : 0;
}

/**
 * [CAMBIO] Fuego concentrado: antes de mover, busca enemigos visibles que se pueden destruir este
 * turno sumando el dano esperado de varias unidades propias (las que siguen ya disparan con el
 * flanqueo) y reparte a quien dispara a cada uno, empezando por el que mas vale. Devuelve el plan y
 * el orden de juego: primero las del plan (las de distancia antes), despues el resto en el orden de
 * siempre.
 */
export function planFire(s: GameState, play: PlayCtx): FirePlan {
  const me = play.me;
  const plan = new Map<number, number>();
  const mine = teamUnits(s, me);
  const foes = knownFoes(s, me);
  const damage = damageTable(
    s,
    mine.filter((unit) => isShooter(s, play, unit)),
    foes,
  );
  const free = new Set(damage.keys());
  const mostValuableFirst = [...foes].sort((firstUnit, secondUnit) => remainingValue(s, secondUnit) - remainingValue(s, firstUnit));
  for (const foe of mostValuableFirst) {
    const squad = squadToDestroy(foe, free, damage);
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
