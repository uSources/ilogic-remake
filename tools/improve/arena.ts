/**
 * Arena de la IA: dos perfiles de IA (`AiProfile`: pesos, razones de ataque, comportamientos) uno
 * contra otro, mismos mapas, la mitad de las partidas con los bandos cambiados. Un cambio en la IA
 * solo se acepta si gana claramente. Los perfiles se le dan a cada controlador (`aiController`): las
 * dos IAs juegan a la vez en el mismo proceso, sin copiar codigo ni cambiar nada global.
 *
 *   npm run arena                     la IA del juego contra la de referencia (sus pesos guardados en
 *                                     improve/ai-baseline.json), 200 partidas de 20x20, 40 dias
 *   npm run arena -- --games 400 --size 32
 *   npm run arena -- --candidate tools/improve/miPerfil.ts
 *                                     otro perfil (el fichero exporta `candidate(contenido): AiProfile`)
 *                                     contra la IA del juego: para probar comportamientos o razones nuevas
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

export function arena(current: AiProfile, baseline: AiProfile, games: number, size: number, maxDays: number): ArenaResult {
  let wins = 0,
    losses = 0,
    draws = 0;
  for (let i = 0; i < games; i++) {
    const seed = 1 + Math.floor(i / 2);
    const swapped = i % 2 === 1; // mismo mapa, equipos cambiados
    const winner = playDuel(seed, swapped ? [baseline, current] : [current, baseline], size, maxDays);
    if (winner === null) draws++;
    else if ((winner === 'first') !== swapped) wins++;
    else losses++;
  }
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

/** El perfil de un fichero de --candidate: exporta `candidate(contenido)`. */
async function candidateFrom(file: string, content: GameContent): Promise<AiProfile> {
  const module = (await import(pathToFileURL(file).href)) as { candidate?: (content: GameContent) => AiProfile };
  if (typeof module.candidate !== 'function') throw new Error(`${file} no exporta candidate(contenido): AiProfile`);
  return module.candidate(content);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--snapshot')) return snapshot();
  const opt = (key: string, fallback: number) => (args.includes(`--${key}`) ? Number(args[args.indexOf(`--${key}`) + 1]) : fallback);
  const content = defaultContent();
  const games = opt('games', 200),
    size = opt('size', 20),
    days = opt('days', 40);
  const candidateIndex = args.indexOf('--candidate');
  if (candidateIndex < 0 && !existsSync(BASELINE_FILE)) {
    console.log('No hay pesos de referencia: npm run arena -- --snapshot');
    process.exit(1);
  }
  const [current, rival, rivalName] =
    candidateIndex >= 0
      ? [await candidateFrom(args[candidateIndex + 1] ?? '', content), defaultAiProfile(content), 'la del juego']
      : [
          defaultAiProfile(content),
          baselineProfile(content, readWeights(JSON.parse(readFileSync(BASELINE_FILE, 'utf8')))),
          'la de referencia',
        ];
  const t0 = Date.now();
  const result = arena(current, rival, games, size, days);
  const pct = (x: number) => `${Math.round(x * 100)} %`;
  console.log(
    `IA a probar contra ${rivalName}: ${result.wins} ganadas, ${result.losses} perdidas, ${result.draws} empates (${games} partidas ${size}x${size}, ${((Date.now() - t0) / 1000).toFixed(0)} s)`,
  );
  console.log(`Gana el ${pct(result.rate)} de las decididas (95 %: ${pct(result.low)}-${pct(result.high)})`);
  const verdict =
    result.low > 0.5
      ? 'MEJOR: la IA a probar gana claramente'
      : result.high < 0.5
        ? 'PEOR: la IA a probar pierde claramente'
        : 'SIN DIFERENCIA CLARA (hacen falta mas partidas o el cambio no importa)';
  console.log(verdict);
}

if (process.argv[1]?.endsWith('arena.ts')) await main();
