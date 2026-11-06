/**
 * Laboratorio de duelos: una unidad contra otra, sin mapa ni IA, usando las reglas reales
 * (uncheckedAttack de core/sandbox.ts, el combate de la accion 'attack': incluye contraataque o menos
 * azar si las reglas lo tienen).
 */
import { findEntry, type GameContent, type TerrainType, type UnitType } from '@core/content';

import { seedFromDraw, seededRng } from '@core/util/random';
import { diceOf } from '@core/dice';
import { newGameState } from '@core/gameState';
import { duel, duelTeams } from '@core/teams';
import { blankMap } from '@core/mapGrid';
import { inAttackRange, newUnit } from '@core/rules';
import { uncheckedAttack } from '@core/sandbox';
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
    diceSeed: seedFromDraw(rng()),
  });
}

function place(s: GameState, attackerType: UnitType, attacker: Unit, defender: Unit): void {
  // A distancia minima a la que A puede atacar a B.
  const distance = attackerType.attack?.minRange ?? 1;
  attacker.x = 10;
  attacker.y = 10;
  defender.x = 10 + distance;
  defender.y = 10;
  s.units = [attacker, defender];
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

export function duelMatrix(options: DuelOptions): DuelCell[] {
  const { content } = options;
  const terrain = findEntry(content.terrain, options.terrain) ?? content.plainTerrain;
  const rng = seededRng(options.seed);
  const hitChance = (attacker: UnitType, defender: UnitType) => attacker.attack?.hitChance[defender.id] ?? 0;
  const cells: DuelCell[] = [];
  for (const attackerType of content.units.list) {
    if (!attackerType.attack) continue;
    for (const defenderType of content.units.list) {
      if (!(hitChance(attackerType, defenderType) > 0)) continue;
      let dmg = 0,
        counter = 0,
        kills = 0;
      for (let i = 0; i < options.trials; i++) {
        const s = arena(terrain, options, rng);
        const [attackerTeam, defenderTeam] = duelTeams(s);
        const attacker = newUnit(s, attackerType, attackerTeam, { x: 0, y: 0 });
        const defender = newUnit(s, defenderType, defenderTeam, { x: 0, y: 0 });
        place(s, attackerType, attacker, defender);
        const lifeA = attacker.life;
        dmg += uncheckedAttack(s, attacker, defender, diceOf(s)).damage;
        counter += lifeA - (s.units.includes(attacker) ? attacker.life : 0);
        if (!s.units.includes(defender)) kills++;
      }
      // Duelo a muerte: se alternan ataques mientras ambos sigan vivos y se alcancen.
      let first: number | null = null;
      const mutual = hitChance(defenderType, attackerType) > 0 && defenderType.attack !== null;
      if (mutual) {
        let wins = 0,
          decided = 0;
        for (let i = 0; i < options.trials; i++) {
          const s = arena(terrain, options, rng);
          const [attackerTeam, defenderTeam] = duelTeams(s);
          const attacker = newUnit(s, attackerType, attackerTeam, { x: 0, y: 0 });
          const defender = newUnit(s, defenderType, defenderTeam, { x: 0, y: 0 });
          place(s, attackerType, attacker, defender);
          if (!inAttackRange(s, defender, defender, attacker)) break; // B no llega a A a esa distancia: no hay duelo mutuo
          for (let round = 0; round < 40; round++) {
            const [shooter, target] = round % 2 === 0 ? [attacker, defender] : [defender, attacker];
            if (!s.units.includes(shooter) || !s.units.includes(target)) break;
            uncheckedAttack(s, shooter, target, diceOf(s));
          }
          const aAlive = s.units.includes(attacker),
            bAlive = s.units.includes(defender);
          if (aAlive !== bAlive) {
            decided++;
            if (aAlive) wins++;
          }
        }
        first = decided ? wins / decided : null;
      }
      const trials = options.trials;
      cells.push({
        attacker: attackerType.id,
        defender: defenderType.id,
        damage: dmg / trials,
        counter: counter / trials,
        killChance: kills / trials,
        valuePer1000: (((dmg / trials) * defenderType.cost) / 100 / attackerType.cost) * 1000,
        firstStrikeWins: first,
      });
    }
  }
  return cells;
}
