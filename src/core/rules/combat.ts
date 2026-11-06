/**
 * Combate: alcance y objetivos, proteccion del terreno, probabilidad de acierto, veterania,
 * contraataque, botin y la tirada de daño. El ataque en si (lo que cambia en la partida) es la accion
 * 'attack' (actions/combat.ts).
 */

import { unitTypeOf, buildingTypeOf, terrainAt } from '../gameContent';
import { manhattan, posOf } from '../geom';
import { canFight, firesAfterMove, isAlive, areEnemies, isOnMap, isRanged } from '../util/predicates';
import type { HitModifier } from '../ruleModules/hooks';
import { hooksOf } from '../ruleModules/registry';
import { rank } from '../ruleModules/veterancy';
import type { ActionRejection, CombatInfo, Dice, GameState, Pos, Unit } from '../model';
import { reachableTiles, type MoveRange } from './movement';
import { buildingAt } from './queries';
import { sightOf, type Sight } from './visibility';
import { reversed, type Engagement } from './engagement';
import { damageModelOf } from './damage';
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
 * Casillas desde las que `unit` puede disparar este turno: donde esta y, si puede moverse y disparar
 * y se pasa su alcance `range`, las que alcanza (las que acepte `allowed`).
 */
export function fireOrigins(s: GameState, unit: Unit, range: MoveRange | null, allowed?: (pos: Pos) => boolean): Pos[] {
  const origins: Pos[] = [posOf(unit)];
  if (!range || !firesAfterMove(s, unit)) return origins;
  const reachable = reachableTiles(range);
  origins.push(...(allowed ? reachable.filter((pos) => allowed(pos)) : reachable));
  return origins;
}

/**
 * Por que `target` no es un objetivo para `attacker`, este donde este (null = lo es): un enemigo vivo
 * en el mapa que su equipo ve (`sees`) y al que le hace daño. No mira distancias ni si le queda disparo.
 */
export function targetProblem(s: GameState, attacker: Unit, target: Unit, sees: Sight): ActionRejection | null {
  if (!areEnemies(s, target, attacker) || !isOnMap(target) || !isAlive(target) || !sees(target)) return 'notTarget';
  return canDamage(s, attacker, target) ? null : 'notTarget';
}

/**
 * Por que `attacker` no puede atacar ahora a `target` desde `from` (null = puede): lucha y le queda
 * disparo, el objetivo lo es (targetProblem, con lo que ve su equipo: `sees`) y lo tiene a tiro desde
 * `from` (donde esta, si no se dice: la casilla a la que iria, para elegir desde donde atacar).
 */
export function attackProblem(
  s: GameState,
  attacker: Unit,
  target: Unit,
  sees: Sight = sightOf(s, attacker.team),
  from: Pos = attacker,
): ActionRejection | null {
  if (!canFight(s, attacker)) return 'noFighter';
  if (!canStillFire(s, attacker)) return 'spent';
  const problem = targetProblem(s, attacker, target, sees);
  if (problem) return problem;
  return inAttackRange(s, attacker, from, target) ? null : 'notTarget';
}

/** Objetivos atacables desde la posicion actual (Ilogic.getAtkMap; ver attackProblem). */
export function attackTargets(s: GameState, attacker: Unit, sees: Sight = sightOf(s, attacker.team)): Unit[] {
  return s.units.filter((target) => attackProblem(s, attacker, target, sees) === null);
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
 * Proteccion de la casilla que le queda al defensor frente a este atacante: la de la casilla, menos
 * la parte que perfora el atacante (la mayor de las que aporten los modulos; piercing).
 */
function coverLeft(s: GameState, { attacker, defender }: Engagement): number {
  const protection = tileProtection(s, defender.at);
  const piercing = Math.max(0, ...hooksOf(s, 'coverPiercing').map((rule) => rule.ignoredCover(s, attacker.unit)));
  return protection + (1 - protection) * piercing;
}

/**
 * Lo que da la probabilidad de acierto en cualquier partida: el poder del atacante contra ese tipo
 * (units.json) por la proteccion que le queda al defensor. Lo que cambia segun la partida (habilidades,
 * veterania, flanqueo, generales, clima) lo aportan sus modulos de reglas (`hitModifiersOf`).
 */
export const HIT_MODIFIERS: readonly HitModifier[] = [
  { id: 'power', factor: (s, { attacker, defender }) => basePower(s, attacker.unit, defender.unit) },
  { id: 'cover', factor: coverLeft },
];

/**
 * [CAMBIO] Todo lo que cambia el acierto en esta partida, en el orden en que se multiplica: el poder
 * y la proteccion, y despues lo de sus modulos de reglas (en su orden). Una regla nueva que cambie el
 * acierto es una entrada mas en su modulo: la prevision, el panel de combate y la IA la ven solas
 * porque todas pasan por hitChance. El orden importa (redondeo de coma flotante: las partidas de
 * referencia lo notarian).
 */
export const hitModifiersOf = (s: GameState): HitModifier[] => [...HIT_MODIFIERS, ...hooksOf(s, 'hitModifiers')];

/** Probabilidad de acierto de cada "disparo" (uno por punto de vida del atacante). Puede pasar de 1. */
export function hitChance(s: GameState, fight: Engagement): number {
  return hitModifiersOf(s).reduce((chance, modifier) => chance * modifier.factor(s, fight), 1);
}

/** La probabilidad de acierto como probabilidad de verdad (sin pasar de 1). */
export function cappedHitChance(s: GameState, fight: Engagement): number {
  return Math.min(1, hitChance(s, fight));
}

// ---- Botin ----

/** [CAMBIO] Botin por destruir una unidad como `lost` (0 sin la regla). */
export function bountyFor(s: GameState, lost: Pick<Unit, 'type'>): number {
  return Math.round(unitTypeOf(s, lost).cost * s.rules.bounty);
}

/** Dano esperado (para la IA y para mostrarlo en pantalla). */
export function expectedDamage(s: GameState, fight: Engagement): number {
  return Math.min(fight.defender.life, fight.attacker.life * cappedHitChance(s, fight));
}

// ---- El ataque ----

/** Daño que hace el atacante al defensor en una tirada (sin pasar de la vida que le queda). */
export function strike(s: GameState, fight: Engagement, dice: Dice): number {
  return Math.min(fight.defender.life, damageModelOf(s).roll(fight.attacker.life, cappedHitChance(s, fight), dice));
}

/**
 * [CAMBIO] Contraataque (s.rules.counterattack): el defensor que sobrevive responde si es una
 * unidad de cuerpo a cuerpo, el atacante tambien lo es y lo tiene a su alcance.
 * La artilleria y demas unidades a distancia ni contraatacan ni reciben contraataque.
 */
export function canCounter(s: GameState, { attacker, defender }: Engagement): boolean {
  if (!s.rules.counterattack || !isAlive(defender)) return false;
  if (isRanged(s, defender.unit) || isRanged(s, attacker.unit)) return false;
  return canDamage(s, defender.unit, attacker.unit) && inAttackRange(s, defender.unit, defender.at, attacker.at);
}

/** Como estan las dos unidades antes de luchar, para enseñar el combate despues (ver CombatInfo). */
export function combatInfoBefore(s: GameState, fight: Engagement): CombatInfo {
  const { attacker, defender } = fight;
  return {
    attackerType: attacker.unit.type,
    defenderType: defender.unit.type,
    attackerTeam: attacker.unit.team,
    defenderTeam: defender.unit.team,
    attackerLife: attacker.life,
    defenderLife: defender.life,
    attackerRank: rank(attacker.unit),
    defenderRank: rank(defender.unit),
    hit: cappedHitChance(s, fight),
    counterHit: canCounter(s, fight) ? cappedHitChance(s, reversed(fight)) : null,
  };
}
