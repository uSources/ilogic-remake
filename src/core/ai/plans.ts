/**
 * Planes que duran (docs/PLAN-IA.md, fase 2): al empezar su turno la IA mira el objetivo de cada
 * unidad (que edificio capturar, a que enemigos ir, que defender) y solo lo cambia si ya no vale o si
 * hay que defender algo. Los guarda como ordenes permanentes de cada unidad (`giveStandingOrder`): asi
 * duran de un turno a otro, se guardan con la partida y la niebla los esconde del rival. Las ordenes
 * no las cumple la partida (al acabar su turno la IA ya ha usado todas sus unidades): la IA las lee
 * como el destino de su plan y mueve ella cada unidad (`followPlan`, tactics.ts).
 *
 * Que decide, en este orden:
 * 1. Lo que sigue valiendo, se queda: un edificio que aun no es suyo; enemigos que siguen en la zona;
 *    una amenaza que sigue ahi.
 * 2. Defender: a un edificio propio que estan capturando (o a la Base con enemigos al lado) van las
 *    que luchan mas cerca hasta igualar su fuerza.
 * 3. Rematar: con clara ventaja (`pushAdvantage`) sobre lo que calcula que tiene el enemigo, todas a
 *    la Base enemiga.
 * 4. Las demas: las que capturan, al edificio ajeno que menos les cuesta (sin amontonarse); las que
 *    luchan, al grupo enemigo que menos les cuesta, hasta que haya fuerza de sobra para el.
 */
import { lifeValue } from '../unitValue';
import { manhattan, posOf, samePos } from '../geom';
import { isHq } from '../gameContent';
import { isAlliedOwner } from '../teams';
import { captureProgress } from '../rules/capture';
import { buildingAt, isEnemyHq, teamUnits } from '../rules/queries';
import { effectiveStandingOrder } from '../squads/standingOrderQueries';
import { knownFoes } from '../playerView';
import { canFight, isCapturer, isOnMap } from '../util/predicates';
import { minBy } from '../util/pick';
import { act, stepsMap, type PlayCtx } from '../autopilot/context';
import type { ActionPlan, Building, GameState, Pos, StandingOrder, Unit } from '../model';

/** Lo que el plan quiere de una unidad: su orden nueva, o null para quitarle la que tenga. */
export type PlanChanges = Map<number, StandingOrder | null>;

/** Un sitio al que mandar unidades y la fuerza que hace falta alli (valor: coste x vida / 100). */
interface Objective {
  order: StandingOrder;
  need: number;
  /** Lo que ya va hacia alli. */
  assigned: number;
}

/** Las unidades de un equipo que pueden recibir un plan: en el mapa (no dentro de un transporte). */
const plannable = (s: GameState, play: PlayCtx): Unit[] => teamUnits(s, play.me).filter(isOnMap);

const valueOf = (s: GameState, unit: Unit): number => lifeValue(s, unit.life, unit);

/** Los enemigos que conoce a `radius` casillas o menos de `at`, y lo que valen. */
function foesNear(s: GameState, play: PlayCtx, at: Pos, radius: number): Unit[] {
  return knownFoes(s, play.me).filter((foe) => manhattan(foe, at) <= radius);
}

/** La orden sigue teniendo sentido (1): el edificio no es suyo; hay enemigos en la zona; la amenaza sigue. */
function stillValid(s: GameState, play: PlayCtx, unit: Unit, order: StandingOrder): boolean {
  const radius = play.profile.weights.guardRadius;
  switch (order.kind) {
    case 'capture': {
      const building = buildingAt(s, order.at);
      return isCapturer(s, unit) && !!building && !isAlliedOwner(s, building.owner, play.me);
    }
    case 'attack': {
      const building = buildingAt(s, order.at);
      return foesNear(s, play, order.at, radius).length > 0 || (!!building && isEnemyHq(s, building, play.me));
    }
    case 'defend':
      return foesNear(s, play, order.at, radius).length > 0;
    case 'goto':
      return false;
    default:
      return order.kind satisfies never;
  }
}

/**
 * Los edificios propios amenazados (2): los que estan capturando y la Base con enemigos al lado (un
 * enemigo que solo pasa cerca de una ciudad no basta: si no, todas se quedarian en casa), con la
 * fuerza que hace falta.
 */
function threats(s: GameState, play: PlayCtx): Objective[] {
  const radius = play.profile.weights.guardRadius;
  return s.buildings
    .filter((building) => building.owner === play.me)
    .flatMap((building) => {
      const near = foesNear(s, play, building, radius);
      const threatened = captureProgress(s, building) !== null || (isHq(s, building) && near.length > 0);
      if (!threatened) return [];
      const need = Math.max(
        1,
        near.reduce((total, foe) => total + valueOf(s, foe), 0),
      );
      return [{ order: { kind: 'defend' as const, at: posOf(building) }, need, assigned: 0 }];
    });
}

/**
 * Lo que calcula que tiene el enemigo: lo que ve o, si es mas, lo que tendria con sus edificios si su
 * ejercito fuera como el propio (con la niebla, lo que ve se queda corto y se lanzaria antes de tiempo).
 */
function enemyEstimate(s: GameState, play: PlayCtx, ours: number): number {
  const seen = knownFoes(s, play.me).reduce((total, foe) => total + valueOf(s, foe), 0);
  const ownBuildings = s.buildings.filter((building) => building.owner === play.me).length;
  const theirBuildings = s.buildings.filter((building) => building.owner !== null && !isAlliedOwner(s, building.owner, play.me)).length;
  return Math.max(seen, (ours * theirBuildings) / Math.max(1, ownBuildings));
}

/** Con clara ventaja sobre lo que calcula que tiene el enemigo (3), la Base enemiga a la que ir. */
function pushTarget(s: GameState, play: PlayCtx, mine: readonly Unit[]): Building | null {
  const ours = mine.reduce((total, unit) => total + valueOf(s, unit), 0);
  if (ours < play.profile.weights.pushAdvantage * Math.max(enemyEstimate(s, play, ours), 1)) return null;
  return s.buildings.find((building) => isEnemyHq(s, building, play.me)) ?? null;
}

/** Los edificios que se pueden capturar (4) y los grupos enemigos a los que ir, con la fuerza que hace falta en cada uno. */
function openObjectives(s: GameState, play: PlayCtx): { captures: Objective[]; attacks: Objective[] } {
  const captures = s.buildings
    .filter((building) => !isAlliedOwner(s, building.owner, play.me))
    .map((building) => ({ order: { kind: 'capture' as const, at: posOf(building) }, need: 1, assigned: 0 }));
  const radius = play.profile.weights.guardRadius;
  const attacks = knownFoes(s, play.me).map((foe) => {
    const group = foesNear(s, play, foe, radius);
    const need = group.reduce((total, member) => total + valueOf(s, member), 0) * play.profile.weights.attackNeedRatio;
    return { order: { kind: 'attack' as const, at: posOf(foe) }, need, assigned: 0 };
  });
  const enemyHq = s.buildings.filter((building) => isEnemyHq(s, building, play.me));
  attacks.push(...enemyHq.map((building) => ({ order: { kind: 'attack' as const, at: posOf(building) }, need: Infinity, assigned: 0 })));
  return { captures, attacks };
}

/**
 * El objetivo que menos le cuesta a la unidad: pasos hasta alli, mas `crowdSteps` si ya va bastante
 * (lo que va cubre lo que hace falta). null si no llega a ninguno.
 */
function cheapestFor(s: GameState, play: PlayCtx, unit: Unit, objectives: readonly Objective[]): Objective | null {
  const steps = stepsMap(s, play, unit);
  const stepsTo = (at: Pos) => Math.min(steps.at(at), ...[...nextTo(at)].map((pos) => (steps.contains(pos) ? steps.at(pos) : Infinity)));
  const options = objectives
    .map((objective) => ({ objective, steps: stepsTo(objective.order.at) }))
    .filter((option) => option.steps < Infinity);
  const crowded = (objective: Objective) => (objective.assigned >= objective.need ? play.profile.weights.crowdSteps : 0);
  return minBy(options, (option) => option.steps + crowded(option.objective))?.objective ?? null;
}

/** Las cuatro casillas de al lado (un objetivo ocupado se alcanza llegando a su lado). */
function* nextTo(at: Pos): Generator<Pos> {
  yield { x: at.x + 1, y: at.y };
  yield { x: at.x - 1, y: at.y };
  yield { x: at.x, y: at.y + 1 };
  yield { x: at.x, y: at.y - 1 };
}

/** Lo que quiere el plan de cada unidad del equipo este turno: solo las que cambian. */
export function planChanges(s: GameState, play: PlayCtx): PlanChanges {
  const mine = plannable(s, play);
  const changes: PlanChanges = new Map();
  const wants = (unit: Unit, order: StandingOrder | null) => {
    const current = effectiveStandingOrder(s, unit) ?? null;
    const same = current && order ? current.kind === order.kind && samePos(current.at, order.at) : current === order;
    if (!same) changes.set(unit.uid, order);
  };
  const free = new Set(
    mine.filter((unit) => {
      const order = effectiveStandingOrder(s, unit);
      return !order || !stillValid(s, play, unit, order);
    }),
  );
  const fighters = mine.filter((unit) => canFight(s, unit) && !isCapturer(s, unit));
  // 2. Defender lo propio: las que luchan mas cerca, hasta igualar la fuerza que lo amenaza.
  for (const threat of threats(s, play)) {
    const nearest = [...fighters].sort((first, second) => manhattan(first, threat.order.at) - manhattan(second, threat.order.at));
    for (const unit of nearest) {
      if (threat.assigned >= threat.need) break;
      if (effectiveStandingOrder(s, unit)?.kind === 'defend' && !free.has(unit)) continue;
      threat.assigned += valueOf(s, unit);
      free.delete(unit);
      wants(unit, threat.order);
    }
  }
  // 3. Rematar: con clara ventaja, todas las libres a la Base enemiga.
  const hq = pushTarget(s, play, mine);
  if (hq) {
    for (const unit of free) wants(unit, { kind: isCapturer(s, unit) ? 'capture' : 'attack', at: posOf(hq) });
    return changes;
  }
  // 4. Las demas: capturar o ir a por un grupo enemigo, sin amontonarse.
  const { captures, attacks } = openObjectives(s, play);
  countAssigned(s, play, mine, free, captures, attacks);
  for (const unit of free) {
    const objectives = isCapturer(s, unit) ? captures : canFight(s, unit) ? attacks : [];
    const chosen = cheapestFor(s, play, unit, objectives);
    if (chosen) chosen.assigned += isCapturer(s, unit) ? 1 : valueOf(s, unit);
    wants(unit, chosen?.order ?? null);
  }
  return changes;
}

/** Lo que ya va hacia cada objetivo (las unidades que siguen con su plan), para no amontonarse. */
function countAssigned(
  s: GameState,
  play: PlayCtx,
  mine: readonly Unit[],
  free: ReadonlySet<Unit>,
  captures: Objective[],
  attacks: Objective[],
): void {
  for (const unit of mine) {
    const order = free.has(unit) ? undefined : effectiveStandingOrder(s, unit);
    if (!order) continue;
    const pool = order.kind === 'capture' ? captures : attacks;
    const objective = pool.find((candidate) => manhattan(candidate.order.at, order.at) <= play.profile.weights.guardRadius);
    if (objective) objective.assigned += order.kind === 'capture' ? 1 : valueOf(s, unit);
  }
}

/** Propone los cambios del plan: dar a cada unidad su orden nueva o quitarle la que ya no vale. */
export function* updatePlans(s: GameState, play: PlayCtx): ActionPlan {
  for (const [uid, order] of planChanges(s, play)) {
    if (order) yield* act({ kind: 'giveStandingOrder', uids: [uid], order });
    else yield* act({ kind: 'cancelStandingOrder', uids: [uid] });
  }
}
