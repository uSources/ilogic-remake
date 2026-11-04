/**
 * Arena de la IA: la IA actual (src/core/ai.ts y src/core/ai/) contra la guardada (improve/ai-baseline/),
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
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aiTurn } from '@core/ai';
import { AI, UNIT, rulesWith } from '@core/data';
import { seededRng } from '@core/geom';
import { generateGame } from '@core/mapgen';
import { endRound, outcome } from '@core/rules';
import type { GameEvent, GameState, Rng, Team } from '@core/model';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const BASE_DIR = `${ROOT}improve/ai-baseline/`;

type Brain = (s: GameState, rng: Rng, team: Team) => Generator<GameEvent>;

function strength(s: GameState, t: Team): number {
  const army = s.units.filter((u) => u.team === t).reduce((a, u) => a + (UNIT.cost[u.type]! * u.life) / 100, 0);
  return army + s.buildings.filter((b) => b.owner === t).length * 1500 + s.funds[t] * 0.5;
}

/** Una partida; devuelve el bando ganador (o null si empate). */
export function duel(seed: number, brains: [Brain, Brain], size: number, maxDays: number): Team | null {
  const rng = seededRng(seed);
  const s = generateGame(rng, { size, rules: rulesWith() });
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

/**
 * Ficheros de la IA que se copian: ai.ts y todo src/core/ai/ (rutas relativas a src/core). Las
 * reglas, los datos y demas se siguen usando los de ahora, por su alias.
 */
function aiFiles(): string[] {
  return [
    'ai.ts',
    ...readdirSync(`${ROOT}src/core/ai`)
      .filter((f) => f.endsWith('.ts'))
      .map((f) => `ai/${f}`),
  ];
}

/**
 * Prepara un fichero de la IA para la copia: los imports de fuera de la IA pasan a '@core/...' y
 * los pesos (AI de data) salen de weights.ts, congelados al hacer la copia.
 */
export function snapshotSource(rel: string, src: string, copied: ReadonlySet<string>): string {
  const dir = posix.dirname(rel);
  const weights = dir === '.' ? './weights' : posix.relative(dir, 'weights');
  const out = src.replace(/from '(\.{1,2}\/[^']+)'/g, (m, spec: string) => {
    const target = posix.normalize(posix.join(dir, spec));
    return copied.has(`${target}.ts`) ? m : `from '@core/${target}'`;
  });
  // import { AI, X } from '@core/data' -> import { X } from '@core/data' + import { AI } from './weights'
  return out.replace(/import \{([^}]*)\} from '@core\/data';/, (m, names: string) => {
    const list = names
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean);
    if (!list.includes('AI')) return m;
    const rest = list.filter((n) => n !== 'AI');
    const own = `import { AI } from '${weights}';`;
    return rest.length ? `import { ${rest.join(', ')} } from '@core/data';\n${own}` : own;
  });
}

/** Copia la IA actual como referencia (ai.ts y src/core/ai/), con sus pesos (data.AI) congelados. */
function snapshot(): void {
  rmSync(`${BASE_DIR}ai`, { recursive: true, force: true });
  mkdirSync(`${BASE_DIR}ai`, { recursive: true });
  const files = aiFiles();
  const copied = new Set(files);
  const day = new Date().toISOString().slice(0, 10);
  for (const rel of files) {
    const src = snapshotSource(rel, readFileSync(`${ROOT}src/core/${rel}`, 'utf8'), copied);
    writeFileSync(`${BASE_DIR}${rel}`, `// Copia de la IA guardada por npm run arena -- --snapshot (${day}). No editar.\n${src}`);
  }
  writeFileSync(
    `${BASE_DIR}weights.ts`,
    `// Pesos de data.AI al guardar la IA de referencia (${day}). No editar.\nexport const AI = ${JSON.stringify(AI)} as const;\n`,
  );
  console.log(`IA actual guardada como referencia en improve/ai-baseline/ (${files.length} ficheros)`);
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
