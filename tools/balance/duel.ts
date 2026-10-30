/**
 * Laboratorio de duelos: una unidad contra otra, sin mapa ni IA, usando las reglas reales
 * (attack() de core/rules.ts, asi que incluye contraataque o menos azar si las reglas lo tienen).
 */
import { POWER, TERRAIN_NAMES, UNIT, UNIT_NAMES, UNIT_TYPES } from '@core/data';
import { grid, seededRng } from '@core/geom';
import { attack, inAttackRange, newUnit } from '@core/rules';
import type { GameState, Unit } from '@core/types';

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

function arena(terrain: number): GameState {
  const map = grid(terrain);
  return { version: 1, map, theme: 0, funds: [0, 0], units: [], buildings: [], nextUid: 1, day: 1 };
}

function place(s: GameState, a: Unit, b: Unit): void {
  // A distancia minima a la que A puede atacar a B.
  const d = UNIT.minalc[a.type]! + 1;
  a.x = 10;
  a.y = 10;
  b.x = 10 + d;
  b.y = 10;
  s.units = [a, b];
}

const fresh = (u: Unit) => {
  u.active = u.canMove = u.canFire = true;
};

export function duelMatrix(opts: { trials: number; terrain: string; seed: number }): DuelCell[] {
  const t = Math.max(0, TERRAIN_NAMES.indexOf(opts.terrain as (typeof TERRAIN_NAMES)[number]));
  const rng = seededRng(opts.seed);
  const cells: DuelCell[] = [];
  for (let A = 0; A < UNIT_TYPES; A++) {
    if (!UNIT.canfight[A] || UNIT.alcance[A] === 0) continue;
    for (let B = 0; B < UNIT_TYPES; B++) {
      if (!(POWER[A]![B]! > 0)) continue;
      let dmg = 0,
        counter = 0,
        kills = 0;
      for (let i = 0; i < opts.trials; i++) {
        const s = arena(t);
        const a = newUnit(s, A, 0, 0, 0);
        const b = newUnit(s, B, 1, 0, 0);
        place(s, a, b);
        const lifeA = a.life;
        dmg += attack(s, a, b, rng);
        counter += lifeA - (s.units.includes(a) ? a.life : 0);
        if (!s.units.includes(b)) kills++;
      }
      // Duelo a muerte: se alternan ataques mientras ambos sigan vivos y se alcancen.
      let first: number | null = null;
      const mutual = POWER[B]![A]! > 0 && UNIT.canfight[B] && UNIT.alcance[B]! > 0;
      if (mutual) {
        let wins = 0,
          decided = 0;
        for (let i = 0; i < opts.trials; i++) {
          const s = arena(t);
          const a = newUnit(s, A, 0, 0, 0);
          const b = newUnit(s, B, 1, 0, 0);
          place(s, a, b);
          if (!inAttackRange(B, b, a)) break; // B no llega a A a esa distancia: no hay duelo mutuo
          for (let round = 0; round < 40; round++) {
            const [x, y] = round % 2 === 0 ? [a, b] : [b, a];
            if (!s.units.includes(x) || !s.units.includes(y)) break;
            fresh(x);
            x.ammo = Math.max(x.ammo, 1);
            attack(s, x, y, rng);
          }
          const aAlive = s.units.includes(a),
            bAlive = s.units.includes(b);
          if (aAlive !== bAlive) {
            decided++;
            if (aAlive) wins++;
          }
        }
        first = decided ? wins / decided : null;
      }
      const n = opts.trials;
      cells.push({
        attacker: UNIT_NAMES[A]!,
        defender: UNIT_NAMES[B]!,
        damage: dmg / n,
        counter: counter / n,
        killChance: kills / n,
        valuePer1000: (((dmg / n) * UNIT.cost[B]!) / 100 / UNIT.cost[A]!) * 1000,
        firstStrikeWins: first,
      });
    }
  }
  return cells;
}
