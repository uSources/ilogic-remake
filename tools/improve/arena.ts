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
import { defaultContent } from '@core/content/default';
import { createGame } from '@core/defaultGames';
import { tablesOf } from '@core/gameContent';
import { seededRng } from '@core/geom';
import { endRound, outcome } from '@core/rules';
import type { GameEvent, GameState, Rng, Team } from '@core/model';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const BASE_DIR = `${ROOT}improve/ai-baseline/`;

type Brain = (s: GameState, rng: Rng, team: Team) => Generator<GameEvent>;

function strength(s: GameState, team: Team): number {
  const { UNIT } = tablesOf(s);
  const army = s.units.filter((unit) => unit.team === team).reduce((amount, unit) => amount + (UNIT.cost[unit.type]! * unit.life) / 100, 0);
  return army + s.buildings.filter((building) => building.owner === team).length * 1500 + s.funds[team] * 0.5;
}

/** Una partida; devuelve el bando ganador (o null si empate). */
export function duel(seed: number, brains: [Brain, Brain], size: number, maxDays: number): Team | null {
  const rng = seededRng(seed);
  const s = createGame(rng, { size });
  while (outcome(s) === 'playing' && s.day <= maxDays) {
    for (const team of [0, 1] as Team[]) {
      for (const _ of brains[team](s, rng, team)) if (outcome(s) !== 'playing') break;
      if (outcome(s) !== 'playing') break;
    }
    if (outcome(s) !== 'playing') break;
    endRound(s);
  }
  const result = outcome(s);
  if (result === 'won') return 0;
  if (result === 'lost') return 1;
  const playerStrength = strength(s, 0),
    aiStrength = strength(s, 1);
  return Math.max(playerStrength, aiStrength) >= 1.15 * Math.min(playerStrength, aiStrength) ? (playerStrength > aiStrength ? 0 : 1) : null;
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
    const winner = duel(seed, swapped ? [baseline, current] : [current, baseline], size, maxDays);
    if (winner === null) draws++;
    else if ((winner === 0) !== swapped) wins++;
    else losses++;
  }
  const played = wins + losses;
  const rate = played ? wins / played : 0.5;
  const se = played ? 1.96 * Math.sqrt((rate * (1 - rate)) / played) : 0.5;
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
      .filter((file) => file.endsWith('.ts'))
      .map((file) => `ai/${file}`),
  ];
}

/**
 * Prepara un fichero de la IA para la copia: los imports de fuera de la IA pasan a '@core/...' y
 * los pesos (`weightsOf` de gameContent) salen de weights.ts, congelados al hacer la copia: la IA de
 * referencia juega siempre con los pesos que tenia, aunque la partida lleve otros.
 */
export function snapshotSource(rel: string, source: string, copied: ReadonlySet<string>): string {
  const directory = posix.dirname(rel);
  const weights = directory === '.' ? './weights' : posix.relative(directory, 'weights');
  const out = source.replace(/from '(\.{1,2}\/[^']+)'/g, (match, spec: string) => {
    const target = posix.normalize(posix.join(directory, spec));
    return copied.has(`${target}.ts`) ? match : `from '@core/${target}'`;
  });
  // import { weightsOf, X } from '@core/gameContent' -> import { X } from '@core/gameContent' + import { weightsOf } from './weights'
  return out.replace(/import \{([^}]*)\} from '@core\/gameContent';/, (whole, names: string) => {
    const list = names
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);
    if (!list.includes('weightsOf')) return whole;
    const rest = list.filter((name) => name !== 'weightsOf');
    const own = `import { weightsOf } from '${weights}';`;
    return rest.length ? `import { ${rest.join(', ')} } from '@core/gameContent';\n${own}` : own;
  });
}

/** Copia la IA actual como referencia (ai.ts y src/core/ai/), con sus pesos (los de ai.json) congelados. */
function snapshot(): void {
  rmSync(`${BASE_DIR}ai`, { recursive: true, force: true });
  mkdirSync(`${BASE_DIR}ai`, { recursive: true });
  const files = aiFiles();
  const copied = new Set(files);
  const day = new Date().toISOString().slice(0, 10);
  for (const rel of files) {
    const source = snapshotSource(rel, readFileSync(`${ROOT}src/core/${rel}`, 'utf8'), copied);
    writeFileSync(`${BASE_DIR}${rel}`, `// Copia de la IA guardada por npm run arena -- --snapshot (${day}). No editar.\n${source}`);
  }
  writeFileSync(
    `${BASE_DIR}weights.ts`,
    `// Pesos de ai.json al guardar la IA de referencia (${day}). No editar.\n` +
      `const AI = ${JSON.stringify(defaultContent().tables.AI)} as const;\n` +
      `/** La IA de referencia juega con estos pesos, sea cual sea el contenido de la partida. */\n` +
      `export const weightsOf = (_s: unknown): typeof AI => AI;\n`,
  );
  console.log(`IA actual guardada como referencia en improve/ai-baseline/ (${files.length} ficheros)`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--snapshot')) return snapshot();
  const opt = (key: string, fallback: number) => (args.includes(`--${key}`) ? Number(args[args.indexOf(`--${key}`) + 1]) : fallback);
  if (!existsSync(`${BASE_DIR}ai.ts`)) {
    console.log('No hay IA de referencia: npm run arena -- --snapshot');
    process.exit(1);
  }
  const base = (await import(`${BASE_DIR}ai.ts`)) as { aiTurn: Brain };
  const games = opt('games', 200),
    size = opt('size', 20),
    days = opt('days', 40);
  const t0 = Date.now();
  const result = arena(aiTurn, base.aiTurn, games, size, days);
  const pct = (x: number) => `${Math.round(x * 100)} %`;
  console.log(
    `IA actual contra la de referencia: ${result.wins} ganadas, ${result.losses} perdidas, ${result.draws} empates (${games} partidas ${size}x${size}, ${((Date.now() - t0) / 1000).toFixed(0)} s)`,
  );
  console.log(`Gana el ${pct(result.rate)} de las decididas (95 %: ${pct(result.low)}-${pct(result.high)})`);
  const verdict =
    result.low > 0.5
      ? 'MEJOR: la IA actual gana claramente'
      : result.high < 0.5
        ? 'PEOR: la IA actual pierde claramente'
        : 'SIN DIFERENCIA CLARA (hacen falta mas partidas o el cambio no importa)';
  console.log(verdict);
}

if (process.argv[1]?.endsWith('arena.ts')) await main();
