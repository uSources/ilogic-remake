/**
 * Cuanto aporta un general: la IA con el general A contra la IA con B (o sin general) en los mismos
 * mapas, dos partidas por mapa con los bandos cambiados. La IA a menudo no acaba la partida: al dia
 * 60 gana quien tenga mas puntos (como con limite de dias: ejercito + 1000 por edificio). Cuenta
 * victorias (y cuantas fueron por puntos), empates y cuantas veces usa cada habilidad.
 *
 *   npm run generals -- --a Roca                 Roca contra sin general, 40 mapas (80 partidas)
 *   npm run generals -- --a Roca --b Brisa       Roca contra Brisa
 *   npm run generals -- --a Roca --maps 20 --from 100   otros mapas
 *   npm run generals -- --a Roca --json          una linea JSON (para sumar varias tandas)
 *
 * Referencia al hacerlo: Brisa contra sin general ganaba en torno al 64 % (#34).
 */
import { aiTurn } from '@core/ai';
import { GENERALS } from '@core/data';
import { newGeneral } from '@core/generals';
import { seededRng } from '@core/geom';
import { generateGame } from '@core/mapgen';
import { endRound, outcome, score } from '@core/rules';
import type { GameEvent, GameState } from '@core/types';

const arg = (name: string, def: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : def;
};
const a = arg('a', '');
const b = arg('b', 'none');
const maps = Number(arg('maps', '40'));
const from = Number(arg('from', '1'));
const json = process.argv.includes('--json');
const known = new Set(GENERALS.map((g) => g.id));
for (const id of [a, b]) if (id !== 'none' && !known.has(id)) throw new Error(`General "${id}" no existe (${[...known].join(', ')}, none)`);
const gen = (id: string) => (id === 'none' ? null : newGeneral(id));

/** Una partida IA contra IA: quien gana (-1 empate) y si fue por puntos al dia 60. */
function play(seed: number, g0: string, g1: string, uses: Map<string, number>): { winner: 0 | 1 | -1; byScore: boolean } {
  const rng = seededRng(seed * 7919);
  const s: GameState = generateGame(rng);
  s.generals = [gen(g0), gen(g1)];
  while (outcome(s) === 'playing' && s.day <= 60) {
    for (const team of [0, 1] as const) {
      for (const ev of aiTurn(s, rng, team) as Iterable<GameEvent>) {
        if (ev.kind === 'ability') uses.set(`${ev.general}.${ev.ability}`, (uses.get(`${ev.general}.${ev.ability}`) ?? 0) + 1);
        if (outcome(s) !== 'playing') break;
      }
      if (outcome(s) !== 'playing') break;
    }
    endRound(s);
  }
  const o = outcome(s);
  if (o !== 'playing') return { winner: o === 'won' ? 0 : 1, byScore: false };
  const d = score(s, 0) - score(s, 1);
  return { winner: d > 0 ? 0 : d < 0 ? 1 : -1, byScore: true };
}

let winsA = 0,
  winsB = 0,
  draws = 0,
  byScore = 0;
const uses = new Map<string, number>();
for (let m = from; m < from + maps; m++) {
  // Partida 1: A es el bando 0. Partida 2: A es el bando 1.
  for (const aTeam of [0, 1] as const) {
    const r = play(m, aTeam === 0 ? a : b, aTeam === 0 ? b : a, uses);
    if (r.byScore) byScore++;
    if (r.winner === -1) draws++;
    else if (r.winner === aTeam) winsA++;
    else winsB++;
  }
}
const games = maps * 2;
if (json) {
  console.log(JSON.stringify({ a, b, games, winsA, winsB, draws, byScore, uses: Object.fromEntries(uses) }));
} else {
  // Las victorias cuentan 1, los empates medio; margen del 95 %.
  const p = (winsA + draws / 2) / games;
  const margin = 1.96 * Math.sqrt((p * (1 - p)) / games);
  console.log(`${a} contra ${b}: ${games} partidas en ${maps} mapas (desde ${from})`);
  console.log(`  gana ${a}: ${winsA}, gana ${b}: ${winsB}, empates: ${draws} (${byScore} decididas por puntos al dia 60)`);
  console.log(`  ${a} se lleva el ${Math.round(p * 100)} % (±${Math.round(margin * 100)})`);
  for (const [k, n] of uses) console.log(`  ${k}: ${n} veces (${(n / games).toFixed(1)} por partida)`);
}
