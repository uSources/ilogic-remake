/**
 * Combate: alcance, proteccion del terreno, probabilidad de acierto, veterania, contraataque, botin
 * y el ataque en si (con su evento).
 */
import { BUILDING, MAX_FUNDS, POWER, RULES, TERRAIN, UNIT } from '../data';
import { coverAgainst, defenseFactor, isRanged } from '../abilities';
import { manhattan } from '../geom';
import { chargeFromCombat, generalHitFactor } from '../generals';
import { terrainAt } from '../mapGrid';
import { canFight, isAlive, isEnemyOf, isOnMap } from '../util/predicates';
import { weatherHit } from '../weather';
import type { CombatInfo, GameEventOf, GameState, Pos, Rng, Team, Unit } from '../model';
import { removeDead } from './lifecycle';
import { reachableTiles, type MoveRange } from './movement';
import { buildingAt } from './queries';
import { visibility } from './visibility';

// ---- Alcance y objetivos ----

/** Un tipo de unidad alcanza de `from` a `to`: mas lejos que su alcance minimo y no mas que el maximo. */
export function inAttackRange(type: number, from: Pos, to: Pos): boolean {
  const distance = manhattan(from, to);
  return distance > UNIT.minalc[type]! && distance <= UNIT.alcance[type]!;
}

/** `attacker` puede luchar y hacer dano a una unidad como `defender` (sin mirar distancias). */
export function canDamage(attacker: Unit, defender: Unit): boolean {
  return canFight(attacker) && basePower(attacker, defender) > 0;
}

/** Probabilidad de acierto de la tabla, sin terreno ni modificadores (0 = no le hace nada). */
function basePower(attacker: Unit, defender: Unit): number {
  return POWER[attacker.type]![defender.type] ?? 0;
}

/**
 * Casillas desde las que `unit` puede disparar este turno: donde esta y, si no es de distancia (esas
 * no pueden mover y disparar) y se pasa su alcance `range`, las que alcanza (las que acepte `allowed`).
 */
export function fireOrigins(unit: Unit, range: MoveRange | null, allowed?: (pos: Pos) => boolean): Pos[] {
  const origins: Pos[] = [{ x: unit.x, y: unit.y }];
  if (!range || isRanged(unit.type)) return origins;
  const reachable = reachableTiles(range);
  origins.push(...(allowed ? reachable.filter((pos) => allowed(pos)) : reachable));
  return origins;
}

/** Objetivos atacables desde la posicion actual (Ilogic.getAtkMap). */
export function attackTargets(s: GameState, attacker: Unit, visible = visibility(s, attacker.team)): Unit[] {
  if (!attacker.canFire || !canFight(attacker)) return [];
  return s.units.filter(
    (target) =>
      isEnemyOf(target, attacker) &&
      isOnMap(target) &&
      isAlive(target) &&
      visible.at(target) &&
      canDamage(attacker, target) &&
      inAttackRange(attacker.type, attacker, target),
  );
}

// ---- Probabilidad de acierto ----

/**
 * Factor de proteccion de una casilla (terreno por edificio, si lo hay): multiplica la probabilidad
 * de que acierten a quien esta en ella. 1 = sin proteccion.
 */
export function tileProtection(s: GameState, pos: Pos): number {
  const building = buildingAt(s, pos.x, pos.y);
  const terrainProtection = TERRAIN.protection[terrainAt(s, pos)]!;
  return terrainProtection * (building ? BUILDING.protection[building.type]! : 1);
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
function veterancyFactor(_s: GameState, attacker: Unit, defender: Unit): number {
  if (!RULES.veterancy) return 1;
  return (1 + RULES.vetBonus * rank(attacker)) * (1 - RULES.vetBonus * rank(defender));
}

/** [CAMBIO] Flanqueo: rematar a quien ya ha recibido un ataque hoy es mas facil. */
function flankFactor(s: GameState, _attacker: Unit, defender: Unit): number {
  return flanked(s, defender) ? 1 + RULES.flankBonus : 1;
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
  // Con lluvia o tormenta se apunta peor (igual para los dos bandos).
  { id: 'weather', factor: (s) => weatherHit(s) },
];

/** Probabilidad de acierto de cada "disparo" (uno por punto de vida del atacante). Puede pasar de 1. */
export function hitChance(s: GameState, attacker: Unit, defender: Unit): number {
  let chance = POWER[attacker.type]![defender.type]! * coverAgainst(attacker.type, tileProtection(s, defender));
  for (const modifier of HIT_MODIFIERS) chance *= modifier.factor(s, attacker, defender);
  return chance;
}

/** La probabilidad de acierto como probabilidad de verdad (sin pasar de 1). */
function cappedHitChance(s: GameState, attacker: Unit, defender: Unit): number {
  return Math.min(1, hitChance(s, attacker, defender));
}

// ---- Veterania, flanqueo y botin ----

/** Bajas necesarias para cada rango (1, 2 y 3 estrellas). */
export const RANK_KILLS = [1, 3, 6] as const;

/** [CAMBIO] La unidad ya ha recibido un ataque hoy y la regla de flanqueo esta puesta. */
export function flanked(s: GameState, defender: Unit): boolean {
  return RULES.flankBonus > 0 && defender.hitDay === s.day;
}

/** [CAMBIO] Botin por destruir una unidad de ese tipo (0 sin la regla). */
export function bountyFor(type: number): number {
  return Math.round(UNIT.cost[type]! * RULES.bounty);
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

/** Lo que ha pasado en un ataque (ver attackFull). */
export interface AttackResult {
  /** Vida quitada al defensor. */
  damage: number;
  killed: boolean;
  /** Vida quitada al atacante por el contraataque (0 si no lo hay). */
  counter: number;
  attackerKilled: boolean;
  /** [CAMBIO] Dinero cobrado por quien destruyo una unidad (0 si nadie cayo o no hay botin). */
  bounty: number;
}

const NO_ATTACK: Readonly<AttackResult> = { damage: 0, killed: false, counter: 0, attackerKilled: false, bounty: 0 };

/**
 * Daño de un ataque de una unidad con `life` puntos de vida que acierta con probabilidad `chance`.
 * Original: cada punto de vida es un disparo que acierta con probabilidad `chance`.
 * [CAMBIO] con RULES.damageSpread: el daño esperado (life x chance) +- ese tanto por uno.
 */
function rollDamage(life: number, chance: number, rng: Rng): number {
  if (RULES.damageSpread === null) {
    let hits = 0;
    for (let shot = 0; shot < life; shot++) if (rng() < chance) hits++;
    return hits;
  }
  const expected = life * chance;
  const spread = (rng() * 2 - 1) * RULES.damageSpread;
  return Math.max(0, Math.round(expected * (1 + spread)));
}

/** Daño que hace `attacker` a `defender` en una tirada (sin pasar de la vida que le queda). */
function strike(s: GameState, attacker: Unit, defender: Unit, rng: Rng): number {
  return Math.min(defender.life, rollDamage(attacker.life, cappedHitChance(s, attacker, defender), rng));
}

/**
 * [CAMBIO] Contraataque (RULES.counterattack): el defensor que sobrevive responde si es una
 * unidad de cuerpo a cuerpo, el atacante tambien lo es y lo tiene a su alcance.
 * La artilleria y demas unidades a distancia ni contraatacan ni reciben contraataque.
 */
export function canCounter(defender: Unit, attacker: Unit): boolean {
  if (!RULES.counterattack || !isAlive(defender)) return false;
  if (isRanged(defender.type) || isRanged(attacker.type)) return false;
  return canDamage(defender, attacker) && inAttackRange(defender.type, defender, attacker);
}

/** Puede atacar a `defender` ahora mismo: es enemigo, le queda disparo y lo tiene a tiro. */
function canAttackNow(attacker: Unit, defender: Unit): boolean {
  if (!isEnemyOf(attacker, defender) || !attacker.canFire || !canFight(attacker)) return false;
  return inAttackRange(attacker.type, attacker, defender);
}

/** Atacar gasta el turno entero de la unidad. */
function endTurnAfterAttack(attacker: Unit): void {
  attacker.active = false;
  attacker.canFire = false;
  attacker.canMove = false;
}

/** Quien destruye a otra unidad gana una baja (veterania), si sigue viva. */
function countKills(attacker: Unit, defender: Unit, result: AttackResult): void {
  if (result.killed && isAlive(attacker)) attacker.kills = (attacker.kills ?? 0) + 1;
  if (result.attackerKilled && isAlive(defender)) defender.kills = (defender.kills ?? 0) + 1;
}

/** [CAMBIO] Botin: quien destruye cobra parte del precio de lo destruido (atacar sale a cuenta). */
function payBounty(s: GameState, attacker: Unit, defender: Unit, result: AttackResult): void {
  const winner: Team | null = result.killed ? attacker.team : result.attackerKilled ? defender.team : null;
  if (winner === null) return;
  const lostType = result.killed ? defender.type : attacker.type;
  result.bounty = bountyFor(lostType);
  s.funds[winner] = Math.min(MAX_FUNDS, s.funds[winner] + result.bounty);
}

/** Ataque completo: daño, y contraataque si las reglas lo tienen. */
export function attackFull(s: GameState, attacker: Unit, defender: Unit, rng: Rng): AttackResult {
  if (!canAttackNow(attacker, defender)) return { ...NO_ATTACK };

  const damage = strike(s, attacker, defender, rng);
  defender.life -= damage;
  defender.hitDay = s.day;
  endTurnAfterAttack(attacker);

  const counter = canCounter(defender, attacker) ? strike(s, defender, attacker, rng) : 0;
  attacker.life -= counter;

  chargeFromCombat(s, attacker, defender, damage, counter);
  const result: AttackResult = {
    damage,
    killed: !isAlive(defender),
    counter,
    attackerKilled: !isAlive(attacker),
    bounty: 0,
  };
  countKills(attacker, defender, result);
  payBounty(s, attacker, defender, result);
  removeDead(s);
  return result;
}

/** Como estan las dos unidades antes de luchar, para enseñar el combate despues (ver CombatInfo). */
function combatInfoBefore(s: GameState, attacker: Unit, defender: Unit): CombatInfo {
  return {
    attackerType: attacker.type,
    defenderType: defender.type,
    attackerTeam: attacker.team,
    attackerLife: attacker.life,
    defenderLife: defender.life,
    attackerRank: rank(attacker),
    defenderRank: rank(defender),
    hit: cappedHitChance(s, attacker, defender),
    counterHit: canCounter(defender, attacker) ? cappedHitChance(s, defender, attacker) : null,
  };
}

/**
 * Ataque completo como evento para la interfaz (jugador e IA). Ademas del resultado lleva lo que
 * hace falta para enseñar el combate aunque alguna de las dos unidades ya no exista: tipos, bandos,
 * vidas de antes, rangos y probabilidad de acierto de cada lado (ver CombatInfo).
 */
export function attackEvent(s: GameState, attacker: Unit, defender: Unit, rng: Rng): GameEventOf<'attack'> {
  const info = combatInfoBefore(s, attacker, defender);
  const target = { x: defender.x, y: defender.y };
  const result = attackFull(s, attacker, defender, rng);
  // Si el defensor cae no hay contraataque, aunque pudiera haberlo.
  if (result.killed) info.counterHit = null;
  return {
    kind: 'attack',
    attacker: attacker.uid,
    target,
    damage: result.damage,
    killed: result.killed,
    counter: result.counter,
    attackerKilled: result.attackerKilled,
    ...(result.bounty ? { bounty: result.bounty } : {}),
    combat: info,
  };
}

/** Ataca y devuelve el daño hecho (ver attackFull para el contraataque). */
export function attack(s: GameState, attacker: Unit, defender: Unit, rng: Rng): number {
  return attackFull(s, attacker, defender, rng).damage;
}
