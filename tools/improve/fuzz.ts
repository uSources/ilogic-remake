/**
 * Cazador de fallos: juega muchas partidas mezclando IA y jugadas al azar, y comprueba los
 * invariantes (invariants.ts) despues de cada accion. Al primer fallo, para y dice como repetirlo.
 *
 *   npm run fuzz                                  200 partidas de 20x20, 30 dias como mucho
 *   npm run fuzz -- --games 1000 --size 32 --days 40 --seed 5000
 *   npm run fuzz -- --repro 1234                  repetir una partida concreta con todo el detalle
 */
import { duel, teamIds } from '@core/teams';
import { aiTurn } from '@core/ai';
import { seededRng } from '@core/geom';
import { createGame } from '@core/defaultGames';
import { endRound, isMatchOver } from '@core/rules';
import { serialize } from '@core/save';
import type { GameState, TeamId } from '@core/model';
import { checkInvariants } from './invariants';
import { randomTurn } from './randomPlayer';

export interface FuzzFailure {
  seed: number;
  day: number;
  team: TeamId;
  action: string;
  errors: string[];
  /** Estado justo antes de la accion que lo rompio (JSON, para abrirlo con npm run play -- --load). */
  before: string;
}

/** Una partida: cada bando juega al azar o con la IA (sorteado por turno). Devuelve el fallo o null. */
export function fuzzGame(seed: number, options: { size?: number; days?: number; log?: (line: string) => void } = {}): FuzzFailure | null {
  const rng = seededRng(seed);
  const s: GameState = createGame(rng, { size: options.size ?? 20, ruleChanges: { fog: seed % 3 === 0 }, teams: duel('ai', 'ai') });
  let before = serialize(s);
  let fail: FuzzFailure | null = null;
  const check = (team: TeamId, action: string) => {
    options.log?.(`dia ${s.day} equipo ${team}: ${action}`);
    const errors = checkInvariants(s);
    if (errors.length && !fail) fail = { seed, day: s.day, team, action, errors, before };
    before = serialize(s);
  };
  const initial = checkInvariants(s);
  if (initial.length) return { seed, day: 1, team: 0, action: 'mapa recien generado', errors: initial, before };
  while (!isMatchOver(s) && s.day <= (options.days ?? 30) && !fail) {
    for (const team of teamIds(s)) {
      if (rng() < 0.5) randomTurn(s, rng, team, (action) => check(team, action));
      else for (const event of aiTurn(s, rng, team)) check(team, `IA ${event.kind} ${JSON.stringify(event).slice(0, 80)}`);
      if (fail) return fail;
    }
    endRound(s);
    check(0, 'fin de ronda');
  }
  return fail;
}

function main(): void {
  const args = process.argv.slice(2);
  const numberArg = (name: string, fallback: number) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? Number(args[index + 1]) : fallback;
  };
  const size = numberArg('size', 20),
    days = numberArg('days', 30);
  const repro = args.indexOf('--repro');
  if (repro >= 0) {
    const seed = Number(args[repro + 1]);
    const failure = fuzzGame(seed, { size, days, log: (line) => console.log(line) });
    console.log(failure ? `\nFALLO: ${failure.errors.join('; ')}` : '\nsin fallos');
    process.exit(failure ? 1 : 0);
  }
  const games = numberArg('games', 200),
    first = numberArg('seed', 1);
  const t0 = Date.now();
  for (let i = 0; i < games; i++) {
    const seed = first + i;
    const failure = fuzzGame(seed, { size, days });
    if (failure) {
      console.log(`FALLO en la partida ${seed} (dia ${failure.day}, bando ${failure.team}) tras: ${failure.action}`);
      for (const error of failure.errors) console.log(`  - ${error}`);
      console.log(`\nRepetir con detalle: npm run fuzz -- --repro ${seed} --size ${size} --days ${days}`);
      console.log(`Estado anterior (para npm run play -- --load): ${failure.before.length} caracteres`);
      process.exit(1);
    }
  }
  console.log(`${games} partidas sin romper ningun invariante (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}

if (process.argv[1]?.endsWith('fuzz.ts')) main();
