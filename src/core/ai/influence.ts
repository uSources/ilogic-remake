/**
 * Mapas de influencia (docs/PLAN-IA.md, fase 1): una idea del mapa entero para la IA, calculada al
 * empezar su turno con lo que sabe su equipo (la vista: los enemigos que conoce, `knownFoes`).
 *
 * - **Zona de golpe** de cada unidad: las casillas a las que puede disparar en su proximo turno
 *   (moviendose lo que le deja su presupuesto, si dispara despues de moverse, y con su alcance).
 * - **Peligro** de una casilla para una unidad: la vida que le pueden quitar ahi los enemigos cuya
 *   zona la cubre (el daño esperado de cada uno, preguntado a las reglas).
 * - **Control**: la fuerza propia que llega a una casilla menos la enemiga (valor: coste x vida / 100).
 * - **Frente**: las casillas propias (control a favor o igualado) que tocan una del enemigo.
 *
 * Es aproximado a proposito (cuenta pasos, no el coste de cada terreno, y no mira a los enemigos que no
 * ve): sirve para decidir, no para las reglas.
 */
import { unitTypeOf } from '../gameContent';
import { diamond, neighbors4 } from '../geom';
import { createLayer, mapGrid } from '../mapGrid';
import { expectedDamage } from '../rules/combat';
import { engagement } from '../rules/engagement';
import { distanceMap, type Blockers } from '../rules/distance';
import { moveBudget } from '../rules/movementProfile';
import { movementOf, teamUnits } from '../rules/queries';
import { canDamage } from '../rules/weapons';
import { knownFoes } from '../playerView';
import { lifeValue } from '../unitValue';
import { firesAfterMove, isOnMap } from '../util/predicates';
import type { Grid } from '../util/grid';
import type { GameState, Pos, TeamId, Unit } from '../model';
import type { Influence } from '../autopilot/profile';

/** Las casillas a las que `unit` puede disparar en su proximo turno. */
function strikeZone(s: GameState, unit: Unit): Grid<boolean> {
  const zone = createLayer(s, false);
  const attack = unitTypeOf(s, unit).attack;
  if (!attack) return zone;
  const grid = mapGrid(s);
  for (const origin of fireOriginsNextTurn(s, unit))
    for (const tile of diamond(grid, origin, attack.minRange, attack.maxRange)) zone.set(tile, true);
  return zone;
}

/** Desde donde podra disparar en su proximo turno: su casilla o, si dispara tras moverse, cualquiera a la que llegue. */
function fireOriginsNextTurn(s: GameState, unit: Unit): Pos[] {
  if (!firesAfterMove(s, unit)) return [unit];
  const steps = distanceMap(s, unit, movementOf(s, unit), hostileTo(s, unit.team));
  const budget = moveBudget(s, unit);
  const origins: Pos[] = [];
  steps.forEach((distance, pos) => {
    if (distance <= budget) origins.push(pos);
  });
  return origins;
}

/** Cortan el paso las unidades de otro equipo (las suyas se apartan o se atraviesan). */
function hostileTo(s: GameState, team: TeamId): Blockers {
  const occupied = createLayer(s, false);
  for (const unit of s.units) if (isOnMap(unit) && unit.team !== team) occupied.set(unit, true);
  return (pos) => occupied.at(pos);
}

/** Suma, casilla a casilla, el valor de cada unidad en las casillas que cubre su zona. */
function powerMap(s: GameState, units: readonly Unit[], zones: ReadonlyMap<number, Grid<boolean>>): Grid<number> {
  const power = createLayer(s, 0);
  for (const unit of units) {
    const value = lifeValue(s, unit.life, unit);
    zones.get(unit.uid)?.forEach((covered, pos) => {
      if (covered) power.set(pos, power.at(pos) + value);
    });
  }
  return power;
}

/** Las casillas propias (control >= 0) con alguna vecina del enemigo (control < 0). */
function frontOf(s: GameState, control: Grid<number>): Pos[] {
  const grid = mapGrid(s);
  const front: Pos[] = [];
  control.forEach((value, pos) => {
    if (value >= 0 && neighbors4(grid, pos).some((next) => control.at(next) < 0)) front.push(pos);
  });
  return front;
}

/** Los mapas de influencia del equipo `team` con lo que sabe ahora. */
export function influenceOf(s: GameState, team: TeamId): Influence {
  const mine = teamUnits(s, team).filter(isOnMap);
  const foes = knownFoes(s, team);
  const zones = new Map([...mine, ...foes].map((unit) => [unit.uid, strikeZone(s, unit)]));
  const control = createLayer(s, 0);
  const friendly = powerMap(s, mine, zones);
  const hostile = powerMap(s, foes, zones);
  control.forEach((_, pos) => control.set(pos, friendly.at(pos) - hostile.at(pos)));
  const front = frontOf(s, control);
  const frontSet = createLayer(s, false);
  for (const pos of front) frontSet.set(pos, true);
  // El daño de cada enemigo a cada unidad no depende de la casilla (salvo el terreno): se guarda.
  const damageCache = new Map<string, number>();
  const damageOf = (foe: Unit, unit: Unit, at: Pos): number => {
    const key = `${foe.uid}>${unit.uid}`;
    const known = damageCache.get(key);
    if (known !== undefined) return known;
    const damage = canDamage(s, foe, unit) ? expectedDamage(s, engagement(foe, { ...unit, x: at.x, y: at.y })) : 0;
    damageCache.set(key, damage);
    return damage;
  };
  return {
    dangerFor: (unit, at) => foes.reduce((total, foe) => (zones.get(foe.uid)?.at(at) ? total + damageOf(foe, unit, at) : total), 0),
    control: (at) => control.at(at),
    isFront: (at) => frontSet.at(at),
    front,
  };
}
