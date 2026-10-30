/**
 * Arena de la IA: la IA actual (src/core/ai.ts) contra la guardada (improve/ai-baseline/ai.ts),
 * mismos mapas, la mitad de las partidas con los bandos cambiados. Un cambio en la IA solo se
 * acepta si gana claramente a la anterior.
 *
 *   npm run arena                     200 partidas de 20x20, 40 dias
 *   npm run arena -- --games 400 --size 32
 *   npm run arena -- --snapshot       guarda la IA actual como la de referencia (tras aceptar un cambio)
 *
 * Las partidas que no terminan se dan a quien tiene clara ventaja (ejercito + edificios + dinero,
 * al menos un 15 % mas); si no, empate.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { aiTurn } from '@core/ai';
import { AI, DEFAULT_RULES, UNIT, useRules } from '@core/data';
import { seededRng } from '@core/geom';
import { generateGame } from '@core/mapgen';
import { endRound, outcome } from '@core/rules';
import type { GameEvent, GameState, Rng, Team } from '@core/types';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const BASE_DIR = `${ROOT}improve/ai-baseline/`;

type Brain = (s: GameState, rng: Rng, team: Team) => Generator<GameEvent>;

function strength(s: GameState, t: Team): number {
  const army = s.units.filter((u) => u.team === t).reduce((a, u) => a + (UNIT.cost[u.type]! * u.life) / 100, 0);
  return army + s.buildings.filter((b) => b.owner === t).length * 1500 + s.funds[t] * 0.5;
}

/** Una partida; devuelve el bando ganador (o null si empate). */
export function duel(seed: number, brains: [Brain, Brain], size: number, maxDays: number): Team | null {
  useRules(DEFAULT_RULES);
  const rng = seededRng(seed);
  const s = generateGame(rng, { size });
  while (outcome(s) === 'playing' && s.day <= maxDays) {
    for (const t of [0, 1] as Team[]) {
      for (const _ of brains[t](s, rng, t)) if (outcome(s) !== 'playing') break;
      if (outcome(s) !== 'playing') break;
    }
    if (outcome(s) !== 'playing') break;
    endRound(s);
  }
  const o = outcome(s);
  if (o === 'won') return 0;
  if (o === 'lost') return 1;
  const a = strength(s, 0),
    b = strength(s, 1);
  return Math.max(a, b) >= 1.15 * Math.min(a, b) ? (a > b ? 0 : 1) : null;
}

export interface ArenaResult {
  games: number;
  wins: number;
  losses: number;
  draws: number;
  /** Partidas ganadas por la IA nueva entre las decididas, con su intervalo del 95 %. */
  rate: number;
  low: number;
  high: number;
}

export function arena(current: Brain, baseline: Brain, games: number, size: number, maxDays: number): ArenaResult {
  let wins = 0,
    losses = 0,
    draws = 0;
  for (let i = 0; i < games; i++) {
    const seed = 1 + Math.floor(i / 2);
    const swapped = i % 2 === 1; // mismo mapa, bandos cambiados
    const w = duel(seed, swapped ? [baseline, current] : [current, baseline], size, maxDays);
    if (w === null) draws++;
    else if ((w === 0) !== swapped) wins++;
    else losses++;
  }
  const n = wins + losses;
  const rate = n ? wins / n : 0.5;
  const se = n ? 1.96 * Math.sqrt((rate * (1 - rate)) / n) : 0.5;
  return { games, wins, losses, draws, rate, low: Math.max(0, rate - se), high: Math.min(1, rate + se) };
}

/** Copia la IA actual como referencia, con sus pesos (data.AI) congelados dentro. */
function snapshot(): void {
  mkdirSync(BASE_DIR, { recursive: true });
  let src = readFileSync(`${ROOT}src/core/ai.ts`, 'utf8');
  src = src.replace(/from '\.\/(\w+)'/g, "from '@core/$1'");
  src = src.replace(/import \{ AI, /, 'import { ');
  src = `// Copia de la IA guardada por npm run arena -- --snapshot (${new Date().toISOString().slice(0, 10)}). No editar.\n// Pesos de data.AI de ese momento:\nconst AI = ${JSON.stringify(AI)} as const;\n${src}`;
  writeFileSync(`${BASE_DIR}ai.ts`, src);
  console.log('IA actual guardada como referencia en improve/ai-baseline/ai.ts');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--snapshot')) return snapshot();
  const opt = (k: string, d: number) => (args.includes(`--${k}`) ? Number(args[args.indexOf(`--${k}`) + 1]) : d);
  if (!existsSync(`${BASE_DIR}ai.ts`)) {
    console.log('No hay IA de referencia: npm run arena -- --snapshot');
    process.exit(1);
  }
  const base = (await import(`${BASE_DIR}ai.ts`)) as { aiTurn: Brain };
  const games = opt('games', 200),
    size = opt('size', 20),
    days = opt('days', 40);
  const t0 = Date.now();
  const r = arena(aiTurn, base.aiTurn, games, size, days);
  const pct = (x: number) => `${Math.round(x * 100)} %`;
  console.log(
    `IA actual contra la de referencia: ${r.wins} ganadas, ${r.losses} perdidas, ${r.draws} empates (${games} partidas ${size}x${size}, ${((Date.now() - t0) / 1000).toFixed(0)} s)`,
  );
  console.log(`Gana el ${pct(r.rate)} de las decididas (95 %: ${pct(r.low)}-${pct(r.high)})`);
  const verdict =
    r.low > 0.5
      ? 'MEJOR: la IA actual gana claramente'
      : r.high < 0.5
        ? 'PEOR: la IA actual pierde claramente'
        : 'SIN DIFERENCIA CLARA (hacen falta mas partidas o el cambio no importa)';
  console.log(verdict);
}

if (process.argv[1]?.endsWith('arena.ts')) await main();
