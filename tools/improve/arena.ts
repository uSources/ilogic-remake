/**
 * Arena de la IA: dos perfiles de IA (`AiProfile`: pesos, razones de ataque, comportamientos y su
 * turno entero, `turn`) uno contra otro, mismos mapas, la mitad de las partidas con los bandos cambiados. Un cambio en la IA
 * solo se acepta si gana claramente. Los perfiles se le dan a cada controlador (`aiController`): las
 * dos IAs juegan a la vez en el mismo proceso, sin copiar codigo ni cambiar nada global.
 *
 *   npm run arena                     la IA del juego contra la de referencia (sus pesos guardados en
 *                                     improve/ai-baseline.json), 200 partidas de 20x20, 40 dias
 *   npm run arena -- --games 400 --size 32
 *   npm run arena -- --candidate tools/improve/candidates/miIdea.ts
 *                                     otro perfil (el fichero exporta `profile(contenido): AiProfile`)
 *                                     contra la IA del juego: para probar un cambio de codigo de la IA
 *                                     (comportamientos, razones de ataque o un turno distinto) antes de
 *                                     ponerlo en src/core
 *   npm run arena -- --candidate a.ts --rival b.ts
 *                                     dos perfiles cualesquiera (p. ej. la idea contra la anterior)
 *   npm run arena -- --snapshot       guarda los pesos de ahora (ai.json) como los de referencia
 *
 * Las partidas que no terminan se dan a quien tiene clara ventaja (`clearLeader`, tools/strength.ts).
 */
import { duel, duelTeams, teamState } from '@core/teams';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { defaultAiProfile, type AiProfile } from '@core/ai';
import { aiController, controllersFor } from '@core/controllers';
import type { AiWeights, GameContent } from '@core/content';
import { buildAiWeights, validateAi } from '@core/content/ai';
import { Checker } from '@core/content/check';
import { GameSession, runMatch } from '@core/session';
import { defaultContent } from '@core/content/default';
import { createMatch } from '@core/defaultGames';
import { skirmishConfig } from '@core/match';
import { seededRng } from '@core/util/random';
import { isWinner, matchResult, buildingsOf } from '@core/rules';
import { armyValue } from '@core/stats';
import type { GameState, TeamId } from '@core/model';
import { clearLeader, type Holdings } from '../balance/strength';
import { commandLine, type CliArgs } from '../cliArgs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
/** Los pesos de la IA de referencia (los de ai.json al guardarla con --snapshot). */
const BASELINE_FILE = `${ROOT}improve/ai-baseline.json`;

/** Lo que tiene un equipo al decidir una partida sin terminar. */
function holdingsOf(s: GameState, team: TeamId): Holdings {
  return { army: armyValue(s, team), buildings: buildingsOf(s, team).length, funds: teamState(s, team).funds };
}

/** Que IA ha ganado una partida: la primera de `profiles`, la segunda o ninguna (empate). */
export type DuelWinner = 'first' | 'second' | null;

/** Una partida: la primera IA lleva el primer equipo y la segunda, el segundo. */
export function playDuel(seed: number, profiles: [AiProfile, AiProfile], size: number, maxDays: number): DuelWinner {
  const rng = seededRng(seed);
  const s = createMatch(skirmishConfig({ seed, size, teams: duel('ai', 'ai') }), rng);
  const [first, second] = duelTeams(s);
  const controllers = new Map([
    [first, aiController(profiles[0])],
    [second, aiController(profiles[1])],
  ]);
  runMatch(new GameSession(s, controllersFor(s, controllers)), { until: (state) => state.day > maxDays });
  const result = matchResult(s);
  if (result.status === 'draw') return null;
  if (result.status === 'decided') return isWinner(result, first) ? 'first' : 'second';
  return clearLeader(holdingsOf(s, first), holdingsOf(s, second));
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

/** Como acaba una partida para la IA a probar. */
type Outcome = 'wins' | 'losses' | 'draws';

const outcomeOf = (winner: DuelWinner, swapped: boolean): Outcome =>
  winner === null ? 'draws' : (winner === 'first') !== swapped ? 'wins' : 'losses';

export function arena(current: AiProfile, baseline: AiProfile, games: number, size: number, maxDays: number): ArenaResult {
  const tally: Record<Outcome, number> = { wins: 0, losses: 0, draws: 0 };
  for (let i = 0; i < games; i++) {
    const seed = 1 + Math.floor(i / 2);
    const swapped = i % 2 === 1; // mismo mapa, equipos cambiados
    tally[outcomeOf(playDuel(seed, swapped ? [baseline, current] : [current, baseline], size, maxDays), swapped)]++;
  }
  const { wins, losses, draws } = tally;
  const played = wins + losses;
  const rate = played ? wins / played : 0.5;
  const se = played ? 1.96 * Math.sqrt((rate * (1 - rate)) / played) : 0.5;
  return { games, wins, losses, draws, rate, low: Math.max(0, rate - se), high: Math.min(1, rate + se) };
}

/** Lee unos pesos guardados (los de ai.json en su momento): tienen que ser justo los que lee la IA de ahora. */
export function readWeights(json: unknown): AiWeights {
  const check = new Checker();
  const weights: Record<string, unknown> = typeof json === 'object' && json !== null ? { ...json } : {};
  validateAi(weights, check);
  if (check.errors.length) throw new Error(`Pesos de referencia rotos: ${check.errors.join('; ')}`);
  return buildAiWeights(weights);
}

/** La IA de referencia: la del juego, con los pesos guardados. */
export const baselineProfile = (content: GameContent, weights: AiWeights): AiProfile => ({ ...defaultAiProfile(content), weights });

/** Guarda los pesos de ahora (ai.json) como los de la IA de referencia. */
function snapshot(): void {
  const { $schema: _schema, ...weights } = JSON.parse(readFileSync(`${ROOT}src/core/content/ai.json`, 'utf8')) as Record<string, unknown>;
  writeFileSync(BASELINE_FILE, `${JSON.stringify(readWeights(weights), null, 2)}\n`);
  console.log('Pesos de ahora (ai.json) guardados como los de referencia en improve/ai-baseline.json');
}

/** El perfil de un fichero de --candidate o --rival: exporta `profile(contenido)`. */
async function profileFrom(file: string, content: GameContent): Promise<AiProfile> {
  const module = (await import(pathToFileURL(file).href)) as { profile?: (content: GameContent) => AiProfile };
  if (typeof module.profile !== 'function') throw new Error(`${file} no exporta profile(contenido): AiProfile`);
  return module.profile(content);
}

/** La IA de referencia: la del juego con los pesos guardados (hace falta haberlos guardado con --snapshot). */
function savedBaseline(content: GameContent): AiProfile {
  if (!existsSync(BASELINE_FILE)) {
    console.log('No hay pesos de referencia: npm run arena -- --snapshot');
    process.exit(1);
  }
  return baselineProfile(content, readWeights(JSON.parse(readFileSync(BASELINE_FILE, 'utf8'))));
}

const ARENA_OPTIONS = { snapshot: 'flag', games: 'number', size: 'number', days: 'number', candidate: 'text', rival: 'text' } as const;

type ArenaArgs = CliArgs<typeof ARENA_OPTIONS>;

/** Contra quien juega la IA a probar: la de --rival; si no, la del juego si se prueba un --candidate, y si no, la de referencia. */
async function rivalFor(args: ArenaArgs, content: GameContent): Promise<{ profile: AiProfile; name: string }> {
  const rivalFile = args.text('rival');
  if (rivalFile) return { profile: await profileFrom(rivalFile, content), name: rivalFile };
  if (args.text('candidate')) return { profile: defaultAiProfile(content), name: 'la del juego' };
  return { profile: savedBaseline(content), name: 'la de referencia' };
}

/** El veredicto: el primero cuyo intervalo del 95 % encaja con el resultado. */
const VERDICTS: readonly { holds: (result: ArenaResult) => boolean; text: string }[] = [
  { holds: (result) => result.low > 0.5, text: 'MEJOR: la IA a probar gana claramente' },
  { holds: (result) => result.high < 0.5, text: 'PEOR: la IA a probar pierde claramente' },
  { holds: () => true, text: 'SIN DIFERENCIA CLARA (hacen falta mas partidas o el cambio no importa)' },
];

const verdictOf = (result: ArenaResult): string => VERDICTS.find((verdict) => verdict.holds(result))!.text;

async function main(): Promise<void> {
  const args = commandLine(import.meta.url, ARENA_OPTIONS);
  if (args.flag('snapshot')) return snapshot();
  const content = defaultContent();
  const games = args.number('games', 200);
  const size = args.number('size', 20);
  const days = args.number('days', 40);
  const candidateFile = args.text('candidate');
  const current = candidateFile ? await profileFrom(candidateFile, content) : defaultAiProfile(content);
  const rival = await rivalFor(args, content);
  const t0 = Date.now();
  const result = arena(current, rival.profile, games, size, days);
  const pct = (x: number) => `${Math.round(x * 100)} %`;
  console.log(
    `IA a probar contra ${rival.name}: ${result.wins} ganadas, ${result.losses} perdidas, ${result.draws} empates (${games} partidas ${size}x${size}, ${((Date.now() - t0) / 1000).toFixed(0)} s)`,
  );
  console.log(`Gana el ${pct(result.rate)} de las decididas (95 %: ${pct(result.low)}-${pct(result.high)})`);
  console.log(verdictOf(result));
}

if (process.argv[1]?.endsWith('arena.ts')) await main();
