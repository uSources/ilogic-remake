import { afterEach, describe, expect, it } from 'vitest';
import { aiTurn } from '@core/ai';
import { rulesWith } from '@core/rulesConfig';
import { defaultContent } from '@core/content/default';
import { seededRng } from '@core/geom';
import { blankMap, createLayer, mapGrid } from '@core/mapGrid';
import { createGame, saveContext } from '@core/defaultGames';
import { endReason, groundDistance, newUnit, outcome, score } from '@core/rules';
import { deserialize, serialize } from '@core/save';
import { codeToSeed, seedToCode } from '../src/setup';
import { blankState } from './helpers';

const { UNIT, HQ } = defaultContent().tables;

afterEach(() => {});

describe('nueva partida: tamaños de mapa', () => {
  it.each([20, 32, 40])('mapas de %i: bases conectadas y edificios en proporcion', (size) => {
    for (let seed = 1; seed <= 15; seed++) {
      const s = createGame(seededRng(seed), { size });
      expect(s.map.length).toBe(size);
      expect(mapGrid(s).height).toBe(size);
      const hq0 = s.buildings.find((building) => building.owner === 0 && building.type === HQ)!;
      const hq1 = s.buildings.find((building) => building.owner === 1 && building.type === HQ)!;
      expect(groundDistance(s, hq0, 0, createLayer(s, false)).at(hq1)).toBeGreaterThan(0);
      const neutral = s.buildings.filter((building) => building.owner === null).length;
      expect(neutral).toBeGreaterThanOrEqual(Math.floor((20 * (size * size)) / 1024));
      for (const building of s.buildings) expect(building.x < size && building.y < size).toBe(true);
    }
  });

  it('el mismo codigo da el mismo mapa; el tema se puede elegir', () => {
    const first = createGame(seededRng(1234), { size: 20, theme: 4 });
    const second = createGame(seededRng(1234), { size: 20, theme: 4 });
    expect(serialize(first)).toBe(serialize(second));
    expect(first.theme).toBe(4);
  });

  it('codigos de mapa: ida y vuelta, y codigos no validos', () => {
    for (const seed of [0, 1, 99999, 0xffffffff]) expect(codeToSeed(seedToCode(seed))).toBe(seed);
    expect(codeToSeed('K3F9A2')).toBe(parseInt('k3f9a2', 36));
    expect(codeToSeed('')).toBeNull();
    expect(codeToSeed('ÑÑ')).toBeNull();
    expect(codeToSeed('ZZZZZZZZ')).toBeNull();
  });

  it('una partida guardada se carga con sus propias reglas, no con las de siempre', () => {
    const ruleChanges = { counterattack: false, fog: false, upkeep: 0.25 };
    const rules = rulesWith(defaultContent(), ruleChanges);
    const s = createGame(seededRng(3), { size: 20, ruleChanges });
    expect(s.rules).toEqual(rules);
    expect(deserialize(serialize(s), saveContext(defaultContent()))!.rules).toEqual(rules);
  });

  it('una partida guardada en un mapa de 40 se carga con ese tamaño', () => {
    const s = createGame(seededRng(7), { size: 40 });
    s.setup = { seed: 7, size: 40, theme: null };
    const json = serialize(s);
    const loaded = deserialize(json, saveContext(defaultContent()))!;
    expect(loaded).not.toBeNull();
    expect([mapGrid(loaded).width, mapGrid(loaded).height]).toEqual([40, 40]);
    expect(loaded.setup).toEqual({ seed: 7, size: 40, theme: null });
    expect(deserialize(JSON.stringify({ ...JSON.parse(json), map: blankMap(32).slice(0, 25) }), saveContext(defaultContent()))).toBeNull();
  });
});

describe('limite de dias', () => {
  it('al pasarse el ultimo dia gana quien tenga mas puntos', () => {
    const s = blankState(rulesWith(defaultContent(), { dayLimit: 10 }));
    s.buildings.push({ type: HQ, owner: 0, x: 0, y: 0 }, { type: HQ, owner: 1, x: 9, y: 9 }, { type: 0, owner: 1, x: 5, y: 5 });
    newUnit(s, 1, 0, { x: 1, y: 1 }); // tanque: vale su precio
    s.day = 10;
    expect(outcome(s)).toBe('playing');
    s.day = 11;
    expect(score(s, 0)).toBe(UNIT.cost[1]! + 1000); // tanque entero + su Base
    expect(score(s, 1)).toBe(2000);
    expect(outcome(s)).toBe('won');
    expect(endReason(s)).toBe('days');
  });
});

describe('repetir el turno enemigo', () => {
  it('la IA juega igual desde el mismo estado y la misma semilla', () => {
    const s = createGame(seededRng(3), {});
    for (let i = 0; i < 4; i++) for (const _ of aiTurn(s, seededRng(i), 1));
    const before = serialize(s);
    const ev1 = [...aiTurn(s, seededRng(42), 1)];
    const after = serialize(s);
    const copy = deserialize(before, saveContext(defaultContent()))!;
    const ev2 = [...aiTurn(copy, seededRng(42), 1)];
    expect(ev2).toEqual(ev1);
    expect(serialize(copy)).toBe(after);
  });
});
