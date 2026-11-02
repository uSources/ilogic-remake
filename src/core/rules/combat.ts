/**
 * Combate: alcance, proteccion del terreno, probabilidad de acierto, veterania, contraataque, botin
 * y el ataque en si (con su evento).
 */
import { BUILDING, MAX_FUNDS, POWER, RULES, TERRAIN, UNIT } from '../data';
import { coverAgainst, defenseFactor } from '../abilities';
import { manhattan } from '../geom';
import { chargeFromCombat, generalHitFactor } from '../generals';
import { weatherHit } from '../weather';
import type { CombatInfo, GameEvent, GameState, Pos, Rng, Unit } from '../types';
import { removeDead } from './lifecycle';
import { buildingAt } from './queries';
import { visibility } from './visibility';

export function inAttackRange(type: number, from: Pos, to: Pos): boolean {
  const d = manhattan(from, to);
  return d > UNIT.minalc[type]! && d <= UNIT.alcance[type]!;
}

/** Objetivos atacables desde la posicion actual (Ilogic.getAtkMap). */
export function attackTargets(s: GameState, u: Unit, vis = visibility(s, u.team)): Unit[] {
  if (!u.canFire || !UNIT.canfight[u.type]) return [];
  return s.units.filter(
    (t) =>
      t.team !== u.team && t.carrier === null && t.life > 0 && vis[t.x]![t.y] && POWER[u.type]![t.type]! > 0 && inAttackRange(u.type, u, t),
  );
}

/**
 * Factor de proteccion de una casilla (terreno por edificio, si lo hay): multiplica la probabilidad
 * de que acierten a quien esta en ella. 1 = sin proteccion.
 */
export function tileProtection(s: GameState, p: Pos): number {
  const b = buildingAt(s, p.x, p.y);
  return TERRAIN.protection[s.map[p.x]![p.y]!]! * (b ? BUILDING.protection[b.type]! : 1);
}

/** Estrellas de defensa que se enseñan para una casilla (0..4). */
export function defenseStars(s: GameState, p: Pos): number {
  return Math.max(0, Math.min(4, Math.round(((1 - tileProtection(s, p)) * 100) / 10)));
}

/** Probabilidad de acierto de cada "disparo" (uno por punto de vida del atacante). */
export function hitChance(s: GameState, atk: Unit, def: Unit): number {
  let p = POWER[atk.type]![def.type]! * coverAgainst(atk.type, tileProtection(s, def));
  // [CAMBIO] Habilidades del defensor y de sus aliados (escudo, aura).
  p *= defenseFactor(s, atk, def);
  // [CAMBIO] Veterania: cada rango da +vetBonus de acierto al atacar y -vetBonus al que le ataca.
  if (RULES.veterancy) p *= (1 + RULES.vetBonus * rank(atk)) * (1 - RULES.vetBonus * rank(def));
  // [CAMBIO] Flanqueo: rematar a quien ya ha recibido un ataque hoy es mas facil (premia atacar en grupo).
  if (flanked(s, def)) p *= 1 + RULES.flankBonus;
  // [CAMBIO] Generales: ventaja fija de los dos bandos.
  p *= generalHitFactor(s, atk, def);
  // [CAMBIO] Clima: con lluvia o tormenta se apunta peor.
  return p * weatherHit(s);
}

/** Bajas necesarias para cada rango (1, 2 y 3 estrellas). */
export const RANK_KILLS = [1, 3, 6] as const;

/** [CAMBIO] La unidad ya ha recibido un ataque hoy y la regla de flanqueo esta puesta. */
export function flanked(s: GameState, def: Unit): boolean {
  return RULES.flankBonus > 0 && def.hitDay === s.day;
}

/** [CAMBIO] Botin por destruir una unidad de ese tipo (0 sin la regla). */
export function bountyFor(type: number): number {
  return Math.round(UNIT.cost[type]! * RULES.bounty);
}

/** Rango de veterania de una unidad: 0 a 3. */
export function rank(u: Unit): number {
  const k = u.kills ?? 0;
  return RANK_KILLS.filter((n) => k >= n).length;
}

/** Dano esperado (para la IA y para mostrarlo en pantalla). */
export function expectedDamage(s: GameState, atk: Unit, def: Unit): number {
  return Math.min(def.life, atk.life * Math.min(1, hitChance(s, atk, def)));
}

/**
 * Ataque (Ilogic.Attack): una tirada por punto de vida del atacante; cada acierto quita 1.
 * Sin contraataque. Gasta 1 de municion. Devuelve el dano hecho.
 */
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

/**
 * Daño de un ataque de `atk` (con `life` puntos de vida) a una unidad con la probabilidad `p`.
 * Original: cada punto de vida es un disparo que acierta con probabilidad p.
 * [CAMBIO] con RULES.damageSpread: el daño esperado (life x p) +- ese tanto por uno.
 */
function rollDamage(life: number, p: number, rng: Rng): number {
  if (RULES.damageSpread === null) {
    let dmg = 0;
    for (let i = 0; i < life; i++) if (rng() < p) dmg++;
    return dmg;
  }
  const expected = life * p;
  return Math.max(0, Math.round(expected * (1 + (rng() * 2 - 1) * RULES.damageSpread)));
}

/**
 * [CAMBIO] Contraataque (RULES.counterattack): el defensor que sobrevive responde si es una
 * unidad de cuerpo a cuerpo, el atacante tambien lo es y lo tiene a su alcance.
 * La artilleria y demas unidades a distancia ni contraatacan ni reciben contraataque.
 */
export function canCounter(def: Unit, atk: Unit): boolean {
  return (
    RULES.counterattack &&
    def.life > 0 &&
    !!UNIT.canfight[def.type] &&
    UNIT.minalc[def.type] === 0 &&
    UNIT.minalc[atk.type] === 0 &&
    (POWER[def.type]![atk.type] ?? 0) > 0 &&
    inAttackRange(def.type, def, atk)
  );
}

/** Ataque completo: daño, y contraataque si las reglas lo tienen. */
export function attackFull(s: GameState, atk: Unit, def: Unit, rng: Rng): AttackResult {
  const none: AttackResult = { damage: 0, killed: false, counter: 0, attackerKilled: false, bounty: 0 };
  if (atk.team === def.team || !atk.canFire || !UNIT.canfight[atk.type]) return none;
  if (!inAttackRange(atk.type, atk, def)) return none;
  const damage = Math.min(def.life, rollDamage(atk.life, Math.min(1, hitChance(s, atk, def)), rng));
  def.life -= damage;
  def.hitDay = s.day;
  atk.active = false;
  atk.canFire = false;
  atk.canMove = false;
  let counter = 0;
  if (canCounter(def, atk)) {
    counter = Math.min(atk.life, rollDamage(def.life, Math.min(1, hitChance(s, def, atk)), rng));
    atk.life -= counter;
  }
  chargeFromCombat(s, atk, def, damage, counter);
  const result: AttackResult = { damage, killed: def.life <= 0, counter, attackerKilled: atk.life <= 0, bounty: 0 };
  if (result.killed && atk.life > 0) atk.kills = (atk.kills ?? 0) + 1;
  if (result.attackerKilled && def.life > 0) def.kills = (def.kills ?? 0) + 1;
  // [CAMBIO] Botin: quien destruye cobra parte del precio de lo destruido (atacar sale a cuenta).
  const [winner, lost] = result.killed ? [atk.team, def.type] : result.attackerKilled ? [def.team, atk.type] : [null, 0];
  if (winner !== null) {
    result.bounty = bountyFor(lost);
    s.funds[winner] = Math.min(MAX_FUNDS, s.funds[winner] + result.bounty);
  }
  removeDead(s);
  return result;
}

/**
 * Ataque completo como evento para la interfaz (jugador e IA). Ademas del resultado lleva lo que
 * hace falta para enseñar el combate aunque alguna de las dos unidades ya no exista: tipos, bandos,
 * vidas de antes, rangos y probabilidad de acierto de cada lado (ver CombatInfo).
 */
export function attackEvent(s: GameState, atk: Unit, def: Unit, rng: Rng): Extract<GameEvent, { kind: 'attack' }> {
  const info: CombatInfo = {
    attackerType: atk.type,
    defenderType: def.type,
    attackerTeam: atk.team,
    attackerLife: atk.life,
    defenderLife: def.life,
    attackerRank: rank(atk),
    defenderRank: rank(def),
    hit: Math.min(1, hitChance(s, atk, def)),
    counterHit: canCounter(def, atk) ? Math.min(1, hitChance(s, def, atk)) : null,
  };
  const target = { x: def.x, y: def.y };
  const r = attackFull(s, atk, def, rng);
  // Si el defensor cae no hay contraataque, aunque pudiera haberlo.
  if (r.killed) info.counterHit = null;
  return {
    kind: 'attack',
    attacker: atk.uid,
    target,
    damage: r.damage,
    killed: r.killed,
    counter: r.counter,
    attackerKilled: r.attackerKilled,
    ...(r.bounty ? { bounty: r.bounty } : {}),
    combat: info,
  };
}

/** Ataca y devuelve el daño hecho (ver attackFull para el contraataque). */
export function attack(s: GameState, atk: Unit, def: Unit, rng: Rng): number {
  return attackFull(s, atk, def, rng).damage;
}
