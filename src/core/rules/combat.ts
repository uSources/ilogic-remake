/**
 * Combate: alcance y objetivos, proteccion del terreno, probabilidad de acierto, veterania,
 * contraataque, botin y la tirada de daño. El ataque en si (lo que cambia en la partida) es la accion
 * 'attack' (actions/attack.ts).
 */

import { unitTypeOf, buildingTypeOf, terrainAt } from '../gameContent';
import { coverAgainst, defenseFactor, isRanged } from '../abilities';
import { manhattan, posOf } from '../geom';
import { generalHitFactor } from '../generals';
import { canFight, isAlive, areEnemies, isOnMap } from '../util/predicates';
import { weatherHit } from '../weather';
import type { ActionRejection, CombatInfo, Dice, GameState, Pos, Unit } from '../model';
import { reachableTiles, type MoveRange } from './movement';
import { buildingAt } from './queries';
import { visibility } from './visibility';
import { canStillFire } from './unitTurn';

// ---- Alcance y objetivos ----

/** El tipo de `unit` alcanza de `from` a `to`: ataca, y la distancia esta entre su alcance minimo y el maximo. */
export function inAttackRange(s: GameState, unit: Pick<Unit, 'type'>, from: Pos, to: Pos): boolean {
  const attack = unitTypeOf(s, unit).attack;
  const distance = manhattan(from, to);
  return !!attack && distance >= attack.minRange && distance <= attack.maxRange;
}

/** `attacker` puede luchar y hacer dano a una unidad como `defender` (sin mirar distancias). */
export function canDamage(s: GameState, attacker: Unit, defender: Unit): boolean {
  return canFight(s, attacker) && basePower(s, attacker, defender) > 0;
}

/**
 * Probabilidad de acierto de units.json ("attack.hitChance"), sin terreno ni modificadores (0 = no
 * le hace nada).
 */
export function basePower(s: GameState, attacker: Pick<Unit, 'type'>, defender: Pick<Unit, 'type'>): number {
  return unitTypeOf(s, attacker).attack?.hitChance[unitTypeOf(s, defender).id] ?? 0;
}

/**
 * Casillas desde las que `unit` puede disparar este turno: donde esta y, si no es de distancia (esas
 * no pueden mover y disparar) y se pasa su alcance `range`, las que alcanza (las que acepte `allowed`).
 */
export function fireOrigins(s: GameState, unit: Unit, range: MoveRange | null, allowed?: (pos: Pos) => boolean): Pos[] {
  const origins: Pos[] = [posOf(unit)];
  if (!range || isRanged(s, unit)) return origins;
  const reachable = reachableTiles(range);
  origins.push(...(allowed ? reachable.filter((pos) => allowed(pos)) : reachable));
  return origins;
}

/**
 * Por que `attacker` no puede atacar ahora a `target` (null = puede): le queda disparo, el objetivo es
 * un enemigo vivo en el mapa que su equipo ve (`visible`), le hace daño y lo tiene a tiro desde donde
 * esta.
 */
export function attackProblem(s: GameState, attacker: Unit, target: Unit, visible = visibility(s, attacker.team)): ActionRejection | null {
  if (!canStillFire(s, attacker) || !canFight(s, attacker)) return 'spent';
  if (!areEnemies(s, target, attacker) || !isOnMap(target) || !isAlive(target) || !visible.at(target)) return 'notTarget';
  return canDamage(s, attacker, target) && inAttackRange(s, attacker, attacker, target) ? null : 'notTarget';
}

/** Objetivos atacables desde la posicion actual (Ilogic.getAtkMap; ver attackProblem). */
export function attackTargets(s: GameState, attacker: Unit, visible = visibility(s, attacker.team)): Unit[] {
  return s.units.filter((target) => attackProblem(s, attacker, target, visible) === null);
}

// ---- Probabilidad de acierto ----

/**
 * Factor de proteccion de una casilla (terreno por edificio, si lo hay): multiplica la probabilidad
 * de que acierten a quien esta en ella. 1 = sin proteccion.
 */
export function tileProtection(s: GameState, pos: Pos): number {
  const building = buildingAt(s, pos);
  const terrainProtection = terrainAt(s, pos).protection;
  return terrainProtection * (building ? buildingTypeOf(s, building).protection : 1);
}

/** Estrellas de defensa que se enseñan como mucho. */
const MAX_DEFENSE_STARS = 4;

/** Estrellas de defensa que se enseñan para una casilla (0..4): una por cada 10 % que protege. */
export function defenseStars(s: GameState, pos: Pos): number {
  const protectionPercent = (1 - tileProtection(s, pos)) * 100;
  return Math.max(0, Math.min(MAX_DEFENSE_STARS, Math.round(protectionPercent / 10)));
}

/**
 * Algo que cambia la probabilidad de acierto (habilidades, veterania, generales, clima...). Devuelve
 * un multiplicador: 1 = nada (con la regla apagada, por ejemplo).
 */
export interface HitModifier {
  /** Nombre corto (para depurar o enseñar el desglose). */
  readonly id: string;
  factor(s: GameState, attacker: Unit, defender: Unit): number;
}

/** [CAMBIO] Veterania: cada rango da +vetBonus de acierto al atacar y -vetBonus al que le ataca. */
function veterancyFactor(s: GameState, attacker: Unit, defender: Unit): number {
  if (!s.rules.veterancy) return 1;
  return (1 + s.rules.vetBonus * rank(attacker)) * (1 - s.rules.vetBonus * rank(defender));
}

/** [CAMBIO] Flanqueo: rematar a quien ya ha recibido un ataque hoy es mas facil. */
function flankFactor(s: GameState, _attacker: Unit, defender: Unit): number {
  return flanked(s, defender) ? 1 + s.rules.flankBonus : 1;
}

/**
 * [CAMBIO] Modificadores del acierto, en el orden en que se aplican sobre el poder base y la
 * proteccion de la casilla. Una regla nueva que cambie el acierto es una entrada mas: la prevision,
 * el panel de combate y la IA la ven solas porque todas pasan por hitChance.
 * El orden importa (redondeo de coma flotante: las partidas de referencia lo notarian).
 */
export const HIT_MODIFIERS: readonly HitModifier[] = [
  // Escudo del defensor contra disparos a distancia y aura de sus aliados: hacen fuertes a los grupos.
  { id: 'abilities', factor: defenseFactor },
  // Premia conservar las unidades que ya han destruido a alguien.
  { id: 'veterancy', factor: veterancyFactor },
  // Premia atacar en grupo al mismo objetivo.
  { id: 'flank', factor: flankFactor },
  // La ventaja fija de cada general (ataque de uno, defensa del otro).
  { id: 'generals', factor: generalHitFactor },
  // Con lluvia o tormenta se apunta peor (igual para los dos equipos).
  { id: 'weather', factor: (s) => weatherHit(s) },
];

/** Probabilidad de acierto de cada "disparo" (uno por punto de vida del atacante). Puede pasar de 1. */
export function hitChance(s: GameState, attacker: Unit, defender: Unit): number {
  let chance = basePower(s, attacker, defender) * coverAgainst(s, attacker, tileProtection(s, defender));
  for (const modifier of HIT_MODIFIERS) chance *= modifier.factor(s, attacker, defender);
  return chance;
}

/** La probabilidad de acierto como probabilidad de verdad (sin pasar de 1). */
export function cappedHitChance(s: GameState, attacker: Unit, defender: Unit): number {
  return Math.min(1, hitChance(s, attacker, defender));
}

// ---- Veterania, flanqueo y botin ----

/** Bajas necesarias para cada rango (1, 2 y 3 estrellas). */
export const RANK_KILLS = [1, 3, 6] as const;

/** [CAMBIO] La unidad ya ha recibido un ataque hoy y la regla de flanqueo esta puesta. */
export function flanked(s: GameState, defender: Unit): boolean {
  return s.rules.flankBonus > 0 && defender.hitDay === s.day;
}

/** [CAMBIO] Botin por destruir una unidad como `lost` (0 sin la regla). */
export function bountyFor(s: GameState, lost: Pick<Unit, 'type'>): number {
  return Math.round(unitTypeOf(s, lost).cost * s.rules.bounty);
}

/** Rango de veterania de una unidad: 0 a 3. */
export function rank(unit: Unit): number {
  const kills = unit.kills ?? 0;
  return RANK_KILLS.filter((needed) => kills >= needed).length;
}

/** Dano esperado (para la IA y para mostrarlo en pantalla). */
export function expectedDamage(s: GameState, attacker: Unit, defender: Unit): number {
  return Math.min(defender.life, attacker.life * cappedHitChance(s, attacker, defender));
}

// ---- El ataque ----

/**
 * Daño de un ataque de una unidad con `life` puntos de vida que acierta con probabilidad `chance`.
 * Original: cada punto de vida es un disparo que acierta con probabilidad `chance`.
 * [CAMBIO] con la regla damageSpread: el daño esperado (life x chance) +- ese tanto por uno.
 */
function rollDamage(s: GameState, life: number, chance: number, dice: Dice): number {
  if (s.rules.damageSpread === null) {
    let hits = 0;
    for (let shot = 0; shot < life; shot++) if (dice.roll() < chance) hits++;
    return hits;
  }
  const expected = life * chance;
  const spread = (dice.roll() * 2 - 1) * s.rules.damageSpread;
  return Math.max(0, Math.round(expected * (1 + spread)));
}

/** Daño que hace `attacker` a `defender` en una tirada (sin pasar de la vida que le queda). */
export function strike(s: GameState, attacker: Unit, defender: Unit, dice: Dice): number {
  return Math.min(defender.life, rollDamage(s, attacker.life, cappedHitChance(s, attacker, defender), dice));
}

/**
 * [CAMBIO] Contraataque (s.rules.counterattack): el defensor que sobrevive responde si es una
 * unidad de cuerpo a cuerpo, el atacante tambien lo es y lo tiene a su alcance.
 * La artilleria y demas unidades a distancia ni contraatacan ni reciben contraataque.
 */
export function canCounter(s: GameState, defender: Unit, attacker: Unit): boolean {
  if (!s.rules.counterattack || !isAlive(defender)) return false;
  if (isRanged(s, defender) || isRanged(s, attacker)) return false;
  return canDamage(s, defender, attacker) && inAttackRange(s, defender, defender, attacker);
}

/** Como estan las dos unidades antes de luchar, para enseñar el combate despues (ver CombatInfo). */
export function combatInfoBefore(s: GameState, attacker: Unit, defender: Unit): CombatInfo {
  return {
    attackerType: attacker.type,
    defenderType: defender.type,
    attackerTeam: attacker.team,
    defenderTeam: defender.team,
    attackerLife: attacker.life,
    defenderLife: defender.life,
    attackerRank: rank(attacker),
    defenderRank: rank(defender),
    hit: cappedHitChance(s, attacker, defender),
    counterHit: canCounter(s, defender, attacker) ? cappedHitChance(s, defender, attacker) : null,
  };
}
