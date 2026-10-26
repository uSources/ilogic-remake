/** Una partida IA contra IA con todo lo que pasa apuntado (sin Phaser). */
import { aiTurn } from '../../src/core/ai';
import { BUILDING, HQ, UNIT, UNIT_TYPES } from '../../src/core/data';
import { seededRng } from '../../src/core/geom';
import { generateGame } from '../../src/core/mapgen';
import { endRound, outcome } from '../../src/core/rules';
import type { GameState, Team } from '../../src/core/types';

export type Policy = 'ai' | 'passive';

export interface PlayOptions {
  seed: number;
  maxDays: number;
  /** Quien juega cada bando. 'passive' no hace nada (para medir a la IA). */
  policies: [Policy, Policy];
}

/** Por tipo de unidad y bando. */
export interface UnitTally {
  bought: number;
  spent: number;
  /** Puntos de vida quitados al enemigo. */
  damageDealt: number;
  /** Valor destruido: vida quitada x coste del objetivo / 100. */
  valueDealt: number;
  /** Valor perdido por las unidades de este tipo (vida perdida x coste propio / 100). */
  valueLost: number;
  kills: number;
  deaths: number;
  attacks: number;
  captures: number;
}

export interface DaySample {
  day: number;
  funds: [number, number];
  buildings: [number, number];
  /** Valor del ejercito: coste x vida/100. */
  army: [number, number];
}

export interface GameRecord {
  seed: number;
  winner: Team | null;
  reason: 'hq' | 'wipeout' | 'timeout';
  days: number;
  samples: DaySample[];
  units: UnitTally[][]; // [team][type]
  events: number;
}

const emptyTally = (): UnitTally => ({ bought: 0, spent: 0, damageDealt: 0, valueDealt: 0, valueLost: 0, kills: 0, deaths: 0, attacks: 0, captures: 0 });

function sample(s: GameState): DaySample {
  const army: [number, number] = [0, 0];
  for (const u of s.units) army[u.team] += (UNIT.cost[u.type]! * u.life) / 100;
  const buildings: [number, number] = [0, 0];
  for (const b of s.buildings) if (b.owner !== null) buildings[b.owner]++;
  return { day: s.day, funds: [s.funds[0], s.funds[1]], buildings, army: [Math.round(army[0]), Math.round(army[1])] };
}

export function playGame(opts: PlayOptions): GameRecord {
  const rng = seededRng(opts.seed);
  const s = generateGame(rng);
  const units: UnitTally[][] = [0, 1].map(() => Array.from({ length: UNIT_TYPES }, emptyTally));
  const samples: DaySample[] = [sample(s)];
  // Ultimo estado conocido de cada unidad (para saber a quien se ha atacado aunque ya no exista).
  const known = new Map<number, { type: number; team: Team; x: number; y: number; life: number }>();
  const remember = () => {
    known.clear();
    for (const u of s.units) known.set(u.uid, { type: u.type, team: u.team, x: u.x, y: u.y, life: u.life });
  };
  remember();
  let events = 0;
  let reason: GameRecord['reason'] = 'timeout';

  const finished = () => outcome(s) !== 'playing';
  while (!finished() && s.day <= opts.maxDays) {
    for (const team of [0, 1] as Team[]) {
      if (opts.policies[team] === 'passive') continue;
      for (const ev of aiTurn(s, rng, team)) {
        events++;
        if (ev.kind === 'attack') {
          const atk = known.get(ev.attacker);
          const victim = [...known.entries()].find(([, k]) => k.x === ev.target.x && k.y === ev.target.y && k.team !== team);
          if (atk) {
            const t = units[team]![atk.type]!;
            t.attacks++;
            t.damageDealt += ev.damage;
            if (victim) {
              const [, v] = victim;
              t.valueDealt += (ev.damage * UNIT.cost[v.type]!) / 100;
              const vt = units[v.team]![v.type]!;
              vt.valueLost += (ev.damage * UNIT.cost[v.type]!) / 100;
              if (ev.killed) {
                t.kills++;
                vt.deaths++;
              }
            }
          }
          // Contraataque (si las reglas lo tienen): vida perdida por el atacante.
          const after = s.units.find((u) => u.uid === ev.attacker);
          if (atk) {
            const lost = atk.life - (after?.life ?? 0);
            if (lost > 0 && victim) {
              const [, v] = victim;
              units[v.team]![v.type]!.damageDealt += lost;
              units[v.team]![v.type]!.valueDealt += (lost * UNIT.cost[atk.type]!) / 100;
              units[team]![atk.type]!.valueLost += (lost * UNIT.cost[atk.type]!) / 100;
              if (!after) {
                units[v.team]![v.type]!.kills++;
                units[team]![atk.type]!.deaths++;
              }
            }
          }
        } else if (ev.kind === 'spawn') {
          const u = s.units.find((x) => x.uid === ev.uid);
          if (u) {
            units[team]![u.type]!.bought++;
            units[team]![u.type]!.spent += UNIT.cost[u.type]!;
          }
        } else if (ev.kind === 'capture') {
          const u = s.units.find((x) => x.uid === ev.uid);
          if (u) units[team]![u.type]!.captures++;
        }
        remember();
        if (finished()) break;
      }
      if (finished()) break;
    }
    if (finished()) break;
    const report = endRound(s);
    // Aviones caidos sin combustible: cuentan como perdidos, sin que nadie los destruya.
    report.crashed.forEach((uid, i) => {
      const k = known.get(uid);
      const tm = report.crashedTeams[i]!;
      if (k) {
        units[tm]![k.type]!.deaths++;
        units[tm]![k.type]!.valueLost += (k.life * UNIT.cost[k.type]!) / 100;
      }
    });
    remember();
    samples.push(sample(s));
  }

  const result = outcome(s);
  let winner: Team | null = null;
  if (result !== 'playing') {
    winner = result === 'won' ? 0 : 1;
    const loser = (1 - winner) as Team;
    reason = s.buildings.some((b) => b.owner === loser && b.type === HQ) ? 'wipeout' : 'hq';
  }
  if (result === 'playing') samples.push(sample(s));
  void BUILDING;
  return { seed: opts.seed, winner, reason, days: s.day, samples, units, events };
}
