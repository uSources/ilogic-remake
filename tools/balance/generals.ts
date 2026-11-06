/**
 * Cuanto aporta un general: la IA con el general A contra la IA con B (o sin general) en los mismos
 * mapas, dos partidas por mapa con los bandos cambiados. La IA a menudo no acaba la partida: al dia
 * 60 gana quien tenga mas puntos (como con limite de dias: ejercito + 1000 por edificio). Cuenta
 * victorias (y cuantas fueron por puntos), empates y cuantas veces usa cada poder.
 *
 *   npm run generals -- --a Roca                 Roca contra sin general, 40 mapas (80 partidas)
 *   npm run generals -- --a Roca --b Brisa       Roca contra Brisa
 *   npm run generals -- --a Roca --maps 20 --from 100   otros mapas
 *   npm run generals -- --a Roca --json          una linea JSON (para sumar varias tandas)
 *
 * Referencia al hacerlo: Brisa contra sin general ganaba en torno al 64 % (#34).
 */
import { duel, duelTeams } from '@core/teams';
import { controllersFor, GameSession, runMatch } from '@core/session';
import { defaultContent } from '@core/content/default';
import { createMatch } from '@core/defaultGames';
import { skirmishConfig } from '@core/match';
import { appointGeneral } from '@core/generals';
import { seededRng } from '@core/util/random';
import { isWinner, matchResult, score } from '@core/rules';
import type { GameState } from '@core/model';
import { FIRST_SIDE, SECOND_SIDE, type Side } from './play';

const arg = (name: string, fallback: string): string => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1]! : fallback;
};
const challenger = arg('a', '');
const rival = arg('b', 'none');
const maps = Number(arg('maps', '40'));
const from = Number(arg('from', '1'));
const json = process.argv.includes('--json');
/** Las partidas se cortan al dia 60 y se deciden por puntos. */
const MAX_DAYS = 60;
/** Los generales pedidos existen en el contenido del juego (si no, para antes de jugar). */
function checkGeneralIds(ids: string[]): void {
  const known = new Set(defaultContent().files.generals.map((general) => general.id));
  for (const id of ids) if (id !== 'none' && !known.has(id)) throw new Error(`General "${id}" no existe (${[...known].join(', ')}, none)`);
}

/** Una partida IA contra IA: quien gana (-1 empate) y si fue por puntos al dia 60. */
function play(
  seed: number,
  firstGeneral: string,
  secondGeneral: string,
  uses: Map<string, number>,
): { winner: Side | 'draw'; byScore: boolean } {
  const rng = seededRng(seed * 7919);
  const s: GameState = createMatch(skirmishConfig({ seed: seed * 7919, teams: duel('ai', 'ai') }), rng);
  const [first, second] = duelTeams(s);
  appointGeneral(s, first, firstGeneral === 'none' ? null : firstGeneral);
  appointGeneral(s, second, secondGeneral === 'none' ? null : secondGeneral);
  const session = new GameSession(s, controllersFor(s, rng));
  session.subscribe((step) => {
    for (const event of step.events)
      if (event.kind === 'power') uses.set(`${event.general}.${event.power}`, (uses.get(`${event.general}.${event.power}`) ?? 0) + 1);
  });
  runMatch(session, { until: (state) => state.day > MAX_DAYS });
  const result = matchResult(s);
  if (result.status === 'draw') return { winner: 'draw', byScore: false };
  if (result.status === 'decided') return { winner: isWinner(result, FIRST_SIDE) ? FIRST_SIDE : SECOND_SIDE, byScore: false };
  const scoreGap = score(s, FIRST_SIDE) - score(s, SECOND_SIDE);
  return { winner: scoreGap > 0 ? FIRST_SIDE : scoreGap < 0 ? SECOND_SIDE : 'draw', byScore: true };
}

checkGeneralIds([challenger, rival]);
let winsA = 0,
  winsB = 0,
  draws = 0,
  byScore = 0;
const uses = new Map<string, number>();
for (let mapSeed = from; mapSeed < from + maps; mapSeed++) {
  // Partida 1: A es el bando 0. Partida 2: A es el bando 1.
  for (const aTeam of [FIRST_SIDE, SECOND_SIDE]) {
    const result = play(mapSeed, aTeam === FIRST_SIDE ? challenger : rival, aTeam === FIRST_SIDE ? rival : challenger, uses);
    if (result.byScore) byScore++;
    if (result.winner === 'draw') draws++;
    else if (result.winner === aTeam) winsA++;
    else winsB++;
  }
}
const games = maps * 2;
if (json) {
  console.log(JSON.stringify({ a: challenger, b: rival, games, winsA, winsB, draws, byScore, uses: Object.fromEntries(uses) }));
} else {
  // Las victorias cuentan 1, los empates medio; margen del 95 %.
  const winRate = (winsA + draws / 2) / games;
  const margin = 1.96 * Math.sqrt((winRate * (1 - winRate)) / games);
  console.log(`${challenger} contra ${rival}: ${games} partidas en ${maps} mapas (desde ${from})`);
  console.log(
    `  gana ${challenger}: ${winsA}, gana ${rival}: ${winsB}, empates: ${draws} (${byScore} decididas por puntos al dia ${MAX_DAYS})`,
  );
  console.log(`  ${challenger} se lleva el ${Math.round(winRate * 100)} % (±${Math.round(margin * 100)})`);
  for (const [power, count] of uses) console.log(`  ${power}: ${count} veces (${(count / games).toFixed(1)} por partida)`);
}
