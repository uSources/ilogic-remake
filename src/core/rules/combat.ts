/**
 * Combate: alcance, proteccion del terreno, probabilidad de acierto, veterania, contraataque, botin
 * y el ataque en si (con su evento).
 */
import { BUILDING, MAX_FUNDS, POWER, RULES, TERRAIN, UNIT } from '../data';
import { coverAgainst, defenseFactor, isRanged } from '../abilities';
import { manhattan } from '../geom';
import { chargeFromCombat, generalHitFactor } from '../generals';
import { weatherHit } from '../weather';
import type { CombatInfo, GameEventOf, GameState, Pos, Rng, Unit } from '../types';
import { removeDead } from './lifecycle';
import { reachableTiles, type MoveRange } from './movement';
import { buildingAt } from './queries';
import { visibility } from './visibility';

export function inAttackRange(type: number, from: Pos, to: Pos): boolean {
  const d = manhattan(from, to);
  return d > UNIT.minalc[type]! && d <= UNIT.alcance[type]!;
}

/** `atk` puede luchar y hacer dano a una unidad como `def` (sin mirar distancias). */
export function canDamage(atk: Unit, def: Unit): boolean {
  return !!UNIT.canfight[atk.type] && POWER[atk.type]![def.type]! > 0;
}

/**
 * Casillas desde las que `u` puede disparar este turno: donde esta y, si no es de distancia (esas no
 * pueden mover y disparar) y se pasa su alcance `range`, las que alcanza (las que acepte `allowed`).
 */
export function fireOrigins(u: Unit, range: MoveRange | null, allowed?: (p: Pos) => boolean): Pos[] {
  const out: Pos[] = [{ x: u.x, y: u.y }];
  if (range && !isRanged(u.type)) out.push(...reachableTiles(range).filter((p) => !allowed || allowed(p)));
  return out;
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

/**
 * Algo que cambia la probabilidad de acierto (habilidades, veterania, generales, clima...). Devuelve
 * un multiplicador: 1 = nada (con la regla apagada, por ejemplo).
 */
export interface HitModifier {
  /** Nombre corto (para depurar o enseñar el desglose). */
  readonly id: string;
  factor(s: GameState, atk: Unit, def: Unit): number;
}

/**
 * [CAMBIO] Modificadores del acierto, en el orden en que se aplican sobre el poder base y la
 * proteccion de la casilla. Una regla nueva que cambie el acierto es una entrada mas: la prevision,
 * el panel de combate y la IA la ven solas porque todas pasan por hitChance.
 * El orden importa (redondeo de coma flotante: las partidas de referencia lo notarian).
 */
export const HIT_MODIFIERS: readonly HitModifier[] = [
  // [CAMBIO] Habilidades del defensor y de sus aliados (escudo, aura).
  { id: 'abilities', factor: defenseFactor },
  // [CAMBIO] Veterania: cada rango da +vetBonus de acierto al atacar y -vetBonus al que le ataca.
  {
    id: 'veterancy',
    factor: (_s, atk, def) => (RULES.veterancy ? (1 + RULES.vetBonus * rank(atk)) * (1 - RULES.vetBonus * rank(def)) : 1),
  },
  // [CAMBIO] Flanqueo: rematar a quien ya ha recibido un ataque hoy es mas facil (premia atacar en grupo).
  { id: 'flank', factor: (s, _atk, def) => (flanked(s, def) ? 1 + RULES.flankBonus : 1) },
  // [CAMBIO] Generales: ventaja fija de los dos bandos.
  { id: 'generals', factor: generalHitFactor },
  // [CAMBIO] Clima: con lluvia o tormenta se apunta peor.
  { id: 'weather', factor: (s) => weatherHit(s) },
];

/** Probabilidad de acierto de cada "disparo" (uno por punto de vida del atacante). Puede pasar de 1. */
export function hitChance(s: GameState, atk: Unit, def: Unit): number {
  let p = POWER[atk.type]![def.type]! * coverAgainst(atk.type, tileProtection(s, def));
  for (const m of HIT_MODIFIERS) p *= m.factor(s, atk, def);
  return p;
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
    !isRanged(def.type) &&
    !isRanged(atk.type) &&
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
export function attackEvent(s: GameState, atk: Unit, def: Unit, rng: Rng): GameEventOf<'attack'> {
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
