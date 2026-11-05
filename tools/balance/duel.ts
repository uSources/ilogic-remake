/**
 * Laboratorio de duelos: una unidad contra otra, sin mapa ni IA, usando las reglas reales
 * (attack() de core/rules.ts, asi que incluye contraataque o menos azar si las reglas lo tienen).
 */
import { TERRAIN_NAMES, type GameContent } from '@core/content';
import { tablesOf } from '@core/gameContent';
import { seededRng } from '@core/geom';
import { newGameState } from '@core/gameState';
import { blankMap } from '@core/mapGrid';
import { attack, inAttackRange, newUnit } from '@core/rules';
import type { GameState, RulesConfig, Unit } from '@core/model';

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

function arena(terrain: number, opts: DuelOptions): GameState {
  return newGameState({ map: blankMap(DUEL_MAP_SIZE, terrain), rules: opts.rules, content: opts.content, funds: [0, 0] });
}

function place(s: GameState, attacker: Unit, defender: Unit): void {
  // A distancia minima a la que A puede atacar a B.
  const distance = tablesOf(s).UNIT.minalc[attacker.type]! + 1;
  attacker.x = 10;
  attacker.y = 10;
  defender.x = 10 + distance;
  defender.y = 10;
  s.units = [attacker, defender];
}

const fresh = (unit: Unit) => {
  unit.active = unit.canMove = unit.canFire = true;
};

/** Cuantos duelos por pareja, en que terreno, con que semilla y con que reglas. */
export interface DuelOptions {
  trials: number;
  terrain: string;
  seed: number;
  rules: RulesConfig;
  /** Contenido de las unidades que se enfrentan (el de una variante, o el del juego). */
  content: GameContent;
}

export function duelMatrix(opts: DuelOptions): DuelCell[] {
  const terrain = Math.max(0, TERRAIN_NAMES.indexOf(opts.terrain as (typeof TERRAIN_NAMES)[number]));
  const rng = seededRng(opts.seed);
  const { UNIT, POWER, UNIT_NAMES } = opts.content.tables;
  const unitTypes = UNIT_NAMES.length;
  const cells: DuelCell[] = [];
  for (let attackerType = 0; attackerType < unitTypes; attackerType++) {
    if (!UNIT.canfight[attackerType] || UNIT.alcance[attackerType] === 0) continue;
    for (let defenderType = 0; defenderType < unitTypes; defenderType++) {
      if (!(POWER[attackerType]![defenderType]! > 0)) continue;
      let dmg = 0,
        counter = 0,
        kills = 0;
      for (let i = 0; i < opts.trials; i++) {
        const s = arena(terrain, opts);
        const attacker = newUnit(s, attackerType, 0, { x: 0, y: 0 });
        const defender = newUnit(s, defenderType, 1, { x: 0, y: 0 });
        place(s, attacker, defender);
        const lifeA = attacker.life;
        dmg += attack(s, attacker, defender, rng);
        counter += lifeA - (s.units.includes(attacker) ? attacker.life : 0);
        if (!s.units.includes(defender)) kills++;
      }
      // Duelo a muerte: se alternan ataques mientras ambos sigan vivos y se alcancen.
      let first: number | null = null;
      const mutual = POWER[defenderType]![attackerType]! > 0 && UNIT.canfight[defenderType] && UNIT.alcance[defenderType]! > 0;
      if (mutual) {
        let wins = 0,
          decided = 0;
        for (let i = 0; i < opts.trials; i++) {
          const s = arena(terrain, opts);
          const attacker = newUnit(s, attackerType, 0, { x: 0, y: 0 });
          const defender = newUnit(s, defenderType, 1, { x: 0, y: 0 });
          place(s, attacker, defender);
          if (!inAttackRange(s, defenderType, defender, attacker)) break; // B no llega a A a esa distancia: no hay duelo mutuo
          for (let round = 0; round < 40; round++) {
            const [shooter, target] = round % 2 === 0 ? [attacker, defender] : [defender, attacker];
            if (!s.units.includes(shooter) || !s.units.includes(target)) break;
            fresh(shooter);
            attack(s, shooter, target, rng);
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
      const trials = opts.trials;
      cells.push({
        attacker: UNIT_NAMES[attackerType]!,
        defender: UNIT_NAMES[defenderType]!,
        damage: dmg / trials,
        counter: counter / trials,
        killChance: kills / trials,
        valuePer1000: (((dmg / trials) * UNIT.cost[defenderType]!) / 100 / UNIT.cost[attackerType]!) * 1000,
        firstStrikeWins: first,
      });
    }
  }
  return cells;
}
