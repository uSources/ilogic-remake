import { describe, expect, it } from 'vitest';
import { saveContext } from '@core/defaultGames';
import { aiTurn } from '@core/ai';
import { loadContent, readContentFiles, type GameContent } from '@core/content';
import { defaultContent } from '@core/content/default';
import { rulesWith } from '@core/rulesConfig';
import { cloneState, tablesOf } from '@core/gameContent';
import { seededRng } from '@core/geom';
import { generateGame } from '@core/mapgen';
import { buyOptions, endRound } from '@core/rules';
import { deserialize, serialize } from '@core/save';
import type { GameEvent, GameState, SavedGameState } from '@core/model';

/** Contenido del juego con los tanques al doble de precio (como una variante de equilibrio). */
function expensiveTanks(): GameContent {
  const files = readContentFiles();
  const units = files.units.map((unit) => (unit.id === 'Tank' ? { ...unit, cost: unit.cost * 2 } : unit));
  return loadContent({ ...files, units });
}

const TANK = defaultContent().tables.UNIT_NAMES.indexOf('Tank');

function newMatch(content: GameContent): GameState {
  return generateGame(seededRng(7), { size: 20, rules: rulesWith(defaultContent(), { fog: false }), content });
}

/** Juega `days` rondas IA contra IA de cada partida, alternando un turno de cada una. */
function playInterleaved(games: GameState[], days: number): GameEvent[][] {
  const rngs = games.map(() => seededRng(11));
  const events: GameEvent[][] = games.map(() => []);
  for (let day = 0; day < days; day++) {
    for (const team of [0, 1] as const) games.forEach((s, i) => events[i]!.push(...aiTurn(s, rngs[i]!, team)));
    games.forEach((s) => endRound(s));
  }
  return events;
}

describe('contenido de cada partida', () => {
  it('dos partidas con contenidos distintos se juegan a la vez en el mismo proceso', () => {
    const variant = expensiveTanks();
    const normal = newMatch(defaultContent());
    const expensive = newMatch(variant);
    const factory = (s: GameState) => s.buildings.find((building) => buyOptions(s, building).some((option) => option.type === TANK))!;

    const tankCost = (s: GameState) => buyOptions(s, factory(s)).find((option) => option.type === TANK)!.cost;
    expect(tankCost(expensive)).toBe(2 * tankCost(normal));

    const [normalEvents, expensiveEvents] = playInterleaved([normal, expensive], 6);
    // Jugar las dos a la vez no cambia ninguna: la normal hace lo mismo que jugada sola.
    const [alone] = playInterleaved([newMatch(defaultContent())], 6);
    expect(normalEvents).toEqual(alone);
    expect(expensiveEvents).not.toEqual(normalEvents);
    expect(tablesOf(normal).UNIT.cost[TANK]).toBe(defaultContent().tables.UNIT.cost[TANK]);
    expect(expensive.content).toBe(variant);
  });

  it('el contenido no se guarda: lo da quien lee la partida, y las copias lo conservan', () => {
    const variant = expensiveTanks();
    const s = newMatch(variant);
    expect(serialize(s)).not.toContain('tables');
    expect(deserialize(serialize(s), saveContext(variant))!.content).toBe(variant);
    expect(deserialize(serialize(s), saveContext(defaultContent()))!.content).toBe(defaultContent());
    expect(cloneState(s).content).toBe(variant);
  });

  it('el contenido es de solo lectura tambien en los tipos', () => {
    const s = newMatch(defaultContent());
    const write = () => {
      // @ts-expect-error las tablas del contenido no se pueden cambiar
      s.content.tables.UNIT.cost[0] = 1;
    };
    const rename = () => {
      // @ts-expect-error ni los ficheros
      s.content.files.units[0]!.name.es = 'otro';
    };
    // Y en marcha esta congelado: si se fuerza, lanza un error.
    expect(write).toThrow(TypeError);
    expect(rename).toThrow(TypeError);
  });

  it('el contenido es un campo de la partida: sin el no compila, y serialize no lo escribe', () => {
    const s = newMatch(defaultContent());
    const saved = JSON.parse(serialize(s)) as SavedGameState;
    expect(saved).not.toHaveProperty('content');
    expect(Object.keys(saved)).toEqual(Object.keys(s).filter((key) => key !== 'content'));
    // @ts-expect-error lo guardado no es una partida: le falta su contenido
    const bare: GameState = saved;
    expect(bare).toBe(saved);
    // Una copia a mano lo conserva (es un campo normal) y cloneState lo comparte sin copiarlo.
    expect({ ...s }.content).toBe(s.content);
    expect(cloneState(s).content).toBe(s.content);
    expect(cloneState(s)).not.toBe(s);
  });
});
