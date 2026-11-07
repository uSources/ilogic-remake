/**
 * Laboratorio de duelos: una unidad contra otra, sin mapa ni IA, usando las reglas reales
 * (uncheckedAttack de core/measure.ts, el combate de la accion 'attack': incluye contraataque o menos
 * azar si las reglas lo tienen).
 */
import { findEntry, type GameContent, type TerrainType, type UnitType } from '@core/content';

import { seedFromDraw, seededRng } from '@core/util/random';
import { diceOf } from '@core/dice';
import { newGameState } from '@core/gameState';
import { duel, duelTeams } from '@core/teams';
import { blankMap } from '@core/mapGrid';
import { inAttackRange } from '@core/rules';
import { uncheckedAttack, newUnit } from '@core/measure';
import type { GameState, Rng, MatchSettings, Unit } from '@core/model';

export interface DuelCell {
  attacker: string;
  defender: string;
  /** Daño medio de un ataque (unidades a 100 de vida). */
  damage: number;
  /** Daño medio devuelto por el defensor (contraataque). */
  counter: number;
  killChance: number;
  /** Valor quitado por cada 1000 de coste del atacante, en un ataque. */
  valuePer1000: number;
  /** Duelo a muerte por turnos (si los dos pueden atacarse): % que gana quien ataca primero. */
  firstStrikeWins: number | null;
}

/** Lado del campo de los duelos (solo se usan unas casillas del medio). */
const DUEL_MAP_SIZE = 32;
/** La fila (y la columna del atacante) en la que se ponen las unidades. */
const DUEL_ROW = 10;

/** El campo de un duelo, con sus propios dados (sacados de `rng`: cada duelo tira distinto). */
function arena(terrain: TerrainType, options: DuelOptions, rng: Rng): GameState {
  const map = blankMap(DUEL_MAP_SIZE, terrain.id);
  return newGameState({
    map,
    settings: options.settings,
    content: options.content,
    // Un campo para medir el combate suelto: no se acaba solo.
    mode: 'sandbox',
    teams: duel('ai', 'ai').map((team) => ({ ...team, funds: 0 })),
    seeds: { dice: seedFromDraw(rng()), decisions: seedFromDraw(rng()) },
  });
}

/** Cuantos duelos por pareja, en que terreno, con que semilla y con que reglas. */
export interface DuelOptions {
  trials: number;
  terrain: string;
  seed: number;
  settings: MatchSettings;
  /** Contenido de las unidades que se enfrentan (el de una variante, o el del juego). */
  content: GameContent;
}

/** Un duelo preparado: el campo y las dos unidades, el atacante a la distancia minima a la que llega al defensor. */
interface Duel {
  s: GameState;
  attacker: Unit;
  defender: Unit;
}

/** Una pareja de tipos que se enfrenta en el campo de un terreno. */
interface Pairing {
  attackerType: UnitType;
  defenderType: UnitType;
  terrain: TerrainType;
}

/** Un duelo nuevo de la pareja (con sus propios dados, sacados de `rng`). */
function setUpDuel({ attackerType, defenderType, terrain }: Pairing, options: DuelOptions, rng: Rng): Duel {
  const s = arena(terrain, options, rng);
  const [attackerTeam, defenderTeam] = duelTeams(s);
  const attacker = newUnit(s, attackerType, attackerTeam, { x: 0, y: 0 });
  const defender = newUnit(s, defenderType, defenderTeam, { x: 0, y: 0 });
  const distance = attackerType.attack?.minRange ?? 1;
  attacker.x = DUEL_ROW;
  attacker.y = DUEL_ROW;
  defender.x = DUEL_ROW + distance;
  defender.y = DUEL_ROW;
  s.units = [attacker, defender];
  return { s, attacker, defender };
}

const isAlive = ({ s }: Duel, unit: Unit): boolean => s.units.includes(unit);

/** Un solo ataque, `trials` veces: daño hecho y devuelto de media, y cuantas veces destruye. */
function singleAttacks(pairing: Pairing, options: DuelOptions, rng: Rng): Pick<DuelCell, 'damage' | 'counter' | 'killChance'> {
  const totals = { damage: 0, counter: 0, kills: 0 };
  for (let i = 0; i < options.trials; i++) {
    const duel = setUpDuel(pairing, options, rng);
    const { s, attacker, defender } = duel;
    const lifeBefore = attacker.life;
    totals.damage += uncheckedAttack(s, attacker, defender, diceOf(s)).damage;
    totals.counter += lifeBefore - (isAlive(duel, attacker) ? attacker.life : 0);
    if (!isAlive(duel, defender)) totals.kills++;
  }
  const trials = options.trials;
  return { damage: totals.damage / trials, counter: totals.counter / trials, killChance: totals.kills / trials };
}

/** Rondas de un duelo a muerte como mucho (si nadie cae antes, no lo gana nadie). */
const DUEL_ROUNDS = 40;

/** Se atacan por turnos, empezando el atacante, hasta que cae uno: quien queda (null si los dos o ninguno). */
function fightToTheEnd(duel: Duel): Unit | null {
  const { s, attacker, defender } = duel;
  for (let round = 0; round < DUEL_ROUNDS; round++) {
    const [shooter, target] = round % 2 === 0 ? [attacker, defender] : [defender, attacker];
    if (!isAlive(duel, shooter) || !isAlive(duel, target)) break;
    uncheckedAttack(s, shooter, target, diceOf(s));
  }
  const survivors = [attacker, defender].filter((unit) => isAlive(duel, unit));
  return survivors.length === 1 ? survivors[0]! : null;
}

/**
 * Duelo a muerte, `trials` veces, si los dos pueden atacarse: que parte de los decididos gana quien
 * ataca primero (null si el defensor no llega al atacante o no se decide ninguno).
 */
function firstStrikeWins(pairing: Pairing, options: DuelOptions, rng: Rng): number | null {
  const { attackerType, defenderType } = pairing;
  if (!(hitChance(defenderType, attackerType) > 0) || defenderType.attack === null) return null;
  const tally = { wins: 0, decided: 0 };
  for (let i = 0; i < options.trials; i++) {
    const duel = setUpDuel(pairing, options, rng);
    if (!inAttackRange(duel.s, duel.defender, duel.defender, duel.attacker)) break; // B no llega a A a esa distancia: no hay duelo mutuo
    const survivor = fightToTheEnd(duel);
    if (survivor === null) continue;
    tally.decided++;
    if (survivor === duel.attacker) tally.wins++;
  }
  return tally.decided ? tally.wins / tally.decided : null;
}

const hitChance = (attacker: UnitType, defender: UnitType): number => attacker.attack?.hitChance[defender.id] ?? 0;

/** La tabla de duelos: cada tipo que ataca contra cada tipo al que puede dar. */
export function duelMatrix(options: DuelOptions): DuelCell[] {
  const { content } = options;
  const terrain = findEntry(content.terrain, options.terrain) ?? content.plainTerrain;
  const rng = seededRng(options.seed);
  const cells: DuelCell[] = [];
  for (const attackerType of content.units.list) {
    if (!attackerType.attack) continue;
    for (const defenderType of content.units.list) {
      if (!(hitChance(attackerType, defenderType) > 0)) continue;
      const pairing = { attackerType, defenderType, terrain };
      const attack = singleAttacks(pairing, options, rng);
      cells.push({
        attacker: attackerType.id,
        defender: defenderType.id,
        ...attack,
        valuePer1000: ((attack.damage * defenderType.cost) / 100 / attackerType.cost) * 1000,
        firstStrikeWins: firstStrikeWins(pairing, options, rng),
      });
    }
  }
  return cells;
}
