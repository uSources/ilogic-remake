/**
 * Cazador de fallos: juega muchas partidas mezclando IA y jugadas al azar, y comprueba los
 * invariantes (invariants.ts) despues de cada accion. Al primer fallo, para y dice como repetirlo.
 *
 *   npm run fuzz                                  200 partidas de 20x20, 30 dias como mucho
 *   npm run fuzz -- --games 1000 --size 32 --days 40 --seed 5000
 *   npm run fuzz -- --repro 1234                  repetir una partida concreta con todo el detalle
 */
import { aiTurn } from '../../src/core/ai';
import { DEFAULT_RULES, useRules } from '../../src/core/data';
import { seededRng } from '../../src/core/geom';
import { generateGame } from '../../src/core/mapgen';
import { endRound, outcome } from '../../src/core/rules';
import { serialize } from '../../src/core/save';
import type { GameState, Team } from '../../src/core/types';
import { checkInvariants } from './invariants';
import { randomTurn } from './randomPlayer';

export interface FuzzFailure {
  seed: number;
  day: number;
  team: Team;
  action: string;
  errors: string[];
  /** Estado justo antes de la accion que lo rompio (JSON, para abrirlo con npm run play -- --load). */
  before: string;
}

/** Una partida: cada bando juega al azar o con la IA (sorteado por turno). Devuelve el fallo o null. */
export function fuzzGame(seed: number, opts: { size?: number; days?: number; log?: (l: string) => void } = {}): FuzzFailure | null {
  useRules({ ...DEFAULT_RULES, fog: seed % 3 === 0 });
  const rng = seededRng(seed);
  const s: GameState = generateGame(rng, { size: opts.size ?? 20 });
  let before = serialize(s);
  let fail: FuzzFailure | null = null;
  const check = (team: Team, action: string) => {
    opts.log?.(`dia ${s.day} bando ${team}: ${action}`);
    const errors = checkInvariants(s);
    if (errors.length && !fail) fail = { seed, day: s.day, team, action, errors, before };
    before = serialize(s);
  };
  const initial = checkInvariants(s);
  if (initial.length) return { seed, day: 1, team: 0, action: 'mapa recien generado', errors: initial, before };
  while (outcome(s) === 'playing' && s.day <= (opts.days ?? 30) && !fail) {
    for (const team of [0, 1] as Team[]) {
      if (rng() < 0.5) randomTurn(s, rng, team, (a) => check(team, a));
      else for (const ev of aiTurn(s, rng, team)) check(team, `IA ${ev.kind} ${JSON.stringify(ev).slice(0, 80)}`);
      if (fail) return fail;
    }
    endRound(s);
    check(0, 'fin de ronda');
  }
  return fail;
}

function main(): void {
  const args = process.argv.slice(2);
  const num = (name: string, d: number) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? Number(args[i + 1]) : d;
  };
  const size = num('size', 20),
    days = num('days', 30);
  const repro = args.indexOf('--repro');
  if (repro >= 0) {
    const seed = Number(args[repro + 1]);
    const f = fuzzGame(seed, { size, days, log: (l) => console.log(l) });
    console.log(f ? `\nFALLO: ${f.errors.join('; ')}` : '\nsin fallos');
    process.exit(f ? 1 : 0);
  }
  const games = num('games', 200),
    first = num('seed', 1);
  const t0 = Date.now();
  for (let i = 0; i < games; i++) {
    const seed = first + i;
    const f = fuzzGame(seed, { size, days });
    if (f) {
      console.log(`FALLO en la partida ${seed} (dia ${f.day}, bando ${f.team}) tras: ${f.action}`);
      for (const e of f.errors) console.log(`  - ${e}`);
      console.log(`\nRepetir con detalle: npm run fuzz -- --repro ${seed} --size ${size} --days ${days}`);
      console.log(`Estado anterior (para npm run play -- --load): ${f.before.length} caracteres`);
      process.exit(1);
    }
  }
  console.log(`${games} partidas sin romper ningun invariante (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}

if (process.argv[1]?.endsWith('fuzz.ts')) main();
