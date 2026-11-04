import { describe, expect, it } from 'vitest';
import { aiTurn } from '@core/ai';
import { defaultContent } from '@core/content/default';
import { rulesWith } from '@core/rulesConfig';
import { createGame } from '@core/defaultGames';
import { seededRng } from '@core/geom';
import { blankMap, mapGrid } from '@core/mapGrid';
import { newGameState } from '@core/gameState';
import { endRound, moveRange, newUnit, reachableTiles, visibility } from '@core/rules';
import type { GameEvent, GameState } from '@core/model';

const TANK = defaultContent().tables.UNIT_NAMES.indexOf('Tank');

/** Partida vacia de ese lado, con niebla: el tanque del jugador abajo a la derecha y el de la IA arriba a la izquierda. */
function cornerMatch(size: number): GameState {
  const s = newGameState({
    map: blankMap(size),
    rules: rulesWith(defaultContent(), { fog: true }),
    content: defaultContent(),
    funds: [0, 0],
  });
  newUnit(s, TANK, 0, { x: size - 1, y: size - 1 });
  newUnit(s, TANK, 1, { x: 0, y: 0 });
  return s;
}

/** Lo que se calcula de una partida: tamaño del mapa, lo que ve el jugador y adonde llega su tanque. */
function measure(s: GameState) {
  const board = mapGrid(s);
  const seen = visibility(s, 0);
  const tiles = reachableTiles(moveRange(s, s.units[0]!));
  return { size: [board.width, board.height], seen: [seen.width, seen.height, [...seen.cells()].filter((c) => c.value).length], tiles };
}

describe('mapas de varios tamaños en el mismo proceso (sin tamaño global)', () => {
  it('una partida de 20 y otra de 40 usadas por turnos dan lo mismo que cada una sola', () => {
    const alone = [measure(cornerMatch(20)), measure(cornerMatch(40))];
    const small = cornerMatch(20);
    const large = cornerMatch(40);
    const alternated = [measure(small), measure(large), measure(small), measure(large)];
    expect(alternated).toEqual([alone[0], alone[1], alone[0], alone[1]]);
    expect(alone[0]!.size).toEqual([20, 20]);
    expect(alone[1]!.size).toEqual([40, 40]);
    // En el de 40 el tanque esta en (39,39): fuera del de 20. Ninguna casilla se sale de su mapa.
    for (const tile of alone[1]!.tiles) expect(mapGrid(large).contains(tile)).toBe(true);
    expect(alone[1]!.tiles.some((tile) => tile.x >= 20)).toBe(true);
  });

  it('dos partidas IA contra IA de 20 y de 40 jugadas a la vez hacen lo mismo que por separado', () => {
    const play = (games: GameState[], days: number) => {
      const rngs = games.map(() => seededRng(3));
      const events: GameEvent[][] = games.map(() => []);
      for (let day = 0; day < days; day++) {
        for (const team of [0, 1] as const) games.forEach((s, i) => events[i]!.push(...aiTurn(s, rngs[i]!, team)));
        games.forEach((s) => endRound(s));
      }
      return events;
    };
    const newMatch = (size: number) => createGame(seededRng(size), { size });
    const together = play([newMatch(20), newMatch(40)], 5);
    expect(together[0]).toEqual(play([newMatch(20)], 5)[0]);
    expect(together[1]).toEqual(play([newMatch(40)], 5)[0]);
  });
});
